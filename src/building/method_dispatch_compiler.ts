import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, noType, transpileType, u160 } from "./typing";
import { noSrc } from "maru-ir2";
import { getMethodDispatchName } from "./resolving";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";

export class MethodDispatchCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        private readonly origDef: sol.FunctionDefinition | sol.VariableDeclaration,
        private readonly overridingImpls: Array<
            [ir.StructDefinition, ir.FunctionDefinition | ir.VariableDeclaration]
        >,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    /**
     * Compile the implicit partial constructor. Just zero-es out the state variables
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;

        // Add this argument
        this.cfgBuilder.addThis(u160);

        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);

        if (this.origDef instanceof sol.FunctionDefinition) {
            for (const solArg of this.origDef.vParameters.vParameters) {
                this.cfgBuilder.addArg(solArg);
            }

            for (const solRet of this.origDef.vReturnParameters.vParameters) {
                this.cfgBuilder.addRet(solRet);
            }
        } else {
            const [argTs, retT] = this.cfgBuilder.infer.getterArgsAndReturn(this.origDef);

            argTs.forEach((argT, i) =>
                this.cfgBuilder.addIRArg(
                    `ARG_${i}`,
                    transpileType(argT, this.cfgBuilder.factory),
                    noSrc
                )
            );

            const retTs = retT instanceof sol.TupleType ? retT.elements : [retT];

            retTs.forEach((retElT, i) =>
                this.cfgBuilder.addIRRet(
                    `RET_${i}`,
                    transpileType(retElT as sol.TypeNode, this.cfgBuilder.factory),
                    noSrc
                )
            );
        }

        for (let i = 0; i < this.overridingImpls.length; i++) {
            const [irContract, irFun] = this.overridingImpls[i];
            const success = this.cfgBuilder.mkBB();
            const fail = this.cfgBuilder.mkBB();

            const contractPtrT = factory.pointerType(
                noSrc,
                factory.userDefinedType(noSrc, irContract.name, [], []),
                factory.memConstant(noSrc, "storage")
            );

            const isType = this.cfgBuilder.getTmpId(ir.boolT, noSrc);
            this.cfgBuilder.call(
                [isType],
                factory.identifier(noSrc, "builtin_is_contract_at", noType),
                [],
                [contractPtrT],
                [this.cfgBuilder.this(noSrc)],
                noSrc
            );

            this.cfgBuilder.branch(isType, success, fail, noSrc);

            this.cfgBuilder.curBB = success;
            const contractPtr = this.cfgBuilder.getTmpId(contractPtrT, noSrc);

            this.cfgBuilder.call(
                [contractPtr],
                factory.identifier(noSrc, "builtin_get_contract_at", noType),
                [],
                [contractPtrT],
                [this.cfgBuilder.this(noSrc)],
                noSrc
            );

            const lhss = this.cfgBuilder.returns.map((ret) =>
                factory.identifier(noSrc, ret.name, ret.type)
            );

            this.cfgBuilder.call(
                lhss,
                factory.identifier(noSrc, irFun.name, noType),
                [],
                [],
                [
                    contractPtr,
                    ...this.cfgBuilder.args
                        .slice(1)
                        .map((arg) => factory.identifier(noSrc, arg.name, arg.type))
                ],
                noSrc
            );

            this.cfgBuilder.return(lhss, noSrc);
            this.cfgBuilder.curBB = fail;
        }

        this.cfgBuilder.abort(noSrc);

        const name = getMethodDispatchName(this.contract, this.origDef, this.cfgBuilder.infer);

        return this.finishCompile(noSrc, name);
    }
}
