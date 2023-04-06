import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, transpileType } from "./typing";
import { noSrc } from "maru-ir2";
import { getDesugaredPartialConstructorName } from "./resolving";
import { IRFactory } from "./factory";
import { ExpressionCompiler } from "./expression_compiler";
import { ASTSource } from "../ir/source";
import { UIDGenerator } from "../utils";

export class ImplicitConstructorCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        private readonly mdc: sol.ContractDefinition,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        contractStruct: ir.StructDefinition
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion, contractStruct);
    }

    /**
     * Compile the implicit partial constructor. Just zero-es out the state variables
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;

        // Add this argument
        const thisT = factory.pointerType(
            noSrc,
            factory.userDefinedType(
                noSrc,
                (this.contractStruct as ir.StructDefinition).name,
                [],
                []
            ),
            factory.memConstant(noSrc, "storage")
        );

        this.cfgBuilder.addThis(thisT);

        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);

        const exprCompiler = new ExpressionCompiler(
            this.cfgBuilder,
            this.abiVersion,
            this.contract
        );

        for (const stateVar of this.contract.vStateVariables) {
            const stateVarT = transpileType(
                this.cfgBuilder.infer.variableDeclarationToTypeNode(stateVar),
                this.cfgBuilder.factory
            );

            const initialVal = stateVar.vValue
                ? exprCompiler.compile(stateVar.vValue)
                : this.cfgBuilder.zeroValue(stateVarT);

            this.cfgBuilder.storeField(
                this.cfgBuilder.this(noSrc),
                stateVar.name,
                exprCompiler.implicitCastTo(
                    initialVal,
                    stateVarT,
                    new ASTSource(stateVar)
                ) as ir.Expression,
                noSrc
            );
        }

        const name = getDesugaredPartialConstructorName(this.contract, this.mdc);

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);

        return this.finishCompile(noSrc, name);
    }
}
