import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { ExpressionCompiler } from "./expression_compiler";
import { noSrc } from "maru-ir2";
import { transpileType } from "./typing";
import { getGlobalVarName } from "./resolving";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";

export class GlobalConstantInitializerCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private units: sol.SourceUnit[]
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    /**
     * Compile the current solidity function to a low-level IR function and return it.
     */
    compile(): ir.FunctionDefinition {
        const src = noSrc;
        const name: string = "__init_global_constants__";
        const factory = this.cfgBuilder.factory;

        for (const unit of this.units) {
            const exprCompiler = new ExpressionCompiler(this.cfgBuilder, this.abiVersion, unit);
            for (const c of unit.vVariables) {
                if (!c.vValue) {
                    continue;
                }

                const irT = transpileType(
                    this.cfgBuilder.infer.variableDeclarationToTypeNode(c),
                    factory
                );
                const irV = exprCompiler.mustImplicitlyCastTo(
                    exprCompiler.compile(c.vValue),
                    irT,
                    src
                );
                const name = getGlobalVarName(c);
                this.cfgBuilder.assign(factory.identifier(noSrc, name, irT), irV, noSrc);
            }
        }

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);
        }

        return this.finishCompile(src, name);
    }
}
