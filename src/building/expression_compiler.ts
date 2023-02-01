import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { CFGBuilder } from "./cfg_builder";
import { assert, ContractKind, pp } from "solc-typed-ast";
import { ASTSource } from "../ir/source";
import { BaseSrc, GlobalVariable, noSrc } from "maru-ir2";
import { boolT, noType, transpileType, u160, u256, u8, u8ArrExcPtr, u8ArrMemPtr } from "./typing";
import { single } from "../utils";
import { gte } from "semver";
import { IRFactory } from "./factory";
import {
    FunctionScope,
    getDesugaredConstructorName,
    getDispatchName,
    getIRContractName,
    getIRStructDefName
} from "./resolving";
import { IRTuple2 } from "../ir";
import { CopyFunCompiler } from "./copy_fun_compiler";

const overflowBuiltinMap = new Map<string, string>([
    ["+", "builtin_add_overflows"],
    ["-", "builtin_sub_overflows"],
    ["*", "builtin_mul_overflows"],
    ["/", "builtin_div_overflows"],
    ["**", "builtin_pow_overflows"]
]);

export class ExpressionCompiler {
    private factory: IRFactory;

    constructor(
        public readonly cfgBuilder: CFGBuilder,
        public readonly abiEncodeVersion: sol.ABIEncoderVersion
    ) {
        this.factory = cfgBuilder.factory;
    }

    /**
     * Compile a single identifier.
     */
    compileIdentifier(expr: sol.Identifier): ir.Expression {
        const builder = this.cfgBuilder;
        const src = new ASTSource(expr);

        if (expr.vIdentifierType === sol.ExternalReferenceType.UserDefined) {
            const def = expr.vReferencedDeclaration;

            assert(def !== undefined, `Missing def for user-defined identifier {0}`, expr);

            if (def instanceof sol.VariableDeclaration) {
                if (def.stateVariable) {
                    const thisId = builder.this(noSrc);
                    const thisT = builder.typeOfLocal("this");
                    return builder.loadField(thisId, thisT, def.name, src);
                } else {
                    return builder.getVarId(def, src);
                }
            }
        }

        throw new Error(`NYI compileIdnetifier(${pp(expr)})`);
    }

    assignTo(lhs: sol.Expression, rhs: ir.Expression, assignSrc: ir.BaseSrc): ir.Expression {
        if (lhs instanceof sol.Identifier) {
            const def = lhs.vReferencedDeclaration;
            assert(def !== undefined, `No def for {0}`, lhs);

            if (def instanceof sol.VariableDeclaration) {
                const lhsT = transpileType(
                    this.cfgBuilder.infer.variableDeclarationToTypeNode(def),
                    this.factory
                );

                const castedRHS = this.mustCastTo(rhs, lhsT, rhs.src);

                if (def.stateVariable) {
                    this.cfgBuilder.storeField(
                        this.cfgBuilder.this(noSrc),
                        lhs.name,
                        castedRHS,
                        assignSrc
                    );

                    return rhs;
                }

                const irVar = this.cfgBuilder.getVarId(def, new ASTSource(lhs));
                this.cfgBuilder.assign(irVar, castedRHS, assignSrc);
                return irVar;
            }
        }

        if (lhs instanceof sol.MemberAccess) {
            const base = this.compile(lhs.vExpression);
            const baseIrT = this.typeOf(base);

            if (baseIrT instanceof ir.PointerType && baseIrT.toType instanceof ir.UserDefinedType) {
                const def = this.cfgBuilder.globalScope.getTypeDecl(baseIrT.toType);

                if (def instanceof ir.StructDefinition) {
                    this.cfgBuilder.storeField(base, lhs.memberName, rhs, assignSrc);
                    return rhs;
                }
            }
        }

        throw new Error(`NYI Assigning to solidity expression ${pp(lhs)}`);
    }

    /**
     * Compile a solidity assignment. This needs to handle:
     * TODO:
     *  - breaking tuple assignments into primitive assignments
     *  - converting assignments to array/structs/map into heap operations
     * DONE:
     *  - implicit casts from lhs to rhs
     *  - desugaring assignments of the shape +=, -=...
     */
    compileAssignment(expr: sol.Assignment): ir.Expression {
        const lhsT = this.cfgBuilder.infer.typeOf(expr.vLeftHandSide);
        const lhsIRT = transpileType(lhsT, this.factory);
        const rhsSolT = this.cfgBuilder.infer.typeOf(expr.vRightHandSide);

        let rhs: ir.Expression = this.compile(expr.vRightHandSide);

        // Perform any implicit casts from the rhs to the lhs (e.g. u8 to u16)
        const castedRHS = this.castTo(rhs, lhsIRT, new ASTSource(expr));

        assert(castedRHS !== undefined, `Cannot assign ${rhsSolT.pp()} to ${lhsT.pp()}`);

        rhs = castedRHS;

        // Handle +=,-=, ...
        if (expr.operator !== "=") {
            rhs = this.makeBinaryOperation(
                this.compile(expr.vLeftHandSide),
                expr.operator[0] as ir.BinaryOperator,
                rhs,
                this.isArithmeticChecked(expr),
                new ASTSource(expr)
            );
        }

        // Make the actual assignment
        return this.assignTo(expr.vLeftHandSide, rhs, new ASTSource(expr));
    }

    /**
     * Infer the type of an int literal from the context in which its used.
     * This assumes that the operations invloving literals have been folded.
     * @param expr
     */
    inferIntType(expr: sol.Expression, value: bigint): sol.IntType {
        const parentE = expr.parent;
        let resT: sol.TypeNode;

        if (parentE instanceof sol.BinaryOperation) {
            if (["<<", ">>", "**"].includes(parentE.operator)) {
                if (expr === parentE.vRightExpression) {
                    return sol.smallestFittingType(value) as sol.IntType;
                }

                throw new Error(`NYI type of int literal as left child of << >> or **`);
            }

            resT = this.cfgBuilder.infer.typeOf(
                expr === parentE.vLeftExpression
                    ? parentE.vRightExpression
                    : parentE.vLeftExpression
            );
        } else if (parentE instanceof sol.Assignment) {
            assert(expr === parentE.vRightHandSide, `Unexpected position of literal in assignment`);
            resT = this.cfgBuilder.infer.typeOf(parentE.vLeftHandSide);
        } else if (parentE instanceof sol.VariableDeclarationStatement) {
            assert(
                parentE.vDeclarations.length === 1,
                `NYI int literal inference in tuple assignments`
            );
            resT = this.cfgBuilder.infer.variableDeclarationToTypeNode(parentE.vDeclarations[0]);
        } else if (parentE instanceof sol.Conditional) {
            resT = this.cfgBuilder.infer.typeOf(parentE);
        } else if (parentE instanceof sol.VariableDeclaration) {
            // This is an inline initializer of a state variable
            resT = this.cfgBuilder.infer.variableDeclarationToTypeNode(parentE);
        } else {
            throw new Error(`NYI infer type of literal inside of an ${pp(parentE)}`);
        }

        assert(resT instanceof sol.IntType, `Expected int type not {0}`, resT);
        return resT;
    }

    getStrLit(str: string, src: ir.BaseSrc): ir.Identifier {
        const val: bigint[] = [...Buffer.from(str, "utf-8")].map((x) => BigInt(x));

        const name = this.cfgBuilder.uid.get(`_str_lit_`);

        this.cfgBuilder.globalScope.define(
            this.factory.globalVariable(
                noSrc,
                name,
                u8ArrExcPtr,
                this.factory.structLiteral(noSrc, [
                    ["len", this.factory.numberLiteral(noSrc, BigInt(val.length), 10, u256)],
                    [
                        "arr",
                        this.factory.arrayLiteral(
                            noSrc,
                            val.map((v) => this.factory.numberLiteral(noSrc, v, 10, u8))
                        )
                    ]
                ])
            )
        );

        return this.factory.identifier(src, name, u8ArrExcPtr);
    }

    compileLiteral(expr: sol.Literal): ir.Expression {
        const src = new ASTSource(expr);

        if (expr.kind === sol.LiteralKind.Bool) {
            return this.factory.booleanLiteral(src, expr.value === "true");
        }

        if (expr.kind === sol.LiteralKind.Number) {
            const val = BigInt(expr.value);
            const type = transpileType(
                sol.smallestFittingType(val) as sol.IntType,
                this.factory
            ) as ir.IntType;
            return this.factory.numberLiteral(
                src,
                BigInt(expr.value),
                expr.value.startsWith("0x") ? 16 : 10,
                type
            );
        }

        if (
            expr.kind === sol.LiteralKind.HexString ||
            expr.kind === sol.LiteralKind.String ||
            expr.kind === sol.LiteralKind.UnicodeString
        ) {
            assert(expr.kind === "string", `NYI literal kind {0}`, expr.kind);

            return this.getStrLit(expr.value, src);
        }

        throw new Error(`NYI literal kind ${expr.kind}`);
    }

    /**
     * Compile a branch if `cond` is true, to a basic block that raises a
     * `Panic(uint256)` with the specified code.
     */
    makeConditionalPanic(cond: ir.Expression, code: number, src: BaseSrc): void {
        const panicBB = this.cfgBuilder.mkBB();
        const successBB = this.cfgBuilder.mkBB();

        this.cfgBuilder.branch(cond, panicBB, successBB, src);
        this.cfgBuilder.curBB = panicBB;

        this.cfgBuilder.call(
            [],
            this.factory.identifier(noSrc, "sol_panic", noType),
            [],
            [],
            [this.factory.numberLiteral(noSrc, BigInt(code), 10, u256)],
            src
        );

        this.cfgBuilder.curBB = successBB;
    }

    makeBinaryOperation(
        lhs: ir.Expression,
        op: string,
        rhs: ir.Expression,
        checked: boolean,
        src: BaseSrc
    ): ir.BinaryOperation {
        const rhsT = this.typeOf(rhs);
        const lhsT = this.typeOf(lhs);

        /// Always emit a div-by-zero check
        if (op === "/" || op === "%") {
            const cond = this.factory.binaryOperation(
                noSrc,
                rhs,
                "==",
                this.factory.numberLiteral(noSrc, 0n, 10, rhsT as ir.IntType),
                boolT
            );

            this.makeConditionalPanic(cond, 0x12, src);
        }

        if (checked) {
            const overflowCheck = overflowBuiltinMap.get(op);

            if (overflowCheck) {
                const isOverflowing = this.cfgBuilder.getTmpId(boolT, noSrc);
                const lhsT = this.typeOf(lhs);

                // Since ** can take different int types, its builtin checker has two type args
                const typeArgs = op === "**" ? [lhsT, rhsT] : [rhsT];

                this.cfgBuilder.call(
                    [isOverflowing],
                    this.factory.identifier(noSrc, overflowCheck, noType),
                    [],
                    typeArgs,
                    [lhs, rhs],
                    noSrc
                );

                this.makeConditionalPanic(isOverflowing, 0x11, src);
            }
        }

        return this.factory.binaryOperation(src, lhs, op as ir.BinaryOperator, rhs, lhsT);
    }

    compileBinaryOperation(expr: sol.BinaryOperation): ir.Expression {
        if (sol.isConstant(expr)) {
            return this.compileConstExpr(expr);
        }

        let lExp = this.compile(expr.vLeftExpression);
        let rExp = this.compile(expr.vRightExpression);
        const src = new ASTSource(expr);

        /// Power and bitshifts are the only binary operators
        /// where we don't insist that the left and right sub-expressions
        /// are of the same type.
        if (!["**", ">>", "<<"].includes(expr.operator)) {
            const lSoLT = this.cfgBuilder.infer.typeOf(expr.vLeftExpression);
            const rSolT = this.cfgBuilder.infer.typeOf(expr.vRightExpression);

            [lExp, rExp] = this.unifyTypes(
                expr.vLeftExpression,
                expr.vRightExpression,
                lSoLT,
                rSolT,
                lExp,
                rExp,
                this.typeOf(lExp),
                this.typeOf(rExp)
            );
        }

        const op = this.makeBinaryOperation(
            lExp,
            expr.operator as ir.BinaryOperator,
            rExp,
            this.isArithmeticChecked(expr),
            src
        );

        return op;
    }

    compileConstExpr(expr: sol.Expression): ir.Expression {
        const val = sol.evalConstantExpr(expr);
        const src = new ASTSource(expr);

        if (typeof val === "boolean") {
            return this.factory.booleanLiteral(src, val);
        } else if (typeof val === "bigint") {
            return this.factory.numberLiteral(
                src,
                val,
                10,
                transpileType(sol.smallestFittingType(val) as sol.IntType, this.factory)
            );
        } else {
            throw new Error(`NYI compileConstExpr(${pp(expr)}) with val ${val}`);
        }
    }

    isArithmeticChecked(node: sol.ASTNode): boolean {
        return (
            gte(this.cfgBuilder.solVersion, "0.8.0") &&
            node.getClosestParentByType(sol.UncheckedBlock) === undefined
        );
    }

    compileUnaryOperation(expr: sol.UnaryOperation): ir.Expression {
        if (sol.isConstant(expr)) {
            return this.compileConstExpr(expr);
        }

        const src = new ASTSource(expr);
        const subExp = this.compile(expr.vSubExpression);

        if (expr.operator === "!") {
            return this.factory.unaryOperation(src, "!", subExp, boolT);
        }

        if (expr.operator === "-") {
            const subT = this.typeOf(subExp);
            if (this.isArithmeticChecked(expr)) {
                const isOverflowing = this.cfgBuilder.getTmpId(boolT, noSrc);

                this.cfgBuilder.call(
                    [isOverflowing],
                    this.factory.identifier(noSrc, "builtin_neg_overflows", noType),
                    [],
                    [subT],
                    [subExp],
                    noSrc
                );

                this.makeConditionalPanic(isOverflowing, 0x11, src);
            }

            return this.factory.unaryOperation(src, "-", subExp, subT);
        }

        if (expr.operator === "++" || expr.operator === "--") {
            const subT = this.typeOf(subExp);
            assert(subT instanceof ir.IntType, `Unexpected type {0} of {1}`, subT, subExp);
            let res: ir.Expression;

            if (expr.prefix) {
                res = this.compile(expr.vSubExpression);
            } else {
                res = this.cfgBuilder.getTmpId(subT, src);
                this.cfgBuilder.assign(res as ir.Identifier, subExp, src);
            }

            this.assignTo(
                expr.vSubExpression,
                this.makeBinaryOperation(
                    subExp,
                    expr.operator === "++" ? "+" : "-",
                    this.factory.numberLiteral(noSrc, 1n, 10, subT),
                    this.isArithmeticChecked(expr),
                    src
                ),
                src
            );

            return res;
        }

        throw new Error(`NYI unary operator ${expr.operator}`);
    }

    compileTupleExpression(expr: sol.TupleExpression): ir.Expression {
        if (expr.vOriginalComponents.length === 1) {
            assert(expr.vOriginalComponents[0] !== null, ``);
            return this.compile(expr.vOriginalComponents[0]);
        }

        const type = transpileType(this.cfgBuilder.infer.typeOf(expr), this.factory);

        return this.factory.tuple(
            new ASTSource(expr),
            expr.vComponents.map((compE) => this.compile(compE)),
            type
        );
    }

    private prepEncodeArgs(solArgs: sol.Expression[]): [ir.Expression[], ir.Type[]] {
        const args: ir.Expression[] = [];
        const argTs: ir.Type[] = [];

        for (const solArg of solArgs) {
            const solType = this.cfgBuilder.infer.typeOf(solArg);
            const irArg = this.compile(solArg);
            const irArgT = this.typeOf(irArg);
            const abiTypeName = this.getStrLit(sol.abiTypeToCanonicalName(solType), noSrc);

            args.push(abiTypeName, irArg);
            argTs.push(irArgT);
        }

        return [args, argTs];
    }

    compileBuiltinFunctionCall(expr: sol.FunctionCall): ir.Expression {
        if (expr.vFunctionName === "assert") {
            this.cfgBuilder.call(
                [],
                this.factory.identifier(new ASTSource(expr.vCallee), "sol_assert", noType),
                [],
                [],
                [this.compile(single(expr.vArguments))],
                new ASTSource(expr)
            );

            return this.factory.tuple(noSrc, [], noType);
        }

        if (expr.vFunctionName === "revert") {
            this.cfgBuilder.call(
                [],
                this.factory.identifier(new ASTSource(expr.vCallee), "sol_revert", noType),
                [],
                [],
                [],
                new ASTSource(expr)
            );

            return this.factory.tuple(noSrc, [], noType);
        }

        if (expr.vFunctionName === "encode") {
            const [args, argTs] = this.prepEncodeArgs(expr.vArguments);
            const builtinName = `builtin_abi_encode_${expr.vArguments.length}`;
            const res = this.cfgBuilder.getTmpId(u8ArrMemPtr);

            this.cfgBuilder.call(
                [res],
                this.factory.identifier(noSrc, builtinName, noType),
                [],
                argTs,
                args,
                new ASTSource(expr)
            );

            return res;
        }

        throw new Error(`NYI compileBuiltinFunctionCall(${expr.vFunctionName})`);
    }

    compileNewCall(expr: sol.FunctionCall): ir.Expression {
        const newE = expr.vCallee as sol.NewExpression;
        const newSolT = this.cfgBuilder.infer.typeOf(expr);
        const newIrT = transpileType(newSolT, this.factory);
        let resId: ir.Identifier;
        const src = new ASTSource(expr);

        // New array
        if (newE.vTypeName instanceof sol.ArrayTypeName) {
            resId = this.cfgBuilder.getTmpId(newIrT);
            assert(
                newIrT instanceof ir.PointerType &&
                    newIrT.toType instanceof ir.UserDefinedType &&
                    expr.vArguments.length === 1,
                ``
            );

            const irSize = this.compile(expr.vArguments[0]);
            const size = this.mustCastTo(irSize, u256, irSize.src);
            this.cfgBuilder.call(
                [resId],
                this.factory.identifier(noSrc, "new_array", noType),
                [this.factory.memConstant(noSrc, "memory")],
                [newIrT.toType.typeArgs[0]],
                [size],
                src
            );
        } else if (
            newE.vTypeName instanceof sol.UserDefinedTypeName &&
            newE.vTypeName.vReferencedDeclaration instanceof sol.ContractDefinition
        ) {
            // Contract
            const contract = newE.vTypeName.vReferencedDeclaration;
            const irConstructorName = getDesugaredConstructorName(contract);

            const solFormalTs = contract.vConstructor
                ? contract.vConstructor.vParameters.vParameters.map((decl) =>
                      this.cfgBuilder.infer.variableDeclarationToTypeNode(decl)
                  )
                : [];
            const irFormalTs = solFormalTs.map((solT) => transpileType(solT, this.factory));

            const args: ir.Expression[] = [];

            for (let i = 0; i < expr.vArguments.length; i++) {
                const irArg = this.compile(expr.vArguments[i]);
                args.push(this.mustCastTo(irArg, irFormalTs[i], irArg.src));
            }

            args.splice(0, 0, this.cfgBuilder.blockPtr(noSrc), this.cfgBuilder.msgPtr(noSrc));

            const ptrT = this.factory.pointerType(
                noSrc,
                this.factory.userDefinedType(noSrc, getIRContractName(contract), [], []),
                this.factory.memConstant(noSrc, "storage")
            );

            const ptrId = this.cfgBuilder.getTmpId(ptrT, src);

            this.cfgBuilder.call(
                [ptrId],
                this.factory.identifier(noSrc, irConstructorName, noType),
                [],
                [],
                args,
                src
            );

            resId = this.cfgBuilder.loadField(ptrId, ptrT, "__address__", src);
        } else {
            throw new Error(`NYI new expression of type ${newE.print()}`);
        }

        return resId;
    }

    private stripCallOptions(
        expr: sol.Expression
    ): [
        sol.Expression,
        sol.Expression | undefined,
        sol.Expression | undefined,
        sol.Expression | undefined
    ] {
        let callee: sol.Expression = expr;
        let gas: sol.Expression | undefined;
        let value: sol.Expression | undefined;
        let salt: sol.Expression | undefined;

        while (true) {
            if (
                callee instanceof sol.FunctionCall &&
                callee.vExpression instanceof sol.MemberAccess &&
                ["gas", "value"].includes(callee.vExpression.memberName)
            ) {
                if (callee.vExpression.memberName === "gas") {
                    gas = callee.vArguments[0];
                } else {
                    value = callee.vArguments[0];
                }

                callee = callee.vExpression.vExpression;
            } else if (callee instanceof sol.FunctionCallOptions) {
                for (const [option, rawValue] of callee.vOptionsMap) {
                    if (option === "gas") {
                        gas = rawValue;
                    } else if (option === "value") {
                        value = rawValue;
                    } else if (option === "salt") {
                        salt = rawValue;
                    } else {
                        assert(false, `Unknown function call option: ${option}`, callee);
                    }
                }

                callee = callee.vExpression;
            } else {
                break;
            }
        }

        return [callee, gas, value, salt];
    }

    /**
     * Helper to decode a NON-builtin solidity call. This computes and returns:
     * 1. The "this" argument. Depending on the context its either a u160 or a struct pointer
     * 2. Any gas modifiers
     * 3. Any value modifiers
     * 4. Any salt modifiers
     * 5. Whether this is an external call
     * 6. The name of the compiled function
     * 8. The Solidity formal argument types
     * 7. The Solidity return types
     * @param expr
     */
    private decodeCall(
        expr: sol.FunctionCall
    ): [
        ir.Expression,
        sol.Expression | undefined,
        sol.Expression | undefined,
        sol.Expression | undefined,
        boolean,
        string,
        sol.TypeNode[],
        sol.TypeNode[]
    ] {
        const [callee, gasModifier, valueModifier, saltModifier] = this.stripCallOptions(
            expr.vExpression
        );

        const funT = this.cfgBuilder.infer.typeOf(callee);
        let retTs: sol.TypeNode[] = [];
        let argTs: sol.TypeNode[] = [];

        if (funT instanceof sol.FunctionType) {
            retTs = funT.returns;
            argTs = funT.parameters;
        } else if (funT instanceof sol.FunctionLikeSetType) {
            const firstDef = funT.defs[0];

            assert(
                firstDef instanceof sol.FunctionType,
                `Unexpected def in decodeCall {0}`,
                firstDef
            );

            retTs = firstDef.returns;
            argTs = firstDef.parameters;
        }

        let thisExpr: ir.Expression;
        let isExternal: boolean;
        let irFun: string;

        let funScope: FunctionScope | undefined = expr.getClosestParentByType(
            sol.ContractDefinition
        );

        if (funScope === undefined) {
            funScope = expr.getClosestParentByType(sol.SourceUnit) as sol.SourceUnit;
        }

        // There are several cases:
        if (callee instanceof sol.Identifier) {
            // 1. Internal call to the same contract or a free function call
            throw new Error("NYI decoding identifier calls");
        } else if (callee instanceof sol.MemberAccess) {
            const base = callee.vExpression;
            const baseT = this.cfgBuilder.infer.typeOf(base);

            if (
                baseT instanceof sol.UserDefinedType &&
                baseT.definition instanceof sol.ContractDefinition
            ) {
                // 2. Call to another contract a.foo() (as a sub-case this.foo())
                isExternal = true;
                const def = expr.vReferencedDeclaration;

                assert(
                    def instanceof sol.FunctionDefinition,
                    `Unexpected declaration ${sol.pp(def)} for ${sol.pp(expr)}`
                );

                irFun = getDispatchName(
                    baseT.definition,
                    def,
                    this.cfgBuilder.infer,
                    this.abiEncodeVersion
                );

                const baseIRExpr = this.compile(base);
                thisExpr = this.mustCastTo(baseIRExpr, u160, new ASTSource(base));
            } else if (
                baseT instanceof sol.TypeNameType &&
                baseT.type instanceof sol.UserDefinedType &&
                baseT.type.definition instanceof sol.ContractDefinition &&
                baseT.type.definition.kind === ContractKind.Contract
            ) {
                // 3. Internal call of the shape ContractName.funName()
                throw new Error(
                    `NYI internal call to ${callee.print()} with base type ${baseT.pp()}`
                );
            } else if (
                baseT instanceof sol.TypeNameType &&
                baseT.type instanceof sol.UserDefinedType &&
                baseT.type.definition instanceof sol.ContractDefinition &&
                baseT.type.definition.kind === ContractKind.Library
            ) {
                // 4. Library call LibraryName.foo()
                throw new Error(
                    `NYI library call to ${callee.print()} with base type ${baseT.pp()}`
                );
            } else {
                // 5. Library call (some data).fun() with a `using for`
                throw new Error(`NYI call to ${callee.print()} with base type ${baseT.pp()}`);
            }
        } else {
            throw new Error(`NYI call to callee ${callee.print()}`);
        }

        return [
            thisExpr,
            gasModifier,
            valueModifier,
            saltModifier,
            isExternal,
            irFun,
            argTs,
            retTs
        ];
    }

    compileFunctionCall(expr: sol.FunctionCall): ir.Expression {
        if (expr.vFunctionCallType === sol.ExternalReferenceType.Builtin) {
            if (expr.vCallee instanceof sol.NewExpression) {
                return this.compileNewCall(expr);
            }

            return this.compileBuiltinFunctionCall(expr);
        }

        const src = new ASTSource(expr);
        const [irCallee, , , , , irFun, argTs, retTs] = this.decodeCall(expr);

        const args: ir.Expression[] = [];

        for (let i = 0; i < expr.vArguments.length; i++) {
            const irArg = this.compile(expr.vArguments[i]);
            const formalIRT = transpileType(argTs[i], this.factory);
            args.push(this.mustCastTo(irArg, formalIRT, irArg.src));
        }

        args.splice(0, 0, irCallee, this.cfgBuilder.blockPtr(noSrc), this.cfgBuilder.msgPtr(noSrc));

        const lhss = retTs.map((retT) =>
            this.cfgBuilder.getTmpId(transpileType(retT, this.factory), src)
        );
        const callee = this.factory.identifier(src, irFun, noType);

        this.cfgBuilder.call(lhss, callee, [], [], args, src);

        if (lhss.length === 0) {
            return noType;
        }

        if (lhss.length === 1) {
            return lhss[0];
        }

        return new IRTuple2(src, lhss);
    }

    compileStructConstructorCall(expr: sol.FunctionCall): ir.Expression {
        const calleeT = this.cfgBuilder.infer.typeOf(expr.vExpression);

        assert(
            calleeT instanceof sol.TypeNameType &&
                calleeT.type instanceof sol.UserDefinedType &&
                calleeT.type.definition instanceof sol.StructDefinition,
            `Expected UserDefinedTypeName not ${calleeT.pp()}`
        );

        const solStruct = calleeT.type.definition;
        const irStruct = this.cfgBuilder.globalScope.get(getIRStructDefName(solStruct));

        assert(
            irStruct instanceof ir.StructDefinition && irStruct.memoryParameters.length === 1,
            `Expected a struct def with single mem param not ${ir.pp(irStruct)}`
        );

        const structPtrT = this.factory.pointerType(
            noSrc,
            this.factory.userDefinedType(
                noSrc,
                irStruct.name,
                [this.factory.memConstant(noSrc, "memory")],
                []
            ),
            this.factory.memConstant(noSrc, "memory")
        );

        const res = this.cfgBuilder.getTmpId(structPtrT);

        throw new Error("NYI");
    }

    compileTypeConversion(expr: sol.FunctionCall): ir.Expression {
        throw new Error("NYI compileTypeConversion");
    }

    compileConditional(expr: sol.Conditional): ir.Expression {
        const src = new ASTSource(expr);
        const cond = this.compile(expr.vCondition);
        const trueBB = this.cfgBuilder.mkBB();
        const falseBB = this.cfgBuilder.mkBB();
        const unionBB = this.cfgBuilder.mkBB();

        const unionT = transpileType(this.cfgBuilder.infer.typeOf(expr), this.factory);
        const unionID = this.cfgBuilder.getTmpId(unionT, src);

        this.cfgBuilder.branch(cond, trueBB, falseBB, src);

        this.cfgBuilder.curBB = trueBB;
        const trueIRE = this.compile(expr.vTrueExpression);
        this.cfgBuilder.assign(unionID, trueIRE, src);
        this.cfgBuilder.jump(unionBB, src);

        this.cfgBuilder.curBB = falseBB;
        const falseIRE = this.compile(expr.vFalseExpression);
        this.cfgBuilder.assign(unionID, falseIRE, src);
        this.cfgBuilder.jump(unionBB, src);

        this.cfgBuilder.curBB = unionBB;
        return unionID;
    }

    compileIndexAccess(expr: sol.IndexAccess): ir.Expression {
        assert(expr.vIndexExpression !== undefined, ``);
        const base = this.compile(expr.vBaseExpression);
        const baseT = this.typeOf(base);
        const idx = this.compile(expr.vIndexExpression);
        const idxT = this.typeOf(idx);
        const src = new ASTSource(expr);

        if (
            baseT instanceof ir.PointerType &&
            baseT.toType instanceof ir.UserDefinedType &&
            baseT.toType.name === "ArrWithLen"
        ) {
            const elT = baseT.toType.typeArgs[0];
            const res = this.cfgBuilder.getTmpId(elT, src);
            this.cfgBuilder.call(
                [res],
                this.factory.identifier(noSrc, "sol_arr_read", noType),
                baseT.toType.memArgs,
                [elT, idxT],
                [base, idx],
                src
            );

            return res;
        }

        throw new Error(
            `NYI compiling index expression ${expr.print()} wth base type ${baseT.pp()}`
        );
    }

    /**
     * Compile a single Solidity expression `expr` and return the
     * corresponding low-level IR expression. Note that this may
     * add multiple ir statements, or even new basic blocks (e.g. for ternaries)
     */
    compile(expr: sol.Expression): ir.Expression {
        if (expr instanceof sol.Identifier) {
            return this.compileIdentifier(expr);
        } else if (expr instanceof sol.Assignment) {
            return this.compileAssignment(expr);
        } else if (expr instanceof sol.BinaryOperation) {
            return this.compileBinaryOperation(expr);
        } else if (expr instanceof sol.UnaryOperation) {
            return this.compileUnaryOperation(expr);
        } else if (expr instanceof sol.Literal) {
            return this.compileLiteral(expr);
        } else if (expr instanceof sol.TupleExpression) {
            return this.compileTupleExpression(expr);
        } else if (expr instanceof sol.FunctionCall) {
            if (expr.kind === sol.FunctionCallKind.FunctionCall) {
                return this.compileFunctionCall(expr);
            } else if (expr.kind === sol.FunctionCallKind.StructConstructorCall) {
                return this.compileStructConstructorCall(expr);
            } else if (expr.kind === sol.FunctionCallKind.TypeConversion) {
                return this.compileTypeConversion(expr);
            } else {
                throw new Error(`Unknown function call kind ${expr.kind}`);
            }
        } else if (expr instanceof sol.Conditional) {
            return this.compileConditional(expr);
        } else if (expr instanceof sol.IndexAccess) {
            return this.compileIndexAccess(expr);
        }

        throw new Error(`NYI Compiling ${pp(expr)}`);
    }

    typeOf(expr: ir.Expression): ir.Type {
        return this.factory.typeOf(expr);
    }

    unifyTypes(
        e1: sol.Expression,
        e2: sol.Expression,
        e1T: sol.TypeNode,
        e2T: sol.TypeNode,
        irE1: ir.Expression,
        irE2: ir.Expression,
        irE1T: ir.Type,
        irE2T: ir.Type
    ): [ir.Expression, ir.Expression, ir.Type] {
        if (ir.eq(irE1T, irE2T)) {
            return [irE1, irE2, irE1T];
        }

        // Try casting e1->e2
        const e1Casted = this.castTo(irE1, irE2T, new ASTSource(e1));

        if (e1Casted) {
            return [e1Casted, irE2, irE2T];
        }

        // Try casting e2->e1
        const e2Casted = this.castTo(irE2, irE1T, new ASTSource(e2));

        if (e2Casted) {
            return [irE1, e2Casted, irE1T];
        }

        throw new Error(
            `Cannot compute implicit union type of ${irE1.pp()} and ${irE2.pp()} of types ${irE1T.pp()} ${irE2T.pp()}`
        );
    }

    mustCastTo(expr: ir.Expression, toT: ir.Type, src: BaseSrc): ir.Expression {
        const res = this.castTo(expr, toT, src);

        assert(
            res !== undefined,
            `Couldn't cast {0} of type {1} to {2}`,
            expr,
            this.typeOf(expr),
            toT
        );

        return res;
    }

    castTo(expr: ir.Expression, toT: ir.Type, src: BaseSrc): ir.Expression | undefined {
        const fromT = this.typeOf(expr);

        // Types equal - no cast needed
        if (ir.eq(fromT, toT)) {
            return expr;
        }

        /**
         * For number literal casts just build a new literal instead of doing something like `u_160(0_u8)`
         */
        if (expr instanceof ir.NumberLiteral && toT instanceof ir.IntType && toT.fits(expr.value)) {
            return this.factory.numberLiteral(expr.src, expr.value, 16, toT);
        }

        // Contract -> address cast
        if (
            fromT instanceof ir.PointerType &&
            fromT.toType instanceof ir.UserDefinedType &&
            ir.eq(toT, u160)
        ) {
            const def = this.cfgBuilder.globalScope.getTypeDecl(fromT.toType);

            if (
                def instanceof ir.StructDefinition &&
                ir.eq(def.getFieldType("__address__"), u160)
            ) {
                return this.cfgBuilder.loadField(expr, fromT, "__address__", src);
            }
        }

        /**
         * Integer types with same sign can be implicitly converted fromSolT lower to higher bit-width
         */
        if (
            fromT instanceof ir.IntType &&
            toT instanceof ir.IntType &&
            fromT.signed === toT.signed &&
            fromT.nbits <= toT.nbits
        ) {
            return this.factory.cast(src, toT, expr);
        }

        /**
         * Integer types can implicitly change their sign
         * ONLY fromSolT unsigned -> signed, and ONLY to STRICTLY larger bit-widths
         */
        if (
            fromT instanceof ir.IntType &&
            toT instanceof ir.IntType &&
            fromT.signed !== toT.signed &&
            fromT.nbits < toT.nbits
        ) {
            return this.factory.cast(src, toT, expr);
        }

        /**
         * String literals are implicitly convertible to byteN if they fit
         */
        if (
            fromT instanceof ir.PointerType &&
            fromT.toType instanceof ir.UserDefinedType &&
            fromT.toType.name === "ArrWithLen" &&
            ir.eq(fromT.toType.typeArgs[0], u8) &&
            toT instanceof ir.IntType &&
            expr instanceof ir.Identifier
        ) {
            const def = this.cfgBuilder.globalScope.get(expr.name);

            if (def instanceof GlobalVariable) {
                const size = (def.initialValue as ir.StructLiteral).field("len");

                if (size instanceof ir.NumberLiteral && size.value < BigInt(toT.nbits / 8)) {
                    throw new Error("NYI casting string literals to fixed bytes");
                }
            }
        }

        // If these are two types, that live in 2 separate memories (without
        // crossing memory boundaries), but are otherwise the same modulo
        // memories, we can emit a copy
        if (
            fromT instanceof ir.PointerType &&
            toT instanceof ir.PointerType &&
            CopyFunCompiler.canCopy(fromT, toT)
        ) {
            const copyFunId = this.getCopyFun(fromT, toT);
            const lhs = this.cfgBuilder.getTmpId(toT, expr.src);
            this.cfgBuilder.call(
                [lhs],
                copyFunId,
                [fromT.region, toT.region],
                [],
                [expr],
                expr.src
            );

            return lhs;
        }
        return undefined;
    }

    private getCopyFun(fromT: ir.Type, toT: ir.Type): ir.Identifier {
        const name = CopyFunCompiler.getCopyName(fromT);
        const decl = this.cfgBuilder.globalScope.get(name);

        if (decl !== undefined) {
            assert(decl instanceof ir.FunctionDefinition, ``);
            return this.factory.identifier(noSrc, name, noType);
        }

        const compiler = new CopyFunCompiler(
            this.factory,
            this.cfgBuilder.globalScope,
            this.cfgBuilder.solVersion,
            this.abiEncodeVersion,
            fromT
        );

        const fun = compiler.compile();
        this.cfgBuilder.globalScope.define(fun);

        return this.factory.identifier(noSrc, name, noType);
    }
}
