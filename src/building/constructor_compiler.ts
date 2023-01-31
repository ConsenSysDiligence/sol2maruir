import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { FunctionCompiler } from "./function_compiler";
import { CFGBuilder } from "./cfg_builder";
import { noSrc } from "maru-ir2";
import { grabInheritanceArgs } from "../utils";
import { getDesugaredConstructorName, getDesugaredPartialConstructorName } from "./resolving";
import { ExpressionCompiler } from "./expression_compiler";
import { ASTSource } from "../ir/source";
import { blockPtrT, msgPtrT, noType, transpileType, u16, u160 } from "./typing";
import { ImplicitConstructorCompiler } from "./implicit_constructor_compiler";
import { IRFactory } from "./factory";

/**
 * The logic around compiling constructors is complex enough to
 * separate it in its own class.
 */
export class ConstructorCompiler {
    constructor(
        private readonly factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        private readonly globalScope: ir.Scope,
        private readonly solVersion: string,
        private readonly abiVersion: sol.ABIEncoderVersion,
        private readonly irContract: ir.StructDefinition
    ) {}

    public compilePartialConstructors(): ir.FunctionDefinition[] {
        const res: ir.FunctionDefinition[] = [];

        for (const base of this.contract.vLinearizedBaseContracts) {
            if (base.vConstructor) {
                const funCompiler = new FunctionCompiler(
                    this.factory,
                    base.vConstructor,
                    this.globalScope,
                    this.solVersion,
                    this.abiVersion,
                    this.contract,
                    this.irContract
                );

                if (!funCompiler.canEmitBody()) {
                    continue;
                }

                res.push(funCompiler.compile());
                continue;
            }

            // If no explicit constructor, emit an implicit constructor that
            const implCompiler = new ImplicitConstructorCompiler(
                this.factory,
                base,
                this.contract,
                this.globalScope,
                this.solVersion,
                this.abiVersion,
                this.irContract
            );

            res.push(implCompiler.compile());
        }

        return res;
    }

    public compileConstructor(): ir.FunctionDefinition {
        const funScope = new ir.Scope(this.globalScope);
        const builder = new CFGBuilder(this.globalScope, funScope, this.solVersion, this.factory);
        const exprCompiler = new ExpressionCompiler(builder, this.abiVersion);

        const irContractT = this.factory.userDefinedType(noSrc, this.irContract.name, [], []);
        const thisT = this.factory.pointerType(
            noSrc,
            irContractT,
            this.factory.memConstant(noSrc, "storage")
        );

        builder.addIRArg("block", blockPtrT, noSrc);
        builder.addIRArg("msg", msgPtrT, noSrc);

        if (this.contract.vConstructor) {
            this.contract.vConstructor.vParameters.vParameters.forEach((decl) =>
                builder.addArg(decl)
            );
        }

        builder.addThis(thisT, true);

        /**
         * The constructor emits the calls to parent constructors. It needs to:
         *
         *  1) Invoke parent constructor calls in the reverse C3 linearization order
         *  2) Not call a parent constructor more than once.
         *  3) Emit the explicit args for any constructors which the user called explicitly
         */
        // List of referenced contract definitions. Can be used to call constructors in base classes
        const constructorCalls: Array<[sol.ContractDefinition, sol.Expression[]]> = [];
        const argMap = new Map<sol.ContractDefinition, sol.Expression[]>();
        grabInheritanceArgs(this.contract, argMap);

        const scopeBases = this.contract.vLinearizedBaseContracts;

        for (let idx = scopeBases.length - 1; idx > 0; idx--) {
            const base: sol.ContractDefinition = scopeBases[idx];

            const constrArgs = argMap.get(base) || [];

            constructorCalls.push([base, constrArgs]);
        }

        // Base contracts (both direct and indirect) and compiled arguments to their constructors in C3-linearized order
        const processedConstructorCalls: Array<[ir.Identifier, ir.Expression[]]> = [];

        /**
         * The arguments to a base contract B's constructor could be overridden
         * in any child contract C of B, and may depend on C's constructor's
         * arguments. Thus we compute the arguments for each base's
         * constructors in *reversed* C3-linearization order. (So that the
         * arguments to the child's constructor are computed before the bases.)
         */
        for (let i = constructorCalls.length - 1; i >= 0; i--) {
            const [base, rawArgs] = constructorCalls[i];

            const solFormalTs: sol.TypeNode[] = [];

            if (base.vConstructor) {
                solFormalTs.push(
                    ...base.vConstructor.vParameters.vParameters.map((decl) =>
                        builder.infer.variableDeclarationToTypeNode(decl)
                    )
                );
            }

            const irFormalTs = solFormalTs.map((irFormalT) =>
                transpileType(irFormalT, this.factory)
            );

            // The first argument to the base constructor is `this` casted to the base type.
            const constrArgs: ir.Expression[] = [
                builder.this(noSrc),
                this.factory.identifier(noSrc, "block", blockPtrT),
                this.factory.identifier(noSrc, "msg", msgPtrT)
            ];

            const constrId = this.factory.identifier(
                noSrc,
                getDesugaredPartialConstructorName(base, this.contract),
                noType
            );

            for (let argIdx = 0; argIdx < rawArgs.length; argIdx++) {
                const rawArg = rawArgs[argIdx];
                const irArg = exprCompiler.compile(rawArg);
                const castedIrArg = exprCompiler.mustCastTo(irArg, irFormalTs[argIdx], irArg.src);
                constrArgs.push(castedIrArg);
            }

            /**
             * Insert processed call at start of array
             * to maintain `processedConstructorCalls` in C3-linearized order.
             */
            processedConstructorCalls.unshift([constrId, constrArgs]);
        }

        // Insert a call to the partial constructor of our class itself
        const myPartialConstr = this.factory.identifier(
            noSrc,
            getDesugaredPartialConstructorName(this.contract, this.contract),
            noType
        );

        processedConstructorCalls.push([
            myPartialConstr,
            [
                builder.this(noSrc),
                ...builder.args.map((decl) => this.factory.identifier(noSrc, decl.name, decl.type))
            ]
        ]);

        // Allocate contract struct
        builder.allocStruct(
            builder.this(noSrc),
            irContractT,
            this.factory.memConstant(noSrc, "storage"),
            noSrc
        );

        // Set __address__
        const addrTmp = builder.getTmpId(u160, noSrc);
        builder.call(
            [addrTmp],
            this.factory.identifier(noSrc, "builtin_register_contract", noType),
            [],
            [thisT],
            [builder.this(noSrc)],
            noSrc
        );
        builder.storeField(
            builder.this(noSrc),
            "__address__",
            this.factory.identifier(noSrc, addrTmp.name, u160),
            noSrc
        );

        // Set __rtti__
        builder.storeField(
            builder.this(noSrc),
            "__rtti__",
            this.factory.numberLiteral(noSrc, BigInt(this.contract.id), 10, u16),
            noSrc
        );

        // Emit direct calls to all C3-linearized base constructors.
        for (const [constrId, constrArgs] of processedConstructorCalls) {
            builder.call([], constrId, [], [], constrArgs, noSrc);
        }

        builder.jump(builder.returnBB, noSrc);

        /**
         * At this point we have collected the list of all local variables.
         */
        builder.zeroInitLocals();

        builder.curBB = builder.returnBB;
        builder.return([builder.this(noSrc)], noSrc);

        return this.factory.functionDefinition(
            new ASTSource(this.contract.vConstructor ? this.contract.vConstructor : this.contract),
            [],
            [],
            getDesugaredConstructorName(this.contract),
            builder.args,
            builder.locals,
            [thisT],
            builder.getCFG()
        );
    }
}
