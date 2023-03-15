import {
    BuiltinFrame,
    BuiltinFun,
    FunctionDefinition,
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
    Typing
} from "maru-ir2";
import { assert } from "solc-typed-ast";
import {
    builtin_balance,
    builtin_bin_op_overflows,
    builtin_decode,
    builtin_encode,
    builtin_encodePacked,
    builtin_encodeWithSignature,
    builtin_get_contract_at,
    builtin_is_contract_at,
    builtin_keccak256_05,
    builtin_register_contact,
    builtin_send,
    builtin_un_op_overflows,
    ContractRegistry
} from "./builtins";

export class SolMaruirInterp {
    readonly defs: Program;

    resolving: Resolving;
    typing: Typing;
    state: State;
    main: FunctionDefinition;
    litEvaluator: LiteralEvaluator;
    stmtExec: StatementExecutor;
    contractRegistry: ContractRegistry;
    nAddresses = 0;

    constructor(defs: Program, rootTrans: boolean) {
        this.defs = defs;
        this.resolving = new Resolving(defs);
        this.typing = new Typing(defs, this.resolving);
        this.contractRegistry = new Map();

        this.state = new State(defs, [], rootTrans, this.getBuiltinsMap());

        this.litEvaluator = new LiteralEvaluator(this.resolving, this.state);
        this.stmtExec = new StatementExecutor(this.resolving, this.typing, this.state);

        const entryPoint = defs.find(
            (def): def is FunctionDefinition =>
                def instanceof FunctionDefinition && def.name === "main"
        );

        assert(entryPoint !== undefined, "Unable to detect main() function");

        assert(
            entryPoint.parameters.length === 0,
            "Entry point function main() should not have any arguments"
        );

        this.main = entryPoint;
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
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [BigInt(this.nAddresses++)]
                ]
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
                "builtin_abi_decode_1",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_2",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame);

                    return res === undefined ? [true, []] : [false, res];
                }
            ],
            [
                "builtin_abi_decode_3",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => {
                    const res = builtin_decode(this.resolving, s, frame);

                    return res === undefined ? [true, []] : [false, res];
                }
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
                "builtin_send",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_send(this.contractRegistry, s, frame)]
                ]
            ],
            [
                "builtin_balance",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_balance(this.contractRegistry, s, frame)]
                ]
            ],
            [
                "builtin_keccak256_05",
                (s: State, frame: BuiltinFrame): [boolean, PrimitiveValue[]] => [
                    false,
                    [builtin_keccak256_05(s, frame)]
                ]
            ]
        ]);
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
