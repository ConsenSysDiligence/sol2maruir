import {
    ABIEncoderVersion,
    assert,
    ContractDefinition,
    FunctionDefinition,
    InferType,
    pp
} from "solc-typed-ast";
import * as ir from "maru-ir2";
import {
    blockPtrT,
    blockT,
    msgPtrT,
    msgT,
    u160,
    u256,
    boolT,
    u8,
    noType
} from "../src/building/typing";
import { CFGBuilder } from "../src";
import { ASTSource } from "../src/ir/source";
import { noSrc } from "maru-ir2";
import { IRFactory } from "../src/building/factory";

export type MethodMap = Map<string, Map<string, ir.FunctionDefinition>>;
export type ContractMap = Map<string, ir.StructDefinition>;
export function buildMaps(
    defs: ir.Definition[],
    solVersion: string,
    abiVersion: ABIEncoderVersion
): [MethodMap, ContractMap] {
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
                    : infer.signature(def.src.nd, abiVersion);
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

export class JSONConfigTranspiler {
    private readonly globalScope: ir.Scope;
    private readonly funScope: ir.Scope;
    private readonly builder: CFGBuilder;
    private readonly factory: IRFactory;
    private nGlboals = 0;

    constructor(solVersion: string, factory: IRFactory) {
        this.globalScope = new ir.Scope();
        this.funScope = new ir.Scope(this.globalScope);
        this.builder = new CFGBuilder(this.globalScope, this.funScope, solVersion, factory);
        this.factory = factory;
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

    getNewConstStr(s: string, mem: string): ir.Expression {
        const val = [...Buffer.from(s, "utf-8")].map((x) => BigInt(x));
        const memC = this.factory.memConstant(ir.noSrc, mem);
        return this.getNewGlobal(
            this.factory.pointerType(
                ir.noSrc,
                this.factory.userDefinedType(ir.noSrc, "ArrWithLen", [memC], [u8]),
                memC
            ),
            this.factory.structLiteral(ir.noSrc, [
                ["len", this.factory.numberLiteral(ir.noSrc, BigInt(val.length), 10, u256)],
                [
                    "arr",
                    this.factory.arrayLiteral(
                        ir.noSrc,
                        val.map((v) => this.factory.numberLiteral(ir.noSrc, v, 10, u8))
                    )
                ]
            ]),
            "_str_lit_"
        );
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
        if (arg.kind === "object") {
            return this.factory.identifier(ir.noSrc, arg.name, this.builder.typeOfLocal(arg.name));
        }

        if (arg.kind === "literal") {
            const litT = this.compileJSType(arg.type, arg);

            if (litT instanceof ir.BoolType) {
                return this.factory.booleanLiteral(ir.noSrc, arg.value);
            }

            if (litT instanceof ir.IntType) {
                if (arg.type.startsWith("bytes")) {
                    return this.factory.numberLiteral(ir.noSrc, BigInt("0x" + arg.value), 16, litT);
                } else {
                    return this.factory.numberLiteral(ir.noSrc, BigInt(arg.value), 10, litT);
                }
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

            const loc = this.factory.memConstant(ir.noSrc, arg.location);

            return this.getNewGlobal(
                this.factory.pointerType(
                    ir.noSrc,
                    this.factory.userDefinedType(ir.noSrc, "ArrWithLen", [loc], [u8]),
                    loc
                ),
                this.factory.structLiteral(ir.noSrc, [
                    ["len", this.factory.numberLiteral(ir.noSrc, BigInt(values.length), 10, u256)],
                    [
                        "arr",
                        this.factory.arrayLiteral(
                            ir.noSrc,
                            values.map((v) => this.factory.numberLiteral(ir.noSrc, v, 10, u8))
                        )
                    ]
                ]),
                "_arg_"
            );
        }

        if (arg.kind === "string") {
            return this.getNewConstStr(arg.value, arg.location);
        }

        if (arg.kind === "array") {
            const arr: ir.ArrayLiteral = this.factory.arrayLiteral(ir.noSrc, []);
            const typ: ir.Type = this.compileJSType(arg.type, arg);

            for (const el of arg.elements) {
                const elV = this.compileJSArg(el);
                if (!(elV instanceof ir.NumberLiteral || elV instanceof ir.BooleanLiteral)) {
                    throw new Error(`NYI transpiling arrays like ${pp(arg)}`);
                }

                arr.values.push(elV);
            }

            const loc = this.factory.memConstant(ir.noSrc, arg.location);

            return this.getNewGlobal(
                this.factory.pointerType(
                    ir.noSrc,
                    this.factory.userDefinedType(ir.noSrc, "ArrWithLen", [loc], [typ]),
                    loc
                ),
                this.factory.structLiteral(ir.noSrc, [
                    [
                        "len",
                        this.factory.numberLiteral(ir.noSrc, BigInt(arr.values.length), 10, u256)
                    ],
                    ["arr", arr]
                ]),
                "_arg_"
            );
        }

        throw new Error(`NYI transpiling JS kind ${arg.kind}`);
    }

    compileConfig(
        config: any,
        methodMap: Map<string, Map<string, ir.FunctionDefinition>>,
        contractMap: Map<string, ir.StructDefinition>
    ): ir.Definition[] {
        this.builder.addIRLocal("block", blockPtrT, ir.noSrc);
        this.builder.addIRLocal("msg", msgPtrT, ir.noSrc);

        const entry = new ir.BasicBlock("entry");
        const body = new ir.CFG([entry], [], entry, [entry]);
        let lCtr = 0;
        let lastObjName: string | undefined;
        let lastContractName: string | undefined;

        entry.statements.push(
            this.factory.allocStruct(
                ir.noSrc,
                this.factory.identifier(ir.noSrc, "block", blockPtrT),
                blockT,
                this.factory.memConstant(ir.noSrc, "memory")
            ),
            this.factory.storeField(
                ir.noSrc,
                this.factory.identifier(ir.noSrc, "block", blockPtrT),
                "number",
                this.factory.numberLiteral(ir.noSrc, 1n, 10, u256)
            ),
            this.factory.allocStruct(
                ir.noSrc,
                this.factory.identifier(ir.noSrc, "msg", msgPtrT),
                msgT,
                this.factory.memConstant(ir.noSrc, "memory")
            ),
            this.factory.storeField(
                ir.noSrc,
                this.factory.identifier(ir.noSrc, "msg", msgPtrT),
                "sender",
                this.factory.numberLiteral(ir.noSrc, 2n, 10, u160)
            )
        );

        for (const step of config.steps) {
            if (step.act === "define") {
                lastObjName = step.name;
                lastContractName = step.type;

                const def = contractMap.get(lastContractName as string) as ir.StructDefinition;
                const thisT = this.factory.pointerType(
                    noSrc,
                    this.factory.userDefinedType(noSrc, def?.name, [], []),
                    this.factory.memConstant(noSrc, "storage")
                );
                this.builder.addIRLocal(lastObjName as string, thisT, ir.noSrc);
            } else if (step.act === "call") {
                const fun = methodMap.get(step.definingContract)?.get(step.method);
                assert(fun !== undefined, `Missing fun ${step.method} in ${step.definingContract}`);
                const args: ir.Expression[] = step.args.map((jsArg: any) =>
                    this.compileJSArg(jsArg)
                );

                args.splice(
                    1,
                    0,
                    this.factory.identifier(ir.noSrc, "block", blockPtrT),
                    this.factory.identifier(ir.noSrc, "msg", msgPtrT)
                );
                const lhss: ir.Identifier[] = [];

                for (const retT of fun.returns) {
                    const name = `tmp_${lCtr++}`;
                    this.builder.addIRLocal(name, retT, ir.noSrc);
                    lhss.push(this.factory.identifier(ir.noSrc, name, retT));
                }

                const aborted = this.builder.getTmpId(boolT, ir.noSrc);
                lhss.push(aborted);

                const funName = fun.name;
                const isExternal = true;

                if (
                    lastObjName !== undefined &&
                    lastContractName !== undefined &&
                    step.method !== "constructor"
                ) {
                    entry.statements.push(
                        this.factory.transactionCall(
                            ir.noSrc,
                            [
                                this.factory.identifier(
                                    noSrc,
                                    lastObjName,
                                    this.builder.typeOfLocal(lastObjName)
                                ),
                                this.builder.getTmpId(boolT)
                            ],
                            this.factory.identifier(
                                ir.noSrc,
                                `${lastContractName}_constructor`,
                                noType
                            ),
                            [],
                            [],
                            [
                                this.factory.identifier(noSrc, "block", blockPtrT),
                                this.factory.identifier(noSrc, "msg", msgPtrT)
                            ]
                        )
                    );
                    lastObjName = undefined;
                    lastContractName = undefined;
                }

                if (step.method === "constructor") {
                    lhss.splice(
                        0,
                        1,
                        this.factory.identifier(
                            ir.noSrc,
                            lastObjName as string,
                            this.builder.typeOfLocal(lastObjName as string)
                        )
                    );
                    args.splice(0, 1);
                    lastObjName = undefined;
                    lastContractName = undefined;
                }

                entry.statements.push(
                    (isExternal ? this.factory.transactionCall : this.factory.functionCall)(
                        ir.noSrc,
                        lhss,
                        this.factory.identifier(ir.noSrc, funName, noType),
                        [],
                        [],
                        args
                    )
                );

                if (step.expectedReturns === undefined) {
                    entry.statements.push(this.factory.assert(ir.noSrc, aborted));
                } else {
                    for (let i = 0; i < step.expectedReturns.length; i++) {
                        const jsRet = step.expectedReturns[i];
                        const maruirRet = this.compileJSArg(jsRet);

                        entry.statements.push(
                            this.factory.assert(
                                ir.noSrc,
                                this.factory.binaryOperation(
                                    ir.noSrc,
                                    lhss[i],
                                    "==",
                                    maruirRet,
                                    boolT
                                )
                            )
                        );
                    }
                }
            } else if (step.act === "validateBySnapshot") {
                /// skip
            } else {
                throw new Error(`Unknown step ${pp(step)}`);
            }
        }

        entry.statements.push(this.factory.return(ir.noSrc, []));

        const res: ir.Definition[] = [...this.globalScope.definitions()];

        res.push(
            this.factory.functionDefinition(
                ir.noSrc,
                [],
                [],
                "main",
                [],
                this.builder.locals,
                [],
                body
            )
        );

        return res;
    }
}
