import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { noType, transpileType, u8, u8ArrMemPtr } from "./typing";
import { noSrc } from "maru-ir2";
import { getMsgBuilderName } from "./resolving";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";

/**
 * Compile a function that builds the msg.data for a particular public function
 * or public getter.
 */
export class MsgBuilderCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        private readonly origDef: sol.FunctionDefinition | sol.VariableDeclaration,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly buildArgs: boolean // If true build fun for args, otherwise for returns
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    /**
     * This looks similar to ExpressionCompiler.prepEncodeArgs, but there are differences so we can't
     * just reuse that.
     * @param solArgs
     * @returns
     */
    private prepEncodeArgs(irArgs: ir.Expression[], solTypes: sol.TypeNode[]): ir.Expression[] {
        const args: ir.Expression[] = [];

        sol.assert(irArgs.length === solTypes.length, ``);

        for (let i = 0; i < irArgs.length; i++) {
            const solType = solTypes[i];
            const irArg = irArgs[i];

            let abiSafeSolType: sol.TypeNode;

            if (solType instanceof sol.IntLiteralType) {
                const fitT = solType.smallestFittingType();

                sol.assert(
                    fitT !== undefined,
                    "Unable to detect smalles fitting type for {0}",
                    solType
                );

                abiSafeSolType = fitT;
            } else {
                abiSafeSolType = solType;
            }

            const abiType = sol.generalizeType(
                this.cfgBuilder.infer.toABIEncodedType(abiSafeSolType, this.abiVersion)
            )[0];

            const abiTypeName = this.cfgBuilder.getStrLit(abiType.pp(), noSrc);

            args.push(abiTypeName, irArg);
        }

        return args;
    }

    /**
     * Compile the implicit partial constructor. Just zero-es out the state variables
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;
        let solArgTs: sol.TypeNode[];

        if (this.buildArgs) {
            solArgTs =
                this.origDef instanceof sol.FunctionDefinition
                    ? this.origDef.vParameters.vParameters.map((param) =>
                          this.cfgBuilder.infer.variableDeclarationToTypeNode(param)
                      )
                    : this.cfgBuilder.infer.getterArgsAndReturn(this.origDef)[0];
        } else {
            if (this.origDef instanceof sol.FunctionDefinition) {
                solArgTs = this.origDef.vReturnParameters.vParameters.map((param) =>
                    this.cfgBuilder.infer.variableDeclarationToTypeNode(param)
                );
            } else {
                const getterRetT = this.cfgBuilder.infer.getterArgsAndReturn(this.origDef)[1];
                solArgTs =
                    getterRetT instanceof sol.TupleType
                        ? (getterRetT.elements as sol.TypeNode[])
                        : [getterRetT];
            }
        }

        // Add arguments
        solArgTs.forEach((argT, i) =>
            this.cfgBuilder.addIRArg(
                `ARG_${i}`,
                transpileType(argT, this.cfgBuilder.factory),
                noSrc
            )
        );
        const irArgTs = this.cfgBuilder.args.map((argDecl) => argDecl.type);

        const resDecl = this.cfgBuilder.addIRRet("RET", u8ArrMemPtr, noSrc);
        if (solArgTs.length === 0) {
            const sigHash = this.cfgBuilder.getBytesLit(
                this.cfgBuilder.infer.signatureHash(this.origDef),
                noSrc
            );

            const sigHashInMem = this.cfgBuilder.getTmpId(u8ArrMemPtr, noSrc);
            this.cfgBuilder.call(
                [sigHashInMem],
                factory.funIdentifier("sol_copy_arr_shallow"),
                [factory.memConstant(noSrc, "exception"), factory.memConstant(noSrc, "memory")],
                [u8],
                [sigHash],
                noSrc
            );
            this.cfgBuilder.return([sigHashInMem], noSrc);
        } else {
            // Add returns
            const res = factory.identifier(noSrc, resDecl.name, resDecl.type);
            const sig = this.cfgBuilder.getStrLit(
                this.cfgBuilder.infer.signature(this.origDef),
                noSrc
            );

            // @todo re-write this to use abi.encodeWithSelector, or just abi.encode
            // to avoid adding string literals for signatures.

            // Prep abi.encodeWithSignature arguments
            const callArgs = this.prepEncodeArgs(
                this.cfgBuilder.args.map((argDecl) =>
                    factory.identifier(noSrc, argDecl.name, argDecl.type)
                ),
                solArgTs
            );

            // Call abi.encode
            this.cfgBuilder.call(
                [res],
                factory.identifier(
                    noSrc,
                    `builtin_abi_encodeWithSignature_${solArgTs.length}`,
                    noType
                ),
                [factory.memConstant(noSrc, "exception")],
                irArgTs,
                [sig, ...callArgs],
                noSrc
            );

            // Return
            this.cfgBuilder.return([res], noSrc);
        }

        const name = getMsgBuilderName(
            this.contract,
            this.origDef,
            this.cfgBuilder.infer,
            this.buildArgs
        );

        return this.finishCompile(noSrc, name);
    }
}
