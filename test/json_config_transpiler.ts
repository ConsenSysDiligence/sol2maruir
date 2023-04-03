import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { noSrc } from "maru-ir2";
import {
    ABIEncoderVersion,
    assert,
    ContractDefinition,
    FunctionDefinition,
    InferType,
    pp
} from "solc-typed-ast";
import { UIDGenerator } from "../src";
import { IRFactory } from "../src/building/factory";
import {
    balancesMapPtrT,
    blockPtrT,
    blockT,
    boolT,
    msgPtrT,
    noType,
    u160,
    u256,
    u8
} from "../src/building/typing";
import { ASTSource } from "../src/ir/source";
import { BaseFunctionCompiler } from "../src/building/base_function_compiler";
import { ExpressionCompiler } from "../src/building/expression_compiler";

export type MethodMap = Map<string, Map<string, ir.FunctionDefinition>>;
export type ContractMap = Map<string, ir.StructDefinition>;

export function buildMaps(defs: ir.Definition[], solVersion: string): [MethodMap, ContractMap] {
    const mMap = new Map<string, Map<string, ir.FunctionDefinition>>();
    const cMap = new Map<string, ir.StructDefinition>();

    const infer = new InferType(solVersion);

    for (const def of defs) {
        if (
            def instanceof ir.StructDefinition &&
            def.src instanceof ASTSource &&
            def.src.nd instanceof ContractDefinition
        ) {
            cMap.set(def.src.nd.name, def);
        }

        if (def instanceof ir.FunctionDefinition) {
            let contract: ContractDefinition;
            let sig: string;

            // Implicit constructor
            if (def.src instanceof ASTSource && def.src.nd instanceof ContractDefinition) {
                contract = def.src.nd;
                sig = "constructor";
            } else if (
                def.src instanceof ASTSource &&
                def.src.nd instanceof FunctionDefinition &&
                def.src.nd.vScope instanceof ContractDefinition
            ) {
                contract = def.src.nd.vScope;

                sig = def.name.includes("_constructor")
                    ? "constructor"
                    : infer.signature(def.src.nd);
            } else {
                continue;
            }

            if (!mMap.has(contract.name)) {
                mMap.set(contract.name, new Map());
            }

            /// @todo: This is buggy when there is overloading. It should work for just main functions.
            (mMap.get(contract.name) as Map<string, ir.FunctionDefinition>).set(sig, def);
        }
    }

    return [mMap, cMap];
}

export class JSONConfigTranspiler extends BaseFunctionCompiler {
    private readonly factory: IRFactory;
    private nGlboals = 0;
    private exprCompiler: ExpressionCompiler;

    constructor(
        solVersion: string,
        abiVersion: ABIEncoderVersion,
        factory: IRFactory,
        globalUid: UIDGenerator,
        globalScope: ir.Scope,
        private config: any,
        private methodMap: Map<string, Map<string, ir.FunctionDefinition>>,
        private contractMap: Map<string, ir.StructDefinition>,
        unit: sol.SourceUnit
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
        this.factory = factory;
        this.exprCompiler = new ExpressionCompiler(this.cfgBuilder, abiVersion, unit);
    }

    extraLocals: ir.VariableDeclaration[] = [];

    getNewGlobal(
        t: ir.Type,
        initialVal: ir.GlobalVarLiteral,
        prefix: string | undefined
    ): ir.Identifier {
        const name = `${prefix !== undefined ? prefix : "_json_glob_"}${this.nGlboals++}`;

        this.globalScope.define(this.factory.globalVariable(ir.noSrc, name, t, initialVal));

        return this.factory.identifier(ir.noSrc, name, t);
    }

    compileJSType(strType: string, arg: any): ir.Type {
        if (strType === "bool") {
            return boolT;
        }

        if (strType === "byte") {
            return u8;
        }

        if (strType === "address") {
            return u160;
        }

        if (strType === "bytes") {
            return this.factory.pointerType(
                ir.noSrc,
                u8,
                this.factory.memConstant(ir.noSrc, arg.location)
            );
        }

        const fixedBytesRx = /bytes([0-9]+)/;

        let m = strType.match(fixedBytesRx);

        if (m) {
            const nBytes = Number(m[1]);

            return this.factory.intType(ir.noSrc, nBytes * 8, false);
        }

        const rx = /(u?)int([0-9]*)/;

        m = strType.match(rx);

        if (m) {
            const signed = m[1] !== "u";
            const nbits = Number(m[2]);

            return this.factory.intType(ir.noSrc, nbits, signed);
        }

        throw new Error(`NYI transpiling JS type ${strType}`);
    }

    compileJSArg(arg: any): ir.Expression {
        const factory = this.factory;
        const builder = this.cfgBuilder;

        if (arg.kind === "object") {
            return factory.identifier(ir.noSrc, arg.name, builder.typeOfLocal(arg.name));
        }

        if (arg.kind === "literal") {
            const litT = this.compileJSType(arg.type, arg);

            if (litT instanceof ir.BoolType) {
                return factory.booleanLiteral(ir.noSrc, arg.value);
            }

            if (litT instanceof ir.IntType) {
                if (arg.type.startsWith("bytes")) {
                    return factory.numberLiteral(ir.noSrc, BigInt("0x" + arg.value), 16, litT);
                }

                return factory.numberLiteral(ir.noSrc, BigInt(arg.value), 10, litT);
            }

            throw new Error(`NYI transpiling JS value ${litT.pp()}`);
        }

        if (arg.kind === "bytes") {
            const byteStr = arg.elements;

            assert(byteStr.length % 2 === 0, ``);

            const values: bigint[] = [];

            for (let i = 0; i < byteStr.length / 2; i++) {
                values.push(BigInt("0x" + byteStr.slice(2 * i, 2 * i + 2)));
            }

            const loc = factory.memConstant(ir.noSrc, arg.location);

            return this.getNewGlobal(
                factory.pointerType(
                    ir.noSrc,
                    factory.userDefinedType(ir.noSrc, "ArrWithLen", [loc], [u8]),
                    loc
                ),
                factory.structLiteral(ir.noSrc, [
                    ["len", factory.numberLiteral(ir.noSrc, BigInt(values.length), 10, u256)],
                    [
                        "arr",
                        factory.arrayLiteral(
                            ir.noSrc,
                            values.map((v) => factory.numberLiteral(ir.noSrc, v, 10, u8))
                        )
                    ]
                ]),
                "_arg_"
            );
        }

        if (arg.kind === "string") {
            return builder.getStrLit(arg.value, noSrc);
        }

        if (arg.kind === "array") {
            const arr: ir.ArrayLiteral = factory.arrayLiteral(ir.noSrc, []);
            const typ: ir.Type = this.compileJSType(arg.type, arg);

            for (const el of arg.elements) {
                const elV = this.compileJSArg(el);
                if (!(elV instanceof ir.NumberLiteral || elV instanceof ir.BooleanLiteral)) {
                    throw new Error(`NYI transpiling arrays like ${pp(arg)}`);
                }

                arr.values.push(elV);
            }

            const loc = factory.memConstant(ir.noSrc, "exception");

            return this.getNewGlobal(
                factory.pointerType(
                    ir.noSrc,
                    factory.userDefinedType(ir.noSrc, "ArrWithLen", [loc], [typ]),
                    loc
                ),
                factory.structLiteral(ir.noSrc, [
                    ["len", factory.numberLiteral(ir.noSrc, BigInt(arr.values.length), 10, u256)],
                    ["arr", arr]
                ]),
                "_arg_"
            );
        }

        throw new Error(`NYI transpiling JS kind ${arg.kind}`);
    }

    compile(): ir.FunctionDefinition {
        const builder = this.cfgBuilder;
        const factory = this.factory;

        builder.addIRLocal("block", blockPtrT, ir.noSrc);
        builder.addIRLocal("msg", msgPtrT, ir.noSrc);

        let lCtr = 0;
        let lastObjName: string | undefined;
        let lastContractName: string | undefined;

        const constuctionFollowups: Map<string, ir.Statement[]> = new Map();

        builder.allocStruct(
            factory.identifier(ir.noSrc, "block", blockPtrT),
            blockT,
            factory.memConstant(ir.noSrc, "memory"),
            ir.noSrc
        );

        builder.storeField(
            factory.identifier(ir.noSrc, "block", blockPtrT),
            "number",
            factory.numberLiteral(ir.noSrc, 1n, 10, u256),
            ir.noSrc
        );

        for (const step of this.config.steps) {
            if (
                lastObjName !== undefined &&
                lastContractName !== undefined &&
                (step.act !== "call" || step.method !== "constructor")
            ) {
                builder.transCall(
                    [
                        factory.identifier(noSrc, lastObjName, builder.typeOfLocal(lastObjName)),
                        builder.getTmpId(boolT)
                    ],
                    factory.identifier(ir.noSrc, `${lastContractName}_constructor`, noType),
                    [],
                    [],
                    [
                        factory.identifier(noSrc, "block", blockPtrT),
                        factory.identifier(noSrc, "msg", msgPtrT)
                    ],
                    ir.noSrc
                );

                const followups = constuctionFollowups.get(lastObjName);

                if (followups) {
                    followups.forEach((followup) => builder.addStmt(followup));
                    constuctionFollowups.delete(lastObjName);
                }

                lastObjName = undefined;
                lastContractName = undefined;
            }

            if (step.act === "define") {
                lastObjName = step.name;
                lastContractName = step.type;

                const def = this.contractMap.get(lastContractName as string) as ir.StructDefinition;
                const thisT = factory.pointerType(
                    noSrc,
                    factory.userDefinedType(noSrc, def?.name, [], []),
                    factory.memConstant(noSrc, "storage")
                );

                builder.addIRLocal(lastObjName as string, thisT, ir.noSrc);

                const followups: ir.Statement[] = [];

                if (step.address) {
                    followups.push(
                        factory.storeField(
                            ir.noSrc,
                            factory.identifier(noSrc, lastObjName as string, thisT),
                            "__address__",
                            this.compileJSArg(step.address)
                        )
                    );
                }

                if (step.balance) {
                    const addr = builder.getTmpId(u160, ir.noSrc);
                    followups.push(
                        factory.loadField(
                            ir.noSrc,
                            addr,
                            factory.identifier(noSrc, lastObjName as string, thisT),
                            "__address__"
                        ),
                        factory.storeIndex(
                            ir.noSrc,
                            factory.identifier(noSrc, "_balances_", balancesMapPtrT),
                            addr,
                            this.compileJSArg(step.balance)
                        )
                    );
                }

                constuctionFollowups.set(lastObjName as string, followups);
            } else if (step.act === "call") {
                const fun = this.methodMap.get(step.definingContract)?.get(step.method);

                assert(fun !== undefined, `Missing fun ${step.method} in ${step.definingContract}`);

                const args: ir.Expression[] = [];

                // Add this argument
                if (step.method !== "constructor") {
                    args.push(
                        this.exprCompiler.mustCastTo(
                            this.compileJSArg(step.args[0]),
                            fun.parameters[0].type,
                            noSrc
                        )
                    );
                }

                // Add block and message
                args.push(
                    factory.identifier(ir.noSrc, "block", blockPtrT),
                    factory.identifier(ir.noSrc, "msg", msgPtrT)
                );

                // Add remaining args
                args.push(
                    ...step.args
                        .slice(1)
                        .map((jsArg: any, i: number) =>
                            this.exprCompiler.mustCastTo(
                                this.compileJSArg(jsArg),
                                fun.parameters[i + 3].type,
                                noSrc
                            )
                        )
                );

                const lhss: ir.Identifier[] = [];

                const aborted = builder.getTmpId(boolT, ir.noSrc);
                if (step.method === "constructor") {
                    lhss.push(
                        factory.identifier(
                            ir.noSrc,
                            lastObjName as string,
                            builder.typeOfLocal(lastObjName as string)
                        )
                    );
                } else {
                    for (const retT of fun.returns) {
                        const name = `tmp_${lCtr++}`;
                        builder.addIRLocal(name, retT, ir.noSrc);
                        lhss.push(factory.identifier(ir.noSrc, name, retT));
                    }
                }

                lhss.push(aborted);

                const funName = fun.name;

                builder.transCall(
                    lhss,
                    factory.identifier(ir.noSrc, funName, noType),
                    [],
                    [],
                    args,
                    ir.noSrc
                );

                const expectFail =
                    step.expectedReturns === undefined && step.nameReturns === undefined;

                builder.assert(
                    expectFail ? aborted : factory.unaryOperation(noSrc, "!", aborted, boolT),
                    ir.noSrc
                );

                if (step.method === "constructor") {
                    const followups = constuctionFollowups.get(lastObjName as string);
                    if (followups) {
                        followups.forEach((followup) => builder.addStmt(followup));
                        constuctionFollowups.delete(lastObjName as string);
                    }

                    lastObjName = undefined;
                    lastContractName = undefined;
                }

                if (step.nameReturns !== undefined) {
                    (step.nameReturns as string[]).forEach((name, i) => {
                        builder.addIRLocal(name, fun.returns[i], ir.noSrc);
                        builder.assign(
                            factory.identifier(noSrc, name, fun.returns[i]),
                            lhss[i],
                            noSrc
                        );
                    });
                }

                if (step.expectedReturns !== undefined) {
                    for (let i = 0; i < step.expectedReturns.length; i++) {
                        const jsRet = step.expectedReturns[i];
                        const maruirRet = this.compileJSArg(jsRet);

                        if (jsRet.kind === "literal") {
                            builder.assert(
                                factory.binaryOperation(ir.noSrc, lhss[i], "==", maruirRet, boolT),
                                ir.noSrc
                            );
                        } else if (jsRet.kind === "array") {
                            const eqId = builder.getTmpId(boolT, noSrc);
                            const elT = this.compileJSType(jsRet.type, {});

                            // NOTE: This only works for primitive array types
                            // @todo (dimo): Remove sol_arr_eq from preamble as its only needed for tests
                            builder.call(
                                [eqId],
                                factory.funIdentifier("sol_arr_eq"),
                                [
                                    factory.memConstant(noSrc, "memory"),
                                    factory.memConstant(noSrc, "exception")
                                ],
                                [elT],
                                [lhss[i], maruirRet],
                                noSrc
                            );
                            builder.assert(eqId, noSrc);
                        }
                    }
                }
            } else if (step.act === "validateBySnapshot") {
                /// skip
            } else {
                throw new Error(`Unknown step ${pp(step)}`);
            }
        }

        builder.return([], ir.noSrc);

        return this.finishCompile(noSrc, "main", []);
    }
}
