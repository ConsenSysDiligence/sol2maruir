import fse from "fs-extra";
import path from "path";
import { gte } from "semver";
import * as sol from "solc-typed-ast";

function searchRecursive(targetPath: string, filter: (entry: string) => boolean): string[] {
    const stat = fse.statSync(targetPath);
    const results: string[] = [];

    if (stat.isFile()) {
        if (filter(targetPath)) {
            results.push(path.resolve(targetPath));
        }

        return results;
    }

    for (const entry of fse.readdirSync(targetPath)) {
        const resolvedEntry = path.resolve(targetPath, entry);
        const stat = fse.statSync(resolvedEntry);

        if (stat.isDirectory()) {
            results.push(...searchRecursive(resolvedEntry, filter));
        } else if (stat.isFile() && filter(resolvedEntry)) {
            results.push(resolvedEntry);
        }
    }

    return results;
}

function createTestCaseContract(
    factory: sol.ASTNodeFactory
): [sol.ContractDefinition, sol.FunctionDefinition] {
    const contract = factory.makeContractDefinition(
        "__IRTest__",
        0,
        sol.ContractKind.Contract,
        false,
        true,
        [],
        [],
        undefined,
        []
    );

    const main = factory.makeFunctionDefinition(
        contract.id,
        sol.FunctionKind.Function,
        "main",
        false,
        sol.FunctionVisibility.Public,
        sol.FunctionStateMutability.NonPayable,
        false,
        factory.makeParameterList([]),
        factory.makeParameterList([]),
        [],
        undefined,
        factory.makeBlock([])
    );

    contract.appendChild(main);

    return [contract, main];
}

function makeArg(
    factory: sol.ASTNodeFactory,
    instances: Map<string, sol.VariableDeclaration>,
    arg: any
): sol.Expression {
    if (arg.kind === "literal") {
        if (
            arg.type.startsWith("int") ||
            arg.type.startsWith("uint") ||
            arg.type.startsWith("address") ||
            arg.type.startsWith("byte")
        ) {
            return factory.makeFunctionCall(
                "<missing>",
                sol.FunctionCallKind.TypeConversion,
                factory.makeElementaryTypeNameExpression("<missing>", arg.type),
                [factory.makeLiteral("<missing>", sol.LiteralKind.Number, "", String(arg.value))]
            );
        }

        if (arg.type.startsWith("bool")) {
            return factory.makeLiteral("<missing>", sol.LiteralKind.Bool, "", String(arg.value));
        }
    }

    if (arg.kind === "string") {
        return factory.makeLiteral("<missing>", sol.LiteralKind.String, "", String(arg.value));
    }

    if (arg.kind === "array") {
        return factory.makeTupleExpression(
            "<missing>",
            true,
            arg.elements.map((element: any) => makeArg(factory, instances, element))
        );
    }

    if (arg.kind === "bytes") {
        const bytes =
            arg.elements instanceof Array
                ? arg.elements.map((element: any) => element.replace("0x", "")).join("")
                : arg.elements;

        return factory.makeLiteral("<missing>", sol.LiteralKind.HexString, bytes, "");
    }

    if (arg.kind === "object") {
        const instance = instances.get("__" + arg.name + "__");

        sol.assert(instance !== undefined, "Unable to find associated var for {0}", arg.name);

        return factory.makeIdentifierFor(instance);
    }

    throw new Error(
        "Unable to make expression for kind for arg " + JSON.stringify(arg, undefined, 4)
    );
}

function resolveContractDefinition(
    units: sol.SourceUnit[],
    inference: sol.InferType,
    name: string
): sol.ContractDefinition {
    for (const unit of units) {
        const defs = sol.resolveAny(name, unit, inference, true);

        if (defs.size > 0) {
            const def = [...defs][0];

            sol.assert(
                def instanceof sol.ContractDefinition,
                'Expected contract definition, got "{0}"',
                def
            );

            return def;
        }
    }

    throw new Error(`Unable to resolve "${name}" to anything`);
}

function resolveCallee(
    units: sol.SourceUnit[],
    inference: sol.InferType,
    mdc: string,
    name: string
): sol.FunctionDefinition | sol.VariableDeclaration {
    const defs = sol.resolveAny(
        name,
        resolveContractDefinition(units, inference, mdc),
        inference,
        true
    );

    if (defs.size > 0) {
        const def = [...defs][0];

        sol.assert(
            def instanceof sol.FunctionDefinition || def instanceof sol.VariableDeclaration,
            'Expected function or variable, got "{0}"',
            def
        );

        return def;
    }

    throw new Error(`Unable to resolve "${name}" of "${mdc}" to anything`);
}

function composeVarForRet(
    factory: sol.ASTNodeFactory,
    name: string,
    ret: any
): sol.VariableDeclaration {
    let loc: sol.DataLocation;
    let type: sol.TypeName;

    if (ret.kind === "literal") {
        loc = sol.DataLocation.Default;
        type = factory.makeElementaryTypeName(ret.type, ret.type);
    } else if (ret.kind === "string" || ret.kind === "bytes") {
        loc = ret.location ? (ret.location as sol.DataLocation) : sol.DataLocation.Memory;
        type = factory.makeElementaryTypeName("<missing>", ret.kind);
    } else if (ret.kind === "array") {
        loc = ret.location ? (ret.location as sol.DataLocation) : sol.DataLocation.Memory;
        type = factory.makeArrayTypeName(
            "<missing>",
            factory.makeElementaryTypeName("<missing>", ret.type),
            ret.sized
                ? factory.makeLiteral("<missing>", sol.LiteralKind.Number, "", String(ret.size))
                : undefined
        );
    } else {
        throw new Error(`Unsupported ret kind "${ret.kind}"`);
    }

    return factory.makeVariableDeclaration(
        false,
        false,
        name,
        0,
        false,
        loc,
        sol.StateVariableVisibility.Default,
        sol.Mutability.Mutable,
        "<missing>",
        undefined,
        type
    );
}

function composeStepCheck(
    factory: sol.ASTNodeFactory,
    instances: Map<string, sol.VariableDeclaration>,
    inference: sol.InferType,
    call: sol.FunctionCall,
    step: any
): sol.Statement[] {
    if (step.nameReturns) {
        // Skip - only one sample that is easy to process manually
        return [];
    }

    if (step.expectedReturns) {
        if (step.expectedReturns.length === 0) {
            return [factory.makeExpressionStatement(call)];
        }

        const stmts: sol.Statement[] = [];

        const expects: sol.VariableDeclaration[] = [];
        const rets: sol.VariableDeclaration[] = [];

        for (let i = 0; i < step.expectedReturns.length; i++) {
            const ret = step.expectedReturns[i];

            const varExpect = composeVarForRet(factory, `expect_${call.id}_${i}`, ret);

            varExpect.vValue = makeArg(factory, instances, ret);

            const varRet = composeVarForRet(factory, `ret_${call.id}_${i}`, ret);

            expects.push(varExpect);
            rets.push(varRet);
        }

        const varExpectAssign = factory.makeVariableDeclarationStatement(
            expects.map((v) => v.id),
            expects,
            factory.makeTupleExpression(
                "<missing>",
                false,
                expects.map((v) => {
                    const val = v.vValue as sol.Expression;

                    v.vValue = undefined;

                    return val;
                })
            )
        );

        const varRetsAssign = factory.makeVariableDeclarationStatement(
            rets.map((v) => v.id),
            rets,
            call
        );

        stmts.push(varExpectAssign, varRetsAssign);

        for (let i = 0; i < expects.length; i++) {
            const ret = rets[i];
            const expect = expects[i];

            let retCompareExpr: sol.Expression = factory.makeIdentifierFor(ret);
            let expectCompareExpr: sol.Expression = factory.makeIdentifierFor(expect);

            if (
                (expect.vType instanceof sol.ElementaryTypeName &&
                    (expect.vType.name === "string" || expect.vType.name === "bytes")) ||
                expect.vType instanceof sol.ArrayTypeName
            ) {
                retCompareExpr = factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.FunctionCall,
                    factory.makeIdentifier("<missing>", "keccak256", -1),
                    [
                        factory.makeFunctionCall(
                            "<missing>",
                            sol.FunctionCallKind.FunctionCall,
                            factory.makeMemberAccess(
                                "<missing>",
                                factory.makeIdentifier("<missing>", "abi", -1),
                                "encodePacked",
                                -1
                            ),
                            [retCompareExpr]
                        )
                    ]
                );

                expectCompareExpr = factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.FunctionCall,
                    factory.makeIdentifier("<missing>", "keccak256", -1),
                    [
                        factory.makeFunctionCall(
                            "<missing>",
                            sol.FunctionCallKind.FunctionCall,
                            factory.makeMemberAccess(
                                "<missing>",
                                factory.makeIdentifier("<missing>", "abi", -1),
                                "encodePacked",
                                -1
                            ),
                            [expectCompareExpr]
                        )
                    ]
                );
            }

            const check = factory.makeFunctionCall(
                "<missing>",
                sol.FunctionCallKind.FunctionCall,
                factory.makeIdentifier("<missing>", "assert", -1),
                [factory.makeBinaryOperation("bool", "==", retCompareExpr, expectCompareExpr)]
            );

            stmts.push(factory.makeExpressionStatement(check));
        }

        return stmts;
    }

    if (step.expectedAssertFail && gte(inference.version, "0.6.0")) {
        return [
            factory.makeTryStatement(call, [
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "Error",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ]),
                    factory.makeParameterList([
                        factory.makeVariableDeclaration(
                            false,
                            false,
                            "reason",
                            0,
                            false,
                            sol.DataLocation.Memory,
                            sol.StateVariableVisibility.Default,
                            sol.Mutability.Mutable,
                            "<missing>",
                            undefined,
                            factory.makeElementaryTypeName("<missing>", "string")
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [factory.makeLiteral("<missing>", sol.LiteralKind.Bool, "", "true")]
                            )
                        )
                    ])
                )
            ])
        ];
    }

    if (step.expectedAssertFail) {
        sol.assert(
            gte(inference.version, "0.6.0"),
            "Unable to handle step.expectedAssertFail in Solidity below 0.6.0"
        );

        return [
            factory.makeTryStatement(call, [
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "Error",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ]),
                    factory.makeParameterList([
                        factory.makeVariableDeclaration(
                            false,
                            false,
                            "reason",
                            0,
                            false,
                            sol.DataLocation.Memory,
                            sol.StateVariableVisibility.Default,
                            sol.Mutability.Mutable,
                            "<missing>",
                            undefined,
                            factory.makeElementaryTypeName("<missing>", "string")
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [factory.makeLiteral("<missing>", sol.LiteralKind.Bool, "", "true")]
                            )
                        )
                    ])
                )
            ])
        ];
    }

    if (step.expectedRequireFail || step.expectedExplicitRevert) {
        sol.assert(
            gte(inference.version, "0.6.0"),
            "Unable to handle step.expectedRequireFail in Solidity below 0.6.0"
        );

        return [
            factory.makeTryStatement(call, [
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "Error",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [factory.makeLiteral("<missing>", sol.LiteralKind.Bool, "", "true")]
                            )
                        )
                    ]),
                    factory.makeParameterList([
                        factory.makeVariableDeclaration(
                            false,
                            false,
                            "reason",
                            0,
                            false,
                            sol.DataLocation.Memory,
                            sol.StateVariableVisibility.Default,
                            sol.Mutability.Mutable,
                            "<missing>",
                            undefined,
                            factory.makeElementaryTypeName("<missing>", "string")
                        )
                    ])
                ),
                factory.makeTryCatchClause(
                    "",
                    factory.makeBlock([
                        factory.makeExpressionStatement(
                            factory.makeFunctionCall(
                                "<missing>",
                                sol.FunctionCallKind.FunctionCall,
                                factory.makeIdentifier("<missing>", "assert", -1),
                                [
                                    factory.makeLiteral(
                                        "<missing>",
                                        sol.LiteralKind.Bool,
                                        "",
                                        "false"
                                    )
                                ]
                            )
                        )
                    ])
                )
            ])
        ];
    }

    throw new Error(
        "Unable to compose statements to check step " + JSON.stringify(step, undefined, 4)
    );
}

async function composeSolidityFromConfig(config: any): Promise<string> {
    const result = await sol.compileSol(
        config.file,
        "compilerVersion" in config ? config.compilerVersion : "auto"
    );

    sol.assert(result.compilerVersion !== undefined, "Expected compiler version to be defined");

    const context = new sol.ASTContext();
    const reader = new sol.ASTReader(context);
    const inference = new sol.InferType(result.compilerVersion);

    const units = reader.read(result.data);

    const writer = new sol.ASTWriter(
        sol.DefaultASTWriterMapping,
        new sol.PrettyFormatter(4, 0),
        result.compilerVersion
    );

    /**
     * We need to augment only a main file,
     * so skipping the rest of the source units.
     */
    const unit = units.find(
        (unit) => path.basename(unit.sourceEntryKey) === path.basename(config.file)
    );

    sol.assert(unit !== undefined, "Unable to detect target source unit");

    const factory = new sol.ASTNodeFactory(context);

    const [contract, main] = createTestCaseContract(factory);

    contract.scope = unit.id;

    unit.appendChild(contract);

    const body = main.vBody as sol.Block;

    const constrs = new Map<string, sol.FunctionCall>();
    const instances = new Map<string, sol.VariableDeclaration>();

    for (const step of config.steps) {
        if (step.act === "define") {
            const def = resolveContractDefinition(units, inference, step.type);

            const type = factory.makeUserDefinedTypeName(`contract ${def.name}`, def.name, def.id);

            const variable = factory.makeVariableDeclaration(
                false,
                false,
                "__" + step.name + "__",
                body.id,
                false,
                sol.DataLocation.Default,
                sol.StateVariableVisibility.Default,
                sol.Mutability.Mutable,
                type.typeString,
                undefined,
                type
            );

            const args: sol.Expression[] = [];

            // @todo No support for setting balance here. Watch out.
            const call = factory.makeFunctionCall(
                type.typeString,
                sol.FunctionCallKind.FunctionCall,
                factory.makeNewExpression(`type(${type.typeString})`, type),
                args
            );

            const stmt = factory.makeVariableDeclarationStatement([variable.id], [variable], call);

            body.appendChild(stmt);

            constrs.set(variable.name, call);
            instances.set(variable.name, variable);

            continue;
        }

        if (step.act === "call") {
            const varName = "__" + step.args[0].name + "__";

            if (step.method === "constructor") {
                if (step.args.length === 1) {
                    continue;
                }

                const call = constrs.get(varName);

                sol.assert(call !== undefined, "Unable to find associated call for {0}", varName);

                const argExprs = step.args
                    .slice(1)
                    .map((arg: any) => makeArg(factory, instances, arg));

                call.vArguments.push(...argExprs);
            } else {
                const name = step.method.slice(0, step.method.indexOf("("));
                const def = resolveCallee(units, inference, step.mdc, name);

                const instance = instances.get(varName);

                sol.assert(
                    instance !== undefined,
                    "Unable to find associated var for {0}",
                    varName
                );

                const callee = factory.makeMemberAccess(
                    "<missing>",
                    factory.makeIdentifierFor(instance),
                    name,
                    def.id
                );

                const call = factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.FunctionCall,
                    callee,
                    step.args.slice(1).map((arg: any) => makeArg(factory, instances, arg))
                );

                const testCaseArgs = [...instances.values()].map((v) => factory.copy(v));
                const testCaseFn = factory.makeFunctionDefinition(
                    contract.id,
                    sol.FunctionKind.Function,
                    "__testCase" + call.id + "__",
                    false,
                    sol.FunctionVisibility.Internal,
                    sol.FunctionStateMutability.NonPayable,
                    false,
                    factory.makeParameterList(testCaseArgs),
                    factory.makeParameterList([]),
                    [],
                    undefined,
                    factory.makeBlock(composeStepCheck(factory, instances, inference, call, step))
                );

                contract.appendChild(testCaseFn);

                body.appendChild(
                    factory.makeExpressionStatement(
                        factory.makeFunctionCall(
                            "<missing>",
                            sol.FunctionCallKind.FunctionCall,
                            factory.makeIdentifierFor(testCaseFn),
                            testCaseArgs.map((v) => factory.makeIdentifierFor(v))
                        )
                    )
                );
            }

            continue;
        }

        if (step.act === "validateBySnapshot") {
            // Skip - there is nothing to do
            continue;
        }

        throw new Error(`Unsupported step action "${step.act}"`);
    }

    return writer.write(unit);
}

async function main(): Promise<void> {
    const configs = searchRecursive("test/samples/solidity", (fileName) =>
        fileName.endsWith(".config.json")
    );

    const failing = [];

    for (const inFile of configs) {
        console.log(inFile);

        const outFile = inFile.replace(".config.json", ".config.sol");

        try {
            const config = await fse.readJson(inFile, { encoding: "utf-8" });
            const source = await composeSolidityFromConfig(config);

            await fse.writeFile(outFile, source, { encoding: "utf-8" });

            /**
             * Check that we can compile rewritten source
             */
            await sol.compileSol(
                outFile,
                "compilerVersion" in config ? config.compilerVersion : "auto"
            );
        } catch (e: unknown) {
            console.error(e);

            failing.push(outFile);
        }
    }

    if (failing.length) {
        console.log("Failed to recompile", failing);
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);

        process.exit(1);
    });
