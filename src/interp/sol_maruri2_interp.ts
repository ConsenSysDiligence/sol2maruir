import {
    BuiltinFrame,
    BuiltinFun,
    eq,
    FunctionDefinition,
    getTypeRange,
    InterpError,
    IntType,
    LiteralEvaluator,
    noSrc,
    PointerVal,
    pp,
    PrimitiveValue,
    Program,
    Resolving,
    runProgram,
    State,
    StatementExecutor,
    Type,
    Typing
} from "maru-ir2";
import { assert } from "solc-typed-ast";
import {
    encodeParameters,
    encodeWithSignature,
    hexStringToBytes,
    keccak256,
    toWeb3Value
} from "../utils";

export class SolMaruirInterp {
    resolving: Resolving;
    typing: Typing;
    state: State;
    main: FunctionDefinition;
    litEvaluator: LiteralEvaluator;
    stmtExec: StatementExecutor;
    contractRegistry: Map<bigint, [Type, PrimitiveValue]>;
    nAddresses = 0;

    private packedArrPtrToBuf(ptr: PointerVal): Buffer {
        const val = this.state.deref(ptr);

        assert(
            val instanceof Map && val.has("arr"),
            `Expected array struct for packed array decoding, not {0}`,
            val
        );

        const arrPtr = val.get("arr") as PointerVal;
        const arrVal = this.stmtExec.deref(arrPtr);

        assert(
            arrVal instanceof Array,
            `Expected array for packed array decoding, not {0}`,
            arrVal
        );

        return Buffer.from(arrVal.map((v) => Number(v)));
    }

    private decodeBytes(ptr: PointerVal): string {
        return this.packedArrPtrToBuf(ptr).toString("hex");
    }

    private decodeString(ptr: PointerVal): string {
        return this.packedArrPtrToBuf(ptr).toString("utf-8");
    }

    private defineBytes(bytes: Buffer, inMem: string): PointerVal {
        const bigIntArr: bigint[] = Array.from(bytes).map(BigInt);

        const arrPtr = this.state.define(bigIntArr, inMem);

        const struct = new Map<string, PrimitiveValue>([
            ["arr", arrPtr],
            ["len", BigInt(bigIntArr.length)]
        ]);

        return this.state.define(struct, inMem);
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

    private builtin_encode(s: State, frame: BuiltinFrame): PointerVal {
        assert(
            frame.args.length % 2 === 0,
            "Expected even count of args for builtin_encode, got {0}",
            frame.args.length
        );

        const abiTs: string[] = [];
        const abiVs: any[] = [];

        for (let i = 1; i < frame.args.length; i += 2) {
            const typePtr = frame.args[i - 1][1];
            const value = frame.args[i][1];

            assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

            const abiT = this.decodeString(typePtr);
            const abiV = toWeb3Value(value, abiT, s);

            // console.error(abiT, abiV);

            abiTs.push(abiT);
            abiVs.push(abiV);
        }

        const bytes = encodeParameters(abiTs, ...abiVs);

        // console.error(bytes.toString("hex"), abiTs, abiVs);

        const ptr = this.defineBytes(bytes, "memory");

        // console.error(ptr);

        return ptr;
    }

    constructor(public readonly defs: Program, rootTrans: boolean) {
        this.resolving = new Resolving(defs);
        this.typing = new Typing(defs, this.resolving);
        this.contractRegistry = new Map();

        const entryPoint = defs.filter(
            (def) => def instanceof FunctionDefinition && def.name === "main"
        );

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

                    // console.error(`Signature: ${signature} abi type: ${abiType} val: ${val}`);
                    const result = encodeWithSignature(signature, [abiType], val);
                    // console.error(result.toString("hex"));

                    return [true, [this.defineBytes(result, "memory")]];
                }
            ],
            [
                "builtin_abi_encode_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encode(s, frame)]
                ]
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
            ],
            [
                "builtin_balance",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const addr = frame.args[0][1] as bigint;

                    const typAndPtr = this.contractRegistry.get(addr);

                    if (typAndPtr === undefined) {
                        return [true, [0n]];
                    }

                    const contractStruct = s.deref(typAndPtr[1] as PointerVal);

                    assert(
                        contractStruct instanceof Map,
                        `Expected a struct not {0} in balance of {1}`,
                        contractStruct,
                        addr
                    );

                    const balance = contractStruct.get("__balance__");

                    assert(balance !== undefined, `Missing __balance__ in {0}`, contractStruct);

                    return [true, [balance]];
                }
            ],
            [
                "builtin_keccak256_05",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const [[, bytesPtr]] = frame.args;

                    assert(bytesPtr instanceof Array, ``);

                    const bytes = this.decodeBytes(bytesPtr);

                    // console.error(`builtin_keccak256_05: input "${bytes}"`);

                    /**
                     * Edge cases:
                     * - Upstream library returns `null` for empty bytes. So, we compensate.
                     * - Solc 0.4 returns empty hash when no arguments provided.
                     *
                     * @see https://github.com/ethereum/web3.js/blob/2.x/packages/web3-utils/src/Utils.js#L497-L511
                     */
                    const result =
                        bytes.length === 0
                            ? hexStringToBytes(
                                  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
                              )
                            : keccak256(bytes);

                    const hash = "0x" + result.toString("hex");

                    // console.error(`builtin_keccak256_05: result "${hash}"`);

                    return [true, [BigInt(hash)]];
                }
            ]
        ]);

        this.state = new State(defs, [], rootTrans, builtins);

        this.litEvaluator = new LiteralEvaluator(this.resolving, this.state);
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

    run(): [boolean, PrimitiveValue[] | undefined] {
        const state = this.state;

        const flow = runProgram(
            this.litEvaluator,
            this.stmtExec,
            this.defs,
            state,
            this.main,
            [],
            true
        );

        // for (let step = flow.next(); !step.done; step = flow.next());

        for (const stmt of flow) {
            console.error(
                `${state.curMachFrame.fun.name}:${state.curMachFrame.curBB.label}:${
                    state.curMachFrame.curBBInd
                } ${stmt.pp()} store ${pp(state.curMachFrame.store)}`
            );
        }

        return [state.failed, state.externalReturns];
    }
}
