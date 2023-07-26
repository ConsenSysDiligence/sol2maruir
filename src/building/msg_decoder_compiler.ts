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
        abiVersion: sol.ABIEncoderVersion,
        private readonly buildArgs: boolean // If true build fun for args, otherwise for returns
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    private prepDecodeArgs(solTypes: sol.TypeNode[]): ir.Expression[] {
        return solTypes.map((solType) =>
            this.cfgBuilder.getAbiTypeStringConst(solType, this.abiVersion)
        );
    }

    /**
     * Compile the msg.data decoder function for this particular function/getter
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

        const builtinName = this.buildArgs
            ? `builtin_abi_decodeWithHash_${solArgTs.length}`
            : `builtin_abi_decode_${solArgTs.length}`;

        // Call abi.encodeWithSignature
        this.cfgBuilder.call(
            rets,
            factory.identifier(noSrc, builtinName, noType),
            [factory.memVariableDeclaration(noSrc, "DataM")],
            irRetTs,
            [factory.identifier(noSrc, dataDecl.name, dataDecl.type), ...callArgs],
            noSrc
        );

        // Return
        this.cfgBuilder.return(rets, noSrc);

        const name = getMsgDecoderName(
            this.contract,
            this.origDef,
            this.cfgBuilder.infer,
            this.buildArgs
        );

        return this.finishCompile(noSrc, name, [factory.memVariableDeclaration(noSrc, "DataM")]);
    }
}
