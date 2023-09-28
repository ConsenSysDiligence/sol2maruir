import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, u160Addr, u8ArrMemPtr } from "./typing";
import { noSrc } from "maru-ir2";
import { IRFactory } from "./factory";
import { UIDGenerator, isContractDeployable } from "../utils";
import { ABIEncoderVersion } from "solc-typed-ast";
import { UnitCompiler } from "./unit_compiler";
import { getContractDispatchName } from "./resolving";

export class RootDispatchCompiler extends BaseFunctionCompiler {
    static methodName = "contract_dispatch";

    constructor(
        factory: IRFactory,
        private readonly units: sol.SourceUnit[],
        private readonly unitCompiler: UnitCompiler,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string
    ) {
        super(factory, globalUid, globalScope, solVersion, ABIEncoderVersion.V2);
    }

    /**
     * Compile the root dispatch method. This method iterates over known contract types T, and if the
     * contract at the given address is T, it calls T's dispatch method. Otherwise calls abort.
     * @todo (dimo): Eventually we should call havoc or something else here. Discuss with Valentin
     */
    compile(): ir.FunctionDefinition {
        const builder = this.cfgBuilder;
        const factory = builder.factory;

        builder.addThis(u160Addr);
        builder.addIRArg("block", blockPtrT, noSrc);
        builder.addIRArg("msg", msgPtrT, noSrc);
        builder.addIRRet("res", u8ArrMemPtr, noSrc);

        for (const unit of this.units) {
            for (const contract of unit.vContracts) {
                // Only interested in deployable contracts
                if (!isContractDeployable(contract)) {
                    continue;
                }

                const irContract = this.unitCompiler.getContractStruct(contract);
                const contractPtrT = factory.pointerType(
                    noSrc,
                    factory.userDefinedType(noSrc, irContract.name, [], []),
                    factory.memConstant(noSrc, "storage")
                );

                const isType = builder.getTmpId(ir.boolT, noSrc);
                builder.call(
                    [isType],
                    factory.funIdentifier("builtin_is_contract_at"),
                    [],
                    [contractPtrT],
                    [builder.this(noSrc)],
                    noSrc
                );

                const contractFoundBB = builder.mkBB();
                const keepLookingBB = builder.mkBB();

                builder.branch(isType, contractFoundBB, keepLookingBB, noSrc);
                builder.curBB = contractFoundBB;
                let thisId: ir.Identifier;

                if (contract.kind === sol.ContractKind.Contract) {
                    thisId = builder.getTmpId(contractPtrT, noSrc);

                    builder.call(
                        [thisId],
                        factory.funIdentifier("builtin_get_contract_at"),
                        [],
                        [contractPtrT],
                        [builder.this(noSrc)],
                        noSrc
                    );
                } else {
                    thisId = builder.this(noSrc);
                }

                builder.call(
                    [factory.identifier(noSrc, "res", u8ArrMemPtr)],
                    factory.funIdentifier(getContractDispatchName(contract)),
                    [],
                    [],
                    [thisId, builder.blockPtr(noSrc), builder.msgPtr(noSrc)],
                    noSrc
                );

                builder.return([factory.identifier(noSrc, "res", u8ArrMemPtr)], noSrc);

                builder.curBB = keepLookingBB;
            }
        }

        // In the case we didn't find a contract, match EVM's behavior and just return empty bytes.
        builder.return([builder.zeroValue(u8ArrMemPtr, noSrc)], noSrc);
        //builder.abort(noSrc);

        return this.finishCompile(noSrc, RootDispatchCompiler.methodName);
    }
}
