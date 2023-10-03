import {
    BuiltinFrame,
    BuiltinFun,
    FunctionDefinition,
    Identifier,
    InterpError,
    LiteralEvaluator,
    PointerVal,
    pp,
    PrimitiveValue,
    Program,
    Resolving,
    runProgram,
    State,
    StatementExecutor,
    Typing,
    walk
} from "maru-ir2";
import {
    builtin_bin_op_overflows,
    builtin_decode,
    builtin_encode,
    builtin_encodePacked,
    builtin_encodeWithSelector,
    builtin_encodeWithSignature,
    builtin_get_contract_at,
    builtin_is_contract_at,
    builtin_keccak256_04,
    builtin_keccak256_05,
    builtin_register_contact,
    builtin_un_op_overflows,
    ContractRegistry
} from "./builtins";
import { noType } from "../building/typing";

export class SolMaruirInterp {
    readonly defs: Program;

    resolving: Resolving;
    typing: Typing;
    state: State;
    litEvaluator: LiteralEvaluator;
    stmtExec: StatementExecutor;
    contractRegistry: ContractRegistry;
    nAddresses = 0;

    constructor(defs: Program, rootTrans: boolean) {
        this.defs = defs;
        this.resolving = new Resolving(defs);
        this.typing = new Typing(defs, this.resolving);
        this.contractRegistry = new Map([[0n, [noType, 0n]]]);

        this.state = new State(defs, [], rootTrans, this.getBuiltinsMap());

        this.litEvaluator = new LiteralEvaluator(this.resolving, this.state);
        this.stmtExec = new StatementExecutor(this.resolving, this.typing, this.state);
    }

    private getBuiltinsMap(): Map<string, BuiltinFun> {
        return new Map([
            [
                "builtin_add_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_bin_op_overflows(frame, "+")]
                ]
            ],
            [
                "builtin_sub_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_bin_op_overflows(frame, "-")]
                ]
            ],
            [
                "builtin_mul_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_bin_op_overflows(frame, "*")]
                ]
            ],
            [
                "builtin_div_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_bin_op_overflows(frame, "/")]
                ]
            ],
            [
                "builtin_pow_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_bin_op_overflows(frame, "**")]
                ]
            ],
            [
                "builtin_neg_overflows",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_un_op_overflows(frame, "-")]
                ]
            ],
            [
                "builtin_get_new_address",
                (): [boolean, PrimitiveValue[]] => [false, [BigInt(this.nAddresses++)]]
            ],
            [
                "builtin_abi_encodeWithSignature_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSignature(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSignature_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSignature(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSignature_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSignature(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSignature_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSignature(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSignature_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [builtin_encodeWithSignature(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSelector_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSelector(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSelector_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSelector(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSelector_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSelector(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSelector_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodeWithSelector(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodeWithSelector_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    true,
                    [builtin_encodeWithSelector(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_5",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_6",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_7",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_8",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_9",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_encode_10",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encode(s, frame)]
                ]
            ],
            [
                "builtin_abi_decode_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_5",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_6",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_7",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_8",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_9",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_10",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 0);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decodeWithHash_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 4);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decodeWithHash_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 4);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decodeWithHash_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame, 4);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_encodePacked_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodePacked_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodePacked_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_abi_encodePacked_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_encodePacked(s, frame)]
                ]
            ],
            [
                "builtin_register_contract",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const ptr = frame.args[0][1] as PointerVal;

                    return [false, [builtin_register_contact(this.contractRegistry, typ, ptr)]];
                }
            ],
            [
                "builtin_is_contract_at",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const addr = frame.args[0][1] as bigint;

                    return [false, [builtin_is_contract_at(this.contractRegistry, addr, typ)]];
                }
            ],
            [
                "builtin_get_contract_at",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const typ = frame.typeArgs[0];
                    const addr = frame.args[0][1] as bigint;

                    try {
                        return [
                            false,
                            [builtin_get_contract_at(this.contractRegistry, s, addr, typ)]
                        ];
                    } catch (e) {
                        if (e instanceof InterpError) {
                            s.fail(e);
                        }

                        throw e;
                    }
                }
            ],
            [
                "builtin_keccak256_05",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_05(s, frame)]
                ]
            ],
            [
                "builtin_keccak256_04_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_keccak256_04_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_keccak256_04_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_keccak256_04_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_keccak256_04_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_sha3_0",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_sha3_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_sha3_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_sha3_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ],
            [
                "builtin_sha3_4",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_04(s, frame)]
                ]
            ]
        ]);
    }

    run(fn: FunctionDefinition, withOutput: boolean): [boolean, PrimitiveValue[] | undefined] {
        const state = this.state;

        const flow = runProgram(this.litEvaluator, this.stmtExec, this.defs, state, fn, [], true);

        if (withOutput) {
            for (const stmt of flow) {
                const ids = new Set<string>();

                walk(stmt, (nd) => {
                    if (nd instanceof Identifier) {
                        ids.add(nd.name);
                    }
                });

                const storeStr =
                    "{" +
                    [...ids]
                        .map(
                            (name) =>
                                `${name}: ${pp(
                                    state.curMachFrame.store.get(name) as PrimitiveValue
                                )}`
                        )
                        .join(",") +
                    "}";

                console.error(
                    `${state.curMachFrame.fun.name}:${state.curMachFrame.curBB.label}:${
                        state.curMachFrame.curBBInd
                    } ${stmt.pp()} store ${storeStr}`
                );
            }
        } else {
            for (let step = flow.next(); !step.done; step = flow.next());
        }

        return [state.failed, state.externalReturns];
    }
}
