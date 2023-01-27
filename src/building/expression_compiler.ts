import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { CFGBuilder } from "./cfg_builder";
import { assert, ASTNode, pp, smallestFittingType } from "solc-typed-ast";
import { ASTSource } from "../ir/source";
import { BaseSrc, noSrc } from "maru-ir2";
import { boolT, noType, transpileType, u160, u256, u8, u8ArrExcPtr } from "./typing";
import { single } from "../utils";
import { gte, lt, lte } from "semver";
import { IRFactory } from "./factory";

const overflowBuiltinMap = new Map<string, string>([
    ["+", "builtin_add_overflows"],
    ["-", "builtin_sub_overflows"],
    ["*", "builtin_mul_overflows"],
    ["/", "builtin_div_overflows"],
    ["**", "builtin_pow_overflows"]
]);

function isStringLiteral(lit: sol.Literal): boolean {
    return (
        lit.kind === sol.LiteralKind.String ||
        lit.kind === sol.LiteralKind.HexString ||
        lit.kind === sol.LiteralKind.UnicodeString
    );
}

function isNumberLiteral(lit: sol.Literal): boolean {
    return lit.kind === sol.LiteralKind.Number;
}

function isHexNumberLiteral(lit: sol.Literal): boolean {
    return (isNumberLiteral(lit) && lit.value.startsWith("0x")) || lit.hexValue !== "";
}

function hexLiteralValue(lit: sol.Literal): bigint[] {
    /// @todo (pavel)
    throw new Error("NYI hexLiteralValue");
}

function isFixedArray(typ: sol.TypeNode): typ is sol.PointerType {
    return (
        typ instanceof sol.PointerType &&
        typ.to instanceof sol.ArrayType &&
        typ.to.size !== undefined
    );
}

function isNonFixedArray(typ: sol.TypeNode): typ is sol.PointerType {
    return (
        typ instanceof sol.PointerType &&
        typ.to instanceof sol.ArrayType &&
        typ.to.size === undefined
    );
}

function isU8Array(type: ir.Type): type is ir.PointerType {
    return (
        type instanceof ir.PointerType &&
        type.toType instanceof ir.UserDefinedType &&
        type.toType.name === "ArrWithLen" &&
        type.toType.typeArgs.length === 1 &&
        ir.eq(type.toType.typeArgs[0], u8)
    );
}

export class ExpressionCompiler {
    private factory: IRFactory;

    constructor(public readonly cfgBuilder: CFGBuilder) {
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
                if (def.stateVariable) {
                    this.cfgBuilder.storeField(
                        this.cfgBuilder.this(noSrc),
                        lhs.name,
                        rhs,
                        assignSrc
                    );

                    return rhs;
                }

                const irVar = this.cfgBuilder.getVarId(def, new ASTSource(lhs));
                this.cfgBuilder.assign(irVar, rhs, assignSrc);
                return irVar;
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
        const rhsSolT = this.cfgBuilder.infer.typeOf(expr.vRightHandSide);

        let rhs: ir.Expression = this.compile(expr.vRightHandSide);

        // Perform any implicit casts from the rhs to the lhs (e.g. u8 to u16)
        const castedRHS = this.performImplicitCast(
            expr.vRightHandSide,
            rhs,
            rhsSolT,
            lhsT,
            this.typeOf(rhs),
            transpileType(lhsT, this.factory)
        );

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
                    return smallestFittingType(value) as sol.IntType;
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
            const type = transpileType(this.inferIntType(expr, val), this.factory) as ir.IntType;
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

        return this.factory.binaryOperation(src, lhs, op as ir.BinaryOperator, rhs, rhsT);
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
                transpileType(this.inferIntType(expr, val), this.factory)
            );
        } else {
            throw new Error(`NYI compileConstExpr(${pp(expr)}) with val ${val}`);
        }
    }

    isArithmeticChecked(node: ASTNode): boolean {
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

        throw new Error(`NYI compileBuiltinFunctionCall(${expr.vFunctionName})`);
    }

    compileFunctionCall(expr: sol.FunctionCall): ir.Expression {
        if (expr.vFunctionCallType === sol.ExternalReferenceType.Builtin) {
            return this.compileBuiltinFunctionCall(expr);
        }

        throw new Error("NYI compileFunctionCall");
    }

    compileStructConstructorCall(expr: sol.FunctionCall): ir.Expression {
        throw new Error("NYI compileStructConstructorCall");
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
        const e1Casted = this.performImplicitCast(e1, irE1, e1T, e2T, irE1T, irE2T);

        if (e1Casted) {
            return [e1Casted, irE2, irE2T];
        }

        // Try casting e2->e1
        const e2Casted = this.performImplicitCast(e2, irE2, e2T, e1T, irE2T, irE1T);

        if (e2Casted) {
            return [irE1, e2Casted, irE1T];
        }

        throw new Error(
            `Cannot compute implicit union type of ${irE1.pp()} and ${irE2.pp()} of types ${irE1T.pp()} ${irE2T.pp()}`
        );
    }

    performImplicitCast(
        expr: sol.Expression,
        irExpr: ir.Expression,
        fromSolT: sol.TypeNode,
        toSolT: sol.TypeNode,
        irFromT: ir.Type,
        irToT: ir.Type
    ): ir.Expression | undefined {
        const src = new ASTSource(expr);
        const version = this.cfgBuilder.solVersion;

        /**
         * Every type is implicitly convertible to itself
         */
        if (sol.eq(fromSolT, toSolT)) {
            assert(ir.eq(irFromT, irToT), ``);
            return irExpr;
        }

        if (ir.eq(irFromT, irToT)) {
            return irExpr;
        }

        /**
         * Implicit conversion from address payable to address is allowed
         */
        if (
            fromSolT instanceof sol.AddressType &&
            toSolT instanceof sol.AddressType &&
            fromSolT.payable
        ) {
            return irExpr;
        }

        /**
         * Up to 0.4.26 all integer constants are implicitly convertible to address
         */
        if (
            expr instanceof sol.Literal &&
            expr.kind === sol.LiteralKind.Number &&
            toSolT instanceof sol.AddressType &&
            BigInt(expr.value) >= 0n &&
            BigInt(expr.value) < 1n << 160n &&
            lte(version, "0.4.26")
        ) {
            return ir.eq(irFromT, u160) ? irExpr : this.factory.cast(src, u160, irExpr);
        }

        if (
            fromSolT instanceof sol.PointerType &&
            toSolT instanceof sol.PointerType &&
            fromSolT.to instanceof sol.UserDefinedType &&
            toSolT.to instanceof sol.UserDefinedType &&
            fromSolT.location === toSolT.location &&
            fromSolT.to.definition instanceof sol.ContractDefinition &&
            toSolT.to.definition instanceof sol.ContractDefinition &&
            fromSolT.to.definition.isSubclassOf(toSolT.to.definition)
        ) {
            if (irFromT instanceof ir.PointerType && irToT instanceof ir.PointerType) {
                return this.factory.cast(src, irToT, irExpr);
            }

            if (ir.eq(irFromT, u160) && ir.eq(irToT, u160)) {
                return irExpr;
            }

            if (irFromT instanceof ir.PointerType && ir.eq(irToT, u160)) {
                return this.cfgBuilder.loadField(irExpr, irFromT, "__address__", src);
            }

            throw new Error(`NYI implicit contract cast from ${irFromT.pp()} to ${irToT.pp()}`);
        }

        /// @todo (dimo): Wasn't this implict cast version specific?
        if (
            fromSolT instanceof sol.PointerType &&
            fromSolT.to instanceof sol.UserDefinedType &&
            fromSolT.to.definition instanceof sol.ContractDefinition &&
            toSolT instanceof sol.AddressType
        ) {
            return this.cfgBuilder.loadField(irExpr, irFromT, "__address__", src);
        }

        /**
         * Integer types with same sign can be implicitly converted fromSolT lower to higher bit-width
         */
        if (
            fromSolT instanceof sol.IntType &&
            toSolT instanceof sol.IntType &&
            fromSolT.signed === toSolT.signed &&
            fromSolT.nBits !== undefined &&
            toSolT.nBits !== undefined &&
            fromSolT.nBits <= toSolT.nBits
        ) {
            return this.factory.cast(src, irToT, irExpr);
        }

        /**
         * Integer types can implicitly change their sign
         * ONLY fromSolT unsigned -> signed, and ONLY to STRICTLY larger bit-widths
         */
        if (
            fromSolT instanceof sol.IntType &&
            toSolT instanceof sol.IntType &&
            !fromSolT.signed &&
            toSolT.signed &&
            fromSolT.nBits !== undefined &&
            toSolT.nBits !== undefined &&
            fromSolT.nBits < toSolT.nBits
        ) {
            return this.factory.cast(src, irToT, irExpr);
        }

        /**
         * String literals are implicitly convertible to byte[]
         */
        if (
            expr instanceof sol.Literal &&
            isStringLiteral(expr) &&
            toSolT instanceof sol.PointerType &&
            toSolT.to instanceof sol.BytesType
        ) {
            assert(ir.eq(irFromT, irToT), ``);
            return irExpr;
        }

        /**
         * String literals are implicitly convertible to byteN if they fit
         */
        if (
            expr instanceof sol.Literal &&
            isStringLiteral(expr) &&
            toSolT instanceof sol.FixedBytesType &&
            expr.value.length <= toSolT.size
        ) {
            // @todo (pavel)
            throw new Error("NYI converting short string to fixed-bytes numeri constants");
        }

        /**
         * String literals of length 1 are implicitly convertible to uint8 (special case alias of bytes1)
         */
        if (
            expr instanceof sol.Literal &&
            isStringLiteral(expr) &&
            toSolT instanceof sol.FixedBytesType &&
            toSolT.size === 1
        ) {
            return this.factory.numberLiteral(src, BigInt(expr.value.charCodeAt(0)), 10, u8);
        }

        /**
         * Hex numeric literals are convertible to fixed bytes of the same size
         */
        if (
            expr instanceof sol.Literal &&
            toSolT instanceof sol.FixedBytesType &&
            isHexNumberLiteral(expr)
        ) {
            const hexVal = hexLiteralValue(expr);

            if (hexVal.length === toSolT.size) {
                /// @todo (pavel)
                throw new Error(`NYI making int consts from hex literals`);
            }
        }

        /**
         * In Solidity 0.4.x int is implicitly convertible to fixed bytes (of any size)
         */
        if (
            fromSolT instanceof sol.IntType &&
            toSolT instanceof sol.FixedBytesType &&
            lt(version, "0.5.0")
        ) {
            /// @todo (pavel)
            throw new Error(`NYI making int consts from hex literals`);
        }

        /**
         * In-memory strings are convertible to bytes
         */
        if (
            expr instanceof sol.Literal &&
            isStringLiteral(expr) &&
            toSolT instanceof sol.PointerType &&
            toSolT.to instanceof sol.BytesType
        ) {
            assert(
                isU8Array(irFromT) && isU8Array(irToT),
                `Unexpected ir type for string and bytes: {0} and {1}`,
                irFromT,
                irToT
            );

            if (ir.eq(irFromT.region, irToT.region)) {
                return irExpr;
            }

            throw new Error(`NYI insert copy for implicit string->bytes casts`);
        }

        /**
         * Solidity 0.4.20+ allows to implicitly convert fixed bytes to int
         */
        if (
            fromSolT instanceof sol.FixedBytesType &&
            toSolT instanceof sol.IntType &&
            gte(version, "0.4.20")
        ) {
            /// @todo (pavel) do we need to check sizes here? Whats the behavior on overflow?
            assert(
                ir.eq(irFromT, irToT),
                `NYI casting between different sized fixed bytes and int`
            );

            return irExpr;
        }

        /**
         * Allow fixed byte types implicit casts when target size is greater than source size,
         * so source should be zero-padded right.
         */
        if (
            fromSolT instanceof sol.FixedBytesType &&
            toSolT instanceof sol.FixedBytesType &&
            fromSolT.size < toSolT.size
        ) {
            return this.factory.cast(src, irToT, irExpr);
        }

        /**
         * Fixed memory arrays are implicitly convertible to dynamic storage arrays of the same base type, since
         * 1) Storage->memory assignment results in copy
         * 2) Storage arrays are dynamic
         */
        if (
            isFixedArray(fromSolT) &&
            fromSolT.location === sol.DataLocation.Memory &&
            isNonFixedArray(toSolT) &&
            toSolT.location === sol.DataLocation.Storage &&
            sol.eq((fromSolT.to as sol.ArrayType).elementT, (toSolT.to as sol.ArrayType).elementT)
        ) {
            /// @todo (dimo)
            throw new Error(`NYI implicit cast from fixed arrays to dynamic storage arrays`);
        }

        return undefined;
    }
}
