import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { CFGBuilder } from "./cfg_builder";
import { BaseSrc, noSrc } from "maru-ir2";
import { IRFactory } from "./factory";

export abstract class BaseFunctionCompiler {
    protected readonly cfgBuilder: CFGBuilder;
    protected readonly funScope: ir.Scope;

    constructor(
        factory: IRFactory,
        protected readonly globalScope: ir.Scope,
        protected readonly solVersion: string,
        protected readonly abiVersion: sol.ABIEncoderVersion,
        protected readonly contractStruct?: ir.StructDefinition
    ) {
        this.funScope = new ir.Scope(globalScope);
        this.cfgBuilder = new CFGBuilder(this.globalScope, this.funScope, this.solVersion, factory);
    }

    /**
     * Finish up compiling the current function and return it. Takes care of:
     * 1. Zero initializing locals
     * 2. Adding the final return in the returnBB
     * 3. Building the actuall ir.FunctionDeclaration
     */
    protected finishCompile(src: BaseSrc, name: string): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;

        // After all local variables have been collected 0-init locals and returns (as per Solidity semantics).
        this.cfgBuilder.zeroInitLocals();

        this.cfgBuilder.curBB = this.cfgBuilder.returnBB;
        this.cfgBuilder.return(
            this.cfgBuilder.returns.map((retDecl) =>
                factory.identifier(noSrc, retDecl.name, retDecl.type)
            ),
            noSrc
        );

        return factory.functionDefinition(
            src,
            [],
            [],
            name,
            this.cfgBuilder.args,
            this.cfgBuilder.locals,
            this.cfgBuilder.returns.map((retDecl) => retDecl.type),
            this.cfgBuilder.getCFG()
        );
    }

    abstract compile(): ir.FunctionDefinition;
}
