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
import * as ir from "maru-ir2";
import { assert } from "solc-typed-ast";
import {
    decodeBytes,
    decodeParameters,
    decodeString,
    encodePacked,
    encodeParameters,
    encodeWithSignature,
    fromWeb3Value,
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

    private builtin_encodeWithSignature(s: State, frame: BuiltinFrame): PointerVal {
        assert(
            frame.args.length === 2 * frame.typeArgs.length + 1,
            `Expected one type arg and 3 args to builtin_abi_encodeWithSignature_${frame.typeArgs.length}`
        );

        const sigPtr = frame.args[0][1];

        const argVals: PrimitiveValue[] = [];
        const abiTypes: string[] = [];

        for (let i = 0; i < frame.typeArgs.length; i++) {
            const typePtr = frame.args[i * 2 + 1][1];
            const value = frame.args[i * 2 + 2][1];

            assert(typePtr instanceof Array, ``);

            const abiT = decodeString(s, typePtr);
            const web3V = toWeb3Value(value, abiT, s);

            abiTypes.push(abiT);
            argVals.push(web3V);
        }

        assert(sigPtr instanceof Array, ``);
        const signature = decodeString(s, sigPtr);

        // console.error(`Signature: ${signature} abi types: ${pp(abiTypes)} arg: ${pp(argVals)}`);
        const result = encodeWithSignature(signature, abiTypes, ...argVals);
        // console.error(result.toString("hex"));

        return this.defineBytes(result, "memory");
    }

    private getLastSolidityFun(s: ir.State): ir.FunctionDefinition {
        for (let i = s.stack.length; i >= 0; i--) {
            const frame = s.stack[i];

            if (frame instanceof ir.Frame) {
                return frame.fun;
            }
        }

        throw new Error(`No Solidity function in stack`);
    }

    private builtin_decode(s: State, frame: BuiltinFrame): PrimitiveValue[] {
        assert(
            frame.args.length == frame.typeArgs.length + 1,
            "Bad number of args {0}",
            frame.args.length
        );

        const dataPtr = frame.args[0][1];
        assert(dataPtr instanceof Array, "Expected pointer, got {0}", dataPtr);

        const data = decodeBytes(s, dataPtr);

        const abiTypeNames: string[] = [];

        for (let i = 1; i < frame.args.length; i += 2) {
            const typePtr = frame.args[i][1];
            assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

            const abiT = decodeString(s, typePtr);
            abiTypeNames.push(abiT);
        }

        const web3Vals = decodeParameters(abiTypeNames, data) as any[];

        const res: PrimitiveValue[] = [];

        const lastFun = this.getLastSolidityFun(s);
        const scope = this.resolving.getScope(lastFun);
        for (let i = 0; i < abiTypeNames.length; i++) {
            res.push(fromWeb3Value(web3Vals[i], abiTypeNames[i], frame.typeArgs[i], s, scope));
        }

        return res;
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

            const abiT = decodeString(s, typePtr);
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

    private builtin_encodePacked(s: State, frame: BuiltinFrame): PointerVal {
        if (frame.args.length === 0) {
            return this.defineBytes(Buffer.from(""), "memory");
        }

        assert(
            frame.args.length % 2 === 0,
            "Expected even count of args for builtin_encodePacked, got {0}",
            frame.args.length
        );

        const abiArgs: Array<{ type: string; value: any }> = [];

        for (let i = 1; i < frame.args.length; i += 2) {
            const typePtr = frame.args[i - 1][1];
            const value = frame.args[i][1];

            assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

            const abiT = decodeString(s, typePtr);
            const abiV = toWeb3Value(value, abiT, s);

            // console.error(abiT, abiV);

            abiArgs.push({ type: abiT, value: abiV });
        }

        const bytes = encodePacked(...abiArgs);

        // console.error(bytes.toString("hex"), abiArgs);

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
                "builtin_abi_encodeWithSignature_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [true, [this.builtin_encodeWithSignature(s, frame)]];
                }
            ],
            [
                "builtin_abi_encodeWithSignature_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [true, [this.builtin_encodeWithSignature(s, frame)]];
                }
            ],
            [
                "builtin_abi_encodeWithSignature_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    return [true, [this.builtin_encodeWithSignature(s, frame)]];
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
                "builtin_abi_decode_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    this.builtin_decode(s, frame)
                ]
            ],
            [
                "builtin_abi_decode_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    this.builtin_decode(s, frame)
                ]
            ],
            [
                "builtin_abi_decode_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    this.builtin_decode(s, frame)
                ]
            ],
            [
                "builtin_abi_encodePacked_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodePacked_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodePacked_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [this.builtin_encodePacked(s, frame)]
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
                "builtin_send",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const sendAddr = frame.args[0][1] as bigint;
                    const recvAddr = frame.args[1][1] as bigint;
                    const amount = frame.args[2][1] as bigint;

                    const sendTypAndPtr = this.contractRegistry.get(sendAddr);
                    const recvTypAndPtr = this.contractRegistry.get(recvAddr);

                    if (recvTypAndPtr === undefined || sendTypAndPtr === undefined) {
                        return [true, [false]];
                    }

                    const sendStruct = s.deref(sendTypAndPtr[1] as PointerVal);
                    const recvStruct = s.deref(recvTypAndPtr[1] as PointerVal);

                    assert(
                        recvStruct instanceof Map && sendStruct instanceof Map,
                        `Expected structs not {0} and {1} in builtin_send of {2}`,
                        recvStruct,
                        sendStruct,
                        recvAddr
                    );

                    const sendBalance = sendStruct.get("__balance__");
                    const recvBalance = recvStruct.get("__balance__");

                    let update: bigint;

                    assert(
                        typeof sendBalance === "bigint",
                        `Missing balance of sender {0}`,
                        sendAddr
                    );

                    // Not enough funds
                    if (sendBalance < amount) {
                        return [true, [false]];
                    }

                    sendStruct.set("__balance__", sendBalance - amount);

                    if (recvBalance === undefined) {
                        update = amount;
                    } else {
                        assert(
                            typeof recvBalance === "bigint",
                            `Expected bigint for __balance__ of {0}, got {1}`,
                            recvAddr,
                            typeof recvBalance
                        );

                        update = recvBalance + amount;
                    }

                    recvStruct.set("__balance__", update);

                    return [true, [true]];
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
                        `Expected a struct not {0} in builtin_balance of {1}`,
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

                    const bytes = decodeBytes(s, bytesPtr);

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
