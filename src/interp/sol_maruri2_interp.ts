import { assert, pp } from "solc-typed-ast";
import {
    BuiltinFrame,
    BuiltinFun,
    eq,
    FunctionDefinition,
    getTypeRange,
    GlobalVariable,
    InterpError,
    IntType,
    noSrc,
    PointerVal,
    PrimitiveValue,
    Program,
    Resolving,
    State,
    StatementExecutor,
    Type,
    Typing
} from "maru-ir2";
import { LiteralEvaluator } from "maru-ir2";
import * as ir from "maru-ir2";
import { encodeWithSignature } from "../utils";

export class SolMaruirInterp {
    resolving: Resolving;
    typing: Typing;
    state: State;
    main: FunctionDefinition;
    stmtExec: StatementExecutor;
    contractRegistry: Map<bigint, [Type, PrimitiveValue]>;
    nAddresses = 0;

    private decodeString(ptr: PointerVal): string {
        const val = this.stmtExec.deref(ptr);

        assert(
            val instanceof Map && val.has("arr"),
            `Expected array for string decoding not {0}`,
            val
        );

        const bigIntPtr = val.get("arr") as PointerVal;

        const bigIntArr = this.stmtExec.deref(bigIntPtr);

        assert(bigIntArr instanceof Array, `Expected array for string decoding not {0}`, bigIntArr);
        const numArr: number[] = [];

        for (const bigInt of bigIntArr) {
            numArr.push(Number(bigInt));
        }

        const buf = Buffer.from(numArr);

        return buf.toString("utf-8");
    }

    private defineBytes(bytes: Buffer, inMem: string): PointerVal {
        const bigIntArr: bigint[] = Array.from(bytes).map(BigInt);

        const arrPtr = this.state.define(bigIntArr, inMem);

        const struct = new Map<string, PrimitiveValue>([
            ["arr", arrPtr],
            ["len", BigInt(arrPtr.length)]
        ]);

        return this.state.define(struct, inMem);
    }

    /**
     * Converts interpreter value to Web3-compatible value.
     *
     * @see https://web3js.readthedocs.io/en/v1.2.6/web3-eth-abi.html#encodeparameters
     */
    toWeb3Value(arg: ir.PrimitiveValue, abiType: string, state: State): any {
        if (abiType === "uint256") {
            return arg;
        }

        throw new Error(`NYI toWeb3Value of abi type ${abiType}`);
    }

    private builtin_bin_op_overflows(frame: BuiltinFrame, op: string): boolean {
        if (op === "**") {
            assert(
                frame.typeArgs.length === 2,
                `Expected two type arg to builtin_<{0}>_overflows`,
                op
            );
        } else {
            assert(
                frame.typeArgs.length === 1,
                `Expected one type arg to builtin_<{0}>_overflows`,
                op
            );
        }

        const typ = frame.typeArgs[0];

        assert(typ instanceof IntType, `Expected an int type not ${typ.pp()}`);

        const x = frame.args[0][1];
        const y = frame.args[1][1];

        const [min, max] = getTypeRange(typ.nbits, typ.signed);
        assert(typeof x === "bigint" && typeof y === "bigint", ``);

        let res: bigint;

        if (op === "+") {
            res = x + y;
        } else if (op === "-") {
            res = x - y;
        } else if (op === "*") {
            res = x * y;
        } else if (op === "/") {
            res = x / y;
        } else if (op === "**") {
            res = x ** y;
        } else {
            throw new Error(`NYI op ${op}`);
        }

        const inRange = min <= res && res <= max;

        return !inRange;
    }

    private builtin_un_op_overflows(frame: BuiltinFrame, op: string): boolean {
        assert(frame.typeArgs.length === 1, `Expected one type arg to builtin_un_overflows`);

        const typ = frame.typeArgs[0];

        assert(typ instanceof IntType, `Expected an int type not ${typ.pp()}`);

        const x = frame.args[0][1];

        const [min, max] = getTypeRange(typ.nbits, typ.signed);
        assert(typeof x === "bigint", ``);

        const res: bigint = -x;

        assert(op === "-", "NYI unary op overflow for {0}", op);
        const inRange = min <= res && res <= max;

        return !inRange;
    }

    constructor(public readonly defs: Program, rootTrans: boolean) {
        this.resolving = new Resolving(defs);
        this.typing = new Typing(defs, this.resolving);
        this.contractRegistry = new Map();

        const entryPoint = defs.filter((x) => x instanceof FunctionDefinition && x.name === "main");

        // Tests need to have a main() entry function
        assert(entryPoint.length === 1, ``);

        this.main = entryPoint[0] as FunctionDefinition;

        // main() must not have any parameters
        assert(this.main.parameters.length === 0, ``);

        const builtins = new Map<string, BuiltinFun>([
            [
                "builtin_add_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_bin_op_overflows(frame, "+")]];
                }
            ],
            [
                "builtin_sub_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_bin_op_overflows(frame, "-")]];
                }
            ],
            [
                "builtin_mul_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_bin_op_overflows(frame, "*")]];
                }
            ],
            [
                "builtin_div_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_bin_op_overflows(frame, "/")]];
                }
            ],
            [
                "builtin_pow_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_bin_op_overflows(frame, "**")]];
                }
            ],
            [
                "builtin_neg_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [this.builtin_un_op_overflows(frame, "-")]];
                }
            ],
            [
                "builtin_get_new_address",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [false, [BigInt(this.nAddresses++)]];
                }
            ],
            [
                "builtin_abi_encodeWithSignature_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    assert(
                        frame.typeArgs.length === 1 && frame.args.length === 3,
                        `Expected one type arg and 3 args to builtin_abi_encodeWithSignature_1`
                    );

                    const [[, sigPtr], [, typePtr], [, val]] = frame.args;

                    assert(sigPtr instanceof Array && typePtr instanceof Array, ``);

                    const signature = this.decodeString(sigPtr);
                    const abiType = this.decodeString(typePtr);

                    console.error(`Signature: ${signature} abi type: ${abiType} val: ${val}`);
                    const result = encodeWithSignature(signature, [abiType], val);
                    console.error(result.toString("hex"));

                    return [true, [this.defineBytes(result, "memory")]];
                }
            ],
            [
                "builtin_register_contract",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const ptr = frame.args[0][1] as PointerVal;

                    return [false, [this.registerContact(typ, ptr)]];
                }
            ],
            [
                "builtin_is_contract_at",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const addr = frame.args[0][1] as bigint;
                    return [false, [this.isContractAt(addr, typ)]];
                }
            ],
            [
                "builtin_get_contract_at",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const addr = frame.args[0][1] as bigint;

                    try {
                        return [true, [this.getContractAt(addr, typ)]];
                    } catch (e) {
                        if (e instanceof InterpError) {
                            this.state.fail(e);
                        }

                        throw e;
                    }
                }
            ]
        ]);

        this.state = new State(defs, this.main, [], [], rootTrans, builtins);

        this.stmtExec = new StatementExecutor(this.resolving, this.typing, this.state);
    }

    isContractAt(addr: bigint, type: Type): boolean {
        const typAndPtr = this.contractRegistry.get(addr);

        if (!typAndPtr) {
            return false;
        }

        return eq(typAndPtr[0], type);
    }

    getContractAt(addr: bigint, type: Type): PrimitiveValue {
        const typAndPtr = this.contractRegistry.get(addr);

        if (!typAndPtr || !eq(typAndPtr[0], type)) {
            throw new InterpError(
                noSrc,
                `No contract at ${addr} or contract not of type ${type.pp()}`,
                this.state
            );
        }

        return typAndPtr[1];
    }

    registerContact(type: Type, ptr: PrimitiveValue): bigint {
        const newAddr = BigInt(this.contractRegistry.size);
        this.contractRegistry.set(newAddr, [type, ptr]);

        return newAddr;
    }

    call(
        fun: FunctionDefinition,
        args: PrimitiveValue[],
        rootTrans: boolean
    ): [boolean, PrimitiveValue[] | undefined] {
        const litEvaluator = new LiteralEvaluator(this.resolving, this.state);

        // First initialize globals
        for (const def of this.defs) {
            if (def instanceof GlobalVariable) {
                this.state.globals.set(
                    def.name,
                    litEvaluator.evalLiteral(def.initialValue, def.type)
                );
            }
        }

        // Next initialize root call
        this.state.startRootCall(fun, args, [], [], rootTrans);

        this.run();

        return [this.state.failed, this.state.externalReturns];
    }

    run(): void {
        const state = this.state;

        while (state.running) {
            const curStmt = state.curMachFrame.curBB.statements[state.curMachFrame.curBBInd];
            console.error(
                `${state.curMachFrame.fun.name}:${state.curMachFrame.curBB.label}:${
                    state.curMachFrame.curBBInd
                } ${curStmt.pp()} store ${pp(state.curMachFrame.store)}`
            );
            this.stmtExec.execStatement(curStmt);
        }
    }
}
