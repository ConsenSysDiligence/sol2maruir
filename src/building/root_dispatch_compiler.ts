import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, u160, u8, u8ArrMemPtr } from "./typing";
import { noSrc } from "maru-ir2";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";
import { ABIEncoderVersion } from "solc-typed-ast";

export class RootDispatchCompiler extends BaseFunctionCompiler {
    static methodName = "contract_dispatch";

    constructor(
        factory: IRFactory,
        public readonly units: sol.SourceUnit[],
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string
    ) {
        super(factory, globalUid, globalScope, solVersion, ABIEncoderVersion.V2);
    }

    /**
     * Compile the root dispatch method. This method iterates over known contract types T, and if the
     * contract at the given address is T, it calls T's dispatch method. Otherwise calls havoc()
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;
        const dataM = factory.memVariableDeclaration(noSrc, "DataM");

        this.cfgBuilder.addThis(u160);
        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);
        this.cfgBuilder.addIRArg(
            "data",
            factory.pointerType(
                noSrc,
                factory.userDefinedType(noSrc, "ArrWithLen", [dataM], [u8]),
                dataM
            ),
            noSrc
        );
        this.cfgBuilder.addIRRet("res", u8ArrMemPtr, noSrc);

        return this.finishCompile(noSrc, RootDispatchCompiler.methodName, [dataM]);
    }
}
