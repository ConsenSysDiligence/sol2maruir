import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { noType, transpileType, u8 } from "./typing";
import { noSrc } from "maru-ir2";
import { getMsgDecoderName } from "./resolving";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";

/**
 * Compile a function that triest to decode the msg.data for a particular public function
 * or public getter.
 */
export class MsgDecoderCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        private readonly origDef: sol.FunctionDefinition | sol.VariableDeclaration,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    /**
     * This looks similar to ExpressionCompiler.prepDecodeArgs, but there are differences so we can't
     * just reuse that.
     * @param solArgs
     * @returns
     */
    private prepDecodeArgs(solTypes: sol.TypeNode[]): ir.Expression[] {
        const args: ir.Expression[] = [];

        for (let i = 0; i < solTypes.length; i++) {
            const solType = solTypes[i];

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

            args.push(abiTypeName);
        }

        return args;
    }

    /**
     * Compile the msg.data decoder function for this particular function/getter
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;
        const solArgTs: sol.TypeNode[] =
            this.origDef instanceof sol.FunctionDefinition
                ? this.origDef.vParameters.vParameters.map((param) =>
                      this.cfgBuilder.infer.variableDeclarationToTypeNode(param)
                  )
                : this.cfgBuilder.infer.getterArgsAndReturn(this.origDef)[0];

        // Add arguments
        const dataDecl = this.cfgBuilder.addIRArg(
            "data",
            factory.pointerType(
                noSrc,
                factory.userDefinedType(
                    noSrc,
                    "ArrWithLen",
                    [factory.memIdentifier(noSrc, "DataM")],
                    [u8]
                ),
                factory.memIdentifier(noSrc, "DataM")
            ),
            noSrc
        );

        // Add returns
        solArgTs.forEach((argT, i) =>
            this.cfgBuilder.addIRRet(
                `RET_${i}`,
                transpileType(argT, this.cfgBuilder.factory),
                noSrc
            )
        );
        const irRetTs = this.cfgBuilder.returns.map((argDecl) => argDecl.type);
        const rets = this.cfgBuilder.returns.map((retDecl) =>
            factory.identifier(noSrc, retDecl.name, retDecl.type)
        );

        // Prep abi.decode arguments
        const callArgs = this.prepDecodeArgs(solArgTs);

        // Call abi.encodeWithSignature
        this.cfgBuilder.call(
            rets,
            factory.identifier(noSrc, `builtin_abi_decodeWithHash_${solArgTs.length}`, noType),
            [factory.memVariableDeclaration(noSrc, "DataM")],
            irRetTs,
            [factory.identifier(noSrc, dataDecl.name, dataDecl.type), ...callArgs],
            noSrc
        );

        // Return
        this.cfgBuilder.return(rets, noSrc);

        const name = getMsgDecoderName(this.contract, this.origDef, this.cfgBuilder.infer);

        return this.finishCompile(noSrc, name, [factory.memVariableDeclaration(noSrc, "DataM")]);
    }
}
