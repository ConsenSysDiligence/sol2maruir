import fse from "fs-extra";
import path from "path";
import { gte, lt } from "semver";
import * as sol from "solc-typed-ast";

export function searchRecursive(targetPath: string, filter: (entry: string) => boolean): string[] {
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

let ctr = 0;

function makeArg(
    factory: sol.ASTNodeFactory,
    instances: Map<string, sol.VariableDeclaration>,
    arg: any
): [sol.Expression, sol.Statement[]] {
    if (arg.kind === "literal") {
        if (
            arg.type.startsWith("int") ||
            arg.type.startsWith("uint") ||
            arg.type.startsWith("address")
        ) {
            return [
                factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.TypeConversion,
                    factory.makeElementaryTypeNameExpression("<missing>", arg.type),
                    [
                        factory.makeLiteral(
                            "<missing>",
                            sol.LiteralKind.Number,
                            "",
                            String(arg.value)
                        )
                    ]
                ),
                []
            ];
        }

        if (arg.type.startsWith("byte")) {
            const nBytes = arg.type === "byte" ? 1 : Number(arg.type.slice(5));
            const uintT = factory.makeElementaryTypeNameExpression(
                "<missing>",
                `uint${nBytes * 8}`
            );

            return [
                factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.TypeConversion,
                    factory.makeElementaryTypeNameExpression("<missing>", arg.type),
                    [
                        factory.makeFunctionCall(
                            "<missing>",
                            sol.FunctionCallKind.TypeConversion,
                            uintT,
                            [
                                factory.makeLiteral(
                                    "<missing>",
                                    sol.LiteralKind.Number,
                                    "0x" + BigInt(arg.value[0]).toString(16),
                                    "0x" + BigInt(arg.value[0]).toString(16)
                                )
                            ]
                        )
                    ]
                ),
                []
            ];
        }

        if (arg.type.startsWith("bool")) {
            return [
                factory.makeLiteral("<missing>", sol.LiteralKind.Bool, "", String(arg.value)),
                []
            ];
        }
    }

    if (arg.kind === "string") {
        return [
            factory.makeLiteral("<missing>", sol.LiteralKind.String, "", String(arg.value)),
            []
        ];
    }

    if (arg.kind === "array") {
        const elements: sol.Expression[] = [];
        const stmts: sol.Statement[] = [];

        for (const element of arg.elements) {
            const [el, elStmts] = makeArg(factory, instances, element);

            elements.push(el);
            stmts.push(...elStmts);
        }

        if (arg.sized) {
            return [factory.makeTupleExpression("<missing>", true, elements), stmts];
        }

        const litName = `arr_lit_${ctr++}`;

        stmts.push(
            factory.makeVariableDeclarationStatement(
                [],
                [
                    factory.makeVariableDeclaration(
                        false,
                        false,
                        litName,
                        -1,
                        false,
                        sol.DataLocation.Memory,
                        sol.StateVariableVisibility.Default,
                        sol.Mutability.Mutable,
                        "",
                        undefined,
                        factory.makeArrayTypeName(
                            "",
                            factory.makeElementaryTypeName(arg.type, arg.type)
                        )
                    )
                ]
            ),
            factory.makeExpressionStatement(
                factory.makeAssignment(
                    "",
                    "=",
                    factory.makeIdentifier("", litName, -1),
                    factory.makeFunctionCall(
                        "",
                        sol.FunctionCallKind.FunctionCall,
                        factory.makeNewExpression(
                            "",
                            factory.makeArrayTypeName(
                                "",
                                factory.makeElementaryTypeName(arg.type, arg.type)
                            )
                        ),
                        [
                            factory.makeLiteral(
                                "",
                                sol.LiteralKind.Number,
                                "",
                                String(elements.length)
                            )
                        ]
                    )
                )
            )
        );

        for (let i = 0; i < elements.length; i++) {
            stmts.push(
                factory.makeExpressionStatement(
                    factory.makeAssignment(
                        "",
                        "=",
                        factory.makeIndexAccess(
                            "",
                            factory.makeIdentifier("", litName, -1),
                            factory.makeLiteral("", sol.LiteralKind.Number, "", String(i))
                        ),
                        elements[i]
                    )
                )
            );
        }

        return [factory.makeIdentifier("", litName, -1), stmts];
    }

    if (arg.kind === "bytes") {
        const bytes =
            arg.elements instanceof Array
                ? arg.elements.map((element: any) => element.replace("0x", "")).join("")
                : arg.elements;

        return [factory.makeLiteral("<missing>", sol.LiteralKind.HexString, bytes, ""), []];
    }

    if (arg.kind === "object") {
        const instance = instances.get("__" + arg.name + "__");

        sol.assert(instance !== undefined, "Unable to find associated var for {0}", arg.name);

        return [factory.makeIdentifierFor(instance), []];
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

function composeTypeForRet(factory: sol.ASTNodeFactory, ret: any): sol.TypeName {
    let type: sol.TypeName;

    if (ret.kind === "literal") {
        type = factory.makeElementaryTypeName(ret.type, ret.type);
    } else if (ret.kind === "string" || ret.kind === "bytes") {
        type = factory.makeElementaryTypeName("<missing>", ret.kind);
    } else if (ret.kind === "array") {
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

    return type;
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
        loc =
            ret.location && ret.location !== sol.DataLocation.CallData
                ? (ret.location as sol.DataLocation)
                : sol.DataLocation.Memory;
        type = factory.makeElementaryTypeName("<missing>", ret.kind);
    } else if (ret.kind === "array") {
        loc =
            ret.location && ret.location !== sol.DataLocation.CallData
                ? (ret.location as sol.DataLocation)
                : sol.DataLocation.Memory;
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

function composeFailCheck(
    factory: sol.ASTNodeFactory,
    instances: Map<string, sol.VariableDeclaration>,
    inference: sol.InferType,
    call: sol.FunctionCall,
    step: any
): [sol.Statement[], boolean] {
    const isError = step.expectedRequireFail || step.expectedExplicitRevert;

    if (gte(inference.version, "0.6.0")) {
        return [
            [
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
                                            isError ? "true" : "false"
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
                                    [
                                        factory.makeLiteral(
                                            "<missing>",
                                            sol.LiteralKind.Bool,
                                            "",
                                            isError ? "false" : "true"
                                        )
                                    ]
                                )
                            )
                        ])
                    )
                ])
            ],
            false
        ];
    }

    /**
     * In <0.6.0 emit a:
     *
     * data = abi.encodeWithSignature(sig, ...args);
     * res = address(__this__).call(data);
     * assert(!res);
     */
    return [
        [
            factory.makeExpressionStatement(
                factory.makeAssignment(
                    "<missing>",
                    "=",
                    factory.makeIdentifier("<missing>", "data", -1),
                    factory.makeFunctionCall(
                        "<mssing>",
                        sol.FunctionCallKind.FunctionCall,
                        factory.makeMemberAccess(
                            "",
                            factory.makeIdentifier("", "abi", -1),
                            "encodeWithSignature",
                            -1
                        ),
                        [
                            factory.makeLiteral(
                                "",
                                sol.LiteralKind.String,
                                "",
                                inference.signature(
                                    call.vReferencedDeclaration as sol.FunctionDefinition
                                )
                            ),
                            ...call.vArguments
                        ]
                    )
                )
            ),
            factory.makeExpressionStatement(
                factory.makeAssignment(
                    "",
                    "=",
                    lt(inference.version, "0.5.0")
                        ? factory.makeIdentifier("", "res", -1)
                        : factory.makeTupleExpression("", false, [
                              factory.makeIdentifier("", "res", -1),
                              factory.makeIdentifier("", "retData", -1)
                          ]),
                    factory.makeFunctionCall(
                        "",
                        sol.FunctionCallKind.FunctionCall,
                        factory.makeMemberAccess(
                            "",
                            factory.makeFunctionCall(
                                "",
                                sol.FunctionCallKind.TypeConversion,
                                factory.makeElementaryTypeNameExpression("", "address"),
                                [factory.makeIdentifier("", "__this__", -1)]
                            ),
                            "call",
                            -1
                        ),
                        [factory.makeIdentifier("", "data", -1)]
                    )
                )
            ),
            factory.makeExpressionStatement(
                factory.makeFunctionCall(
                    "",
                    sol.FunctionCallKind.FunctionCall,
                    factory.makeIdentifier("", "assert", -1),
                    [
                        factory.makeUnaryOperation(
                            "",
                            true,
                            "!",
                            factory.makeIdentifier("", "res", -1)
                        )
                    ]
                )
            )
        ],
        true
    ];
}

function composeStepCheck(
    factory: sol.ASTNodeFactory,
    instances: Map<string, sol.VariableDeclaration>,
    inference: sol.InferType,
    call: sol.FunctionCall,
    step: any
): [sol.Statement[], boolean] {
    if (step.nameReturns) {
        // Skip - only one sample that is easy to process manually
        return [[], false];
    }

    if (step.expectedReturns) {
        if (step.expectedReturns.length === 0) {
            return [[factory.makeExpressionStatement(call)], false];
        }

        const stmts: sol.Statement[] = [];

        const expects: sol.Expression[] = [];
        const expectTs: sol.TypeName[] = [];
        const rets: sol.VariableDeclaration[] = [];

        for (let i = 0; i < step.expectedReturns.length; i++) {
            const ret = step.expectedReturns[i];
            const [expV, expStmts] = makeArg(factory, instances, ret);
            stmts.push(...expStmts);

            const varRet = composeVarForRet(factory, `ret_${call.id}_${i}`, ret);

            expects.push(expV);
            expectTs.push(composeTypeForRet(factory, ret));
            rets.push(varRet);
        }

        const varRetsAssign = factory.makeVariableDeclarationStatement(
            rets.map((v) => v.id),
            rets,
            call
        );

        stmts.push(varRetsAssign);

        for (let i = 0; i < expects.length; i++) {
            const ret = rets[i];
            const expectT = expectTs[i];

            let retCompareExpr: sol.Expression = factory.makeIdentifierFor(ret);
            let expectCompareExpr: sol.Expression = expects[i];

            if (
                (expectT instanceof sol.ElementaryTypeName &&
                    (expectT.name === "string" || expectT.name === "bytes")) ||
                expectT instanceof sol.ArrayTypeName
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

        return [stmts, false];
    }

    return composeFailCheck(factory, instances, inference, call, step);
}

function addValueToCallee(
    factory: sol.ASTNodeFactory,
    callee: sol.Expression,
    value: bigint,
    version: string
): sol.Expression {
    if (value === 0n) {
        return callee;
    }

    if (lt(version, "0.6.2")) {
        // Add .value
        if (callee instanceof sol.NewExpression) {
            callee = factory.makeTupleExpression("", false, [callee]);
        }

        return factory.makeFunctionCall(
            "",
            sol.FunctionCallKind.FunctionCall,
            factory.makeMemberAccess("", callee, "value", -1),
            [factory.makeLiteral("uint256", sol.LiteralKind.Number, "", String(value))]
        );
    }

    return factory.makeFunctionCallOptions(
        "",
        callee,
        new Map([
            ["value", factory.makeLiteral("uint256", sol.LiteralKind.Number, "", String(value))]
        ])
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

    if (unit.vPragmaDirectives.length === 0) {
        unit.appendChild(factory.makePragmaDirective(["solidity", result.compilerVersion]));
    }

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

            const preCallStmts: sol.Statement[] = [];
            const args: sol.Expression[] = [];

            const value: bigint = step.value !== undefined ? step.value : 0n;

            for (const jsArg of step.args.slice(1)) {
                const [arg, argStmts] = makeArg(factory, instances, jsArg);

                args.push(arg);
                preCallStmts.push(...argStmts);
            }

            if (step.method === "constructor") {
                const call = constrs.get(varName);
                sol.assert(call !== undefined, "Unable to find associated call for {0}", varName);

                if (value !== 0n) {
                    call.vExpression = addValueToCallee(
                        factory,
                        call.vExpression,
                        value,
                        inference.version
                    );
                }

                if (step.args.length === 1) {
                    continue;
                }

                sol.assert(
                    preCallStmts.length === 0,
                    `Unsupported pre-call statements for constructor`
                );
                call.vArguments.push(...args);

                call.acceptChildren();
            } else {
                const name = step.method.slice(0, step.method.indexOf("("));
                const def = resolveCallee(units, inference, step.mdc, name);

                const instance = instances.get(varName);

                sol.assert(
                    instance !== undefined,
                    "Unable to find associated var for {0}",
                    varName
                );

                let callee: sol.Expression = factory.makeMemberAccess(
                    "<missing>",
                    factory.makeIdentifierFor(instance),
                    name,
                    def.id
                );

                if (value !== 0n) {
                    callee = addValueToCallee(factory, callee, value, inference.version);
                }

                const call = factory.makeFunctionCall(
                    "<missing>",
                    sol.FunctionCallKind.FunctionCall,
                    callee,
                    args
                );

                const testCaseArgs = [...instances.values()].map((v) => factory.copy(v));
                const [stmts, needsFailVars] = composeStepCheck(
                    factory,
                    instances,
                    inference,
                    call,
                    step
                );
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
                    factory.makeBlock([...preCallStmts, ...stmts])
                );

                if (needsFailVars) {
                    const body = testCaseFn.vBody as sol.Block;
                    body.insertAtBeginning(
                        factory.makeVariableDeclarationStatement(
                            [],
                            [
                                factory.makeVariableDeclaration(
                                    false,
                                    false,
                                    `data`,
                                    -1,
                                    false,
                                    sol.DataLocation.Memory,
                                    sol.StateVariableVisibility.Default,
                                    sol.Mutability.Mutable,
                                    "bytes memory",
                                    undefined,
                                    factory.makeElementaryTypeName("<missing>", "bytes")
                                )
                            ]
                        )
                    );

                    body.insertAtBeginning(
                        factory.makeVariableDeclarationStatement(
                            [],
                            [
                                factory.makeVariableDeclaration(
                                    false,
                                    false,
                                    `retData`,
                                    -1,
                                    false,
                                    sol.DataLocation.Memory,
                                    sol.StateVariableVisibility.Default,
                                    sol.Mutability.Mutable,
                                    "bytes memory",
                                    undefined,
                                    factory.makeElementaryTypeName("<missing>", "bytes")
                                )
                            ]
                        )
                    );
                    body.insertAtBeginning(
                        factory.makeVariableDeclarationStatement(
                            [],
                            [
                                factory.makeVariableDeclaration(
                                    false,
                                    false,
                                    `res`,
                                    -1,
                                    false,
                                    sol.DataLocation.Default,
                                    sol.StateVariableVisibility.Default,
                                    sol.Mutability.Mutable,
                                    "bool",
                                    undefined,
                                    factory.makeElementaryTypeName("<missing>", "bool")
                                )
                            ]
                        )
                    );
                }

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
