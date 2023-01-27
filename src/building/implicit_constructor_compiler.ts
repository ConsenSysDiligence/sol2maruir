import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, transpileType } from "./typing";
import { noSrc } from "maru-ir2";
import { getDesugaredPartialConstructorName } from "./resolving";
import { IRFactory } from "./factory";
import { ExpressionCompiler } from "./expression_compiler";

export class ImplicitConstructorCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        globalScope: ir.Scope,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        contractStruct: ir.StructDefinition
    ) {
        super(factory, globalScope, solVersion, abiVersion, contractStruct);
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

        const exprCompiler = new ExpressionCompiler(this.cfgBuilder);

        for (const stateVar of this.contract.vStateVariables) {
            let initialVal: ir.Expression;

            if (stateVar.vValue !== undefined) {
                initialVal = exprCompiler.compile(stateVar.vValue);
            } else {
                const stateVarT = transpileType(
                    this.cfgBuilder.infer.variableDeclarationToTypeNode(stateVar),
                    this.cfgBuilder.factory
                );

                initialVal = this.cfgBuilder.zeroValue(stateVarT);
            }

            this.cfgBuilder.storeField(
                this.cfgBuilder.this(noSrc),
                stateVar.name,
                initialVal,
                noSrc
            );
        }

        const name = getDesugaredPartialConstructorName(
            this.contract,
            this.contract as sol.ContractDefinition
        );

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);

        return this.finishCompile(noSrc, name);
    }
}
