import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { assert, pp } from "solc-typed-ast";
import { ModifierStack2, StatementCompiler } from "./statement_compiler";
import { ExpressionCompiler } from "./expression_compiler";
import { noSrc } from "maru-ir2";
import { blockPtrT, msgPtrT, transpileType, u160 } from "./typing";
import { ASTSource } from "../ir/source";
import { getDesugaredFunName, getDesugaredPartialConstructorName } from "./resolving";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { IRFactory } from "./factory";

type FunctionScope = sol.ContractDefinition | sol.SourceUnit;

export class FunctionCompiler extends BaseFunctionCompiler {
    private readonly stmtCompiler: StatementCompiler;
    private readonly exprCompiler: ExpressionCompiler;
    private readonly modifiers: ModifierStack2;

    private get isPartialConstructor(): boolean {
        return this.fun.kind === sol.FunctionKind.Constructor;
    }

    constructor(
        factory: IRFactory,
        private readonly fun: sol.FunctionDefinition,
        globalScope: ir.Scope,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly scope: FunctionScope,
        contractStruct?: ir.StructDefinition
    ) {
        super(factory, globalScope, solVersion, abiVersion, contractStruct);
        this.exprCompiler = new ExpressionCompiler(this.cfgBuilder);

        this.modifiers = this.getModifierStack();
        this.modifiers.push([this.fun.vBody, undefined]);

        this.stmtCompiler = new StatementCompiler(
            this.cfgBuilder,
            this.exprCompiler,
            this.modifiers,
            abiVersion
        );
    }

    /**
     * Compile the current solidity function to a low-level IR function and return it.
     */
    compile(): ir.FunctionDefinition {
        const src = new ASTSource(this.fun);
        let name: string;

        if (this.fun.kind === sol.FunctionKind.Constructor) {
            const contract = this.fun.vScope as sol.ContractDefinition;

            name = getDesugaredPartialConstructorName(
                contract,
                this.scope as sol.ContractDefinition
            );
        } else {
            name = getDesugaredFunName(
                this.fun,
                this.scope,
                this.abiVersion,
                this.cfgBuilder.infer
            );
        }

        this.collectArgs();
        this.collectReturns();

        if (!this.canEmitBody()) {
            return this.cfgBuilder.factory.functionDefinition(
                src,
                [],
                [],
                name,
                this.cfgBuilder.args,
                this.cfgBuilder.locals,
                this.cfgBuilder.returns
            );
        }

        // For partial constructors:
        // 1. 0-init all state variables
        // 2. Execute any inline initializers
        if (this.isPartialConstructor) {
            const contract = this.fun.vScope;
            assert(
                contract instanceof sol.ContractDefinition && this.contractStruct !== undefined,
                `Constructors need a this struct`
            );

            for (const stateVar of contract.vStateVariables) {
                let initialVal: ir.Expression;

                if (stateVar.vValue !== undefined) {
                    initialVal = this.exprCompiler.compile(stateVar.vValue);
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
        }

        console.error(`Modifier stack size for ${this.fun.name} is ${pp(this.modifiers)}`);
        this.stmtCompiler.compile(new sol.PlaceholderStatement(0, "0:0:0", "PlaceholderStatement"));

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);
        }

        return this.finishCompile(src, name);
    }

    /**
     * Return true IFF we can emit a body for the low-level IR function. We may not emit a body for this function if:
     * 1. The solidity function is abstract
     * 2. The solidity function has an abstract modifier
     */
    private canEmitBody(): boolean {
        for (const [block] of this.modifiers) {
            if (!block) {
                return false;
            }
        }

        return true;
    }

    /**
     * Add all function arguments (including the implicit this argument) to the IR function.
     */
    private collectArgs(): void {
        const factory = this.cfgBuilder.factory;
        // Add this argument
        const thisT = this.contractStruct
            ? factory.pointerType(
                  noSrc,
                  factory.userDefinedType(noSrc, this.contractStruct.name, [], []),
                  factory.memConstant(noSrc, "storage")
              )
            : u160;

        this.cfgBuilder.addThis(thisT);

        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);

        // Add solidity fun arguments
        for (const decl of this.fun.vParameters.vParameters) {
            this.cfgBuilder.addArg(decl);
        }
    }

    /**
     * Add all function returns to the IR function. If any returns are unnamed give them names
     */
    private collectReturns(): void {
        for (const decl of this.fun.vReturnParameters.vParameters) {
            this.cfgBuilder.addRet(decl);
        }
    }

    /**
     * Given an (optional) raw function definition `f` return a stack of blocks
     * and modifier definitions. The topmost block is the body of the function
     * itself. `desugarFunction` unwinds the queue, instantiating modifier
     * arguments and desugaring the blocks, until it reaches and desugares the
     * body itself.
     *
     * If `f` is undefined return an empty queue.
     */
    private getModifierStack(): ModifierStack2 {
        const modifiers: ModifierStack2 = [];
        const scope = this.fun.vScope;

        for (const m of this.fun.vModifiers) {
            if (m.vModifier instanceof sol.ModifierDefinition) {
                assert(
                    scope instanceof sol.ContractDefinition,
                    "Can't apply modifiers to free functions."
                );

                const modifierDef = sol.resolve(
                    scope,
                    m.vModifier,
                    this.cfgBuilder.infer
                ) as sol.ModifierDefinition;

                modifiers.push([modifierDef.vBody, m]);
            } else if (m.vModifier instanceof sol.ContractDefinition) {
                // Nothing to do
            } else {
                assert(false, "Modifier Invocation references unexpected type", m);
            }
        }

        return modifiers;
    }
}
