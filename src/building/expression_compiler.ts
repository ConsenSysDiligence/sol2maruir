import * as ir from "maru-ir2";
import { BaseSrc, noSrc } from "maru-ir2";
import { gte } from "semver";
import * as sol from "solc-typed-ast";
import { assert, ContractDefinition, ContractKind, generalizeType, pp } from "solc-typed-ast";
import { IRTuple2, IRTupleType2 } from "../ir";
import { ASTSource } from "../ir/source";
import { single } from "../utils";
import { CFGBuilder } from "./cfg_builder";
import { CopyFunCompiler } from "./copy_fun_compiler";
import { IRFactory } from "./factory";
import {
    FunctionScope,
    getDesugaredConstructorName,
    getDesugaredFunName,
    getMethodDispatchName,
    getIRContractName,
    getIRStructDefName,
    getMsgBuilderName
} from "./resolving";
import {
    boolT,
    convertToMem,
    isAddressType,
    msgPtrT,
    msgT,
    noType,
    transpileType,
    u160,
    u256,
    u32,
    u8,
    u8ArrExcPtr,
    u8ArrMemPtr
} from "./typing";

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
        public readonly abiEncodeVersion: sol.ABIEncoderVersion,
        public readonly solScope: FunctionScope
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
                }

                return builder.getVarId(def, src);
            }
        }

        if (expr.vIdentifierType === sol.ExternalReferenceType.Builtin) {
            if (expr.name === "msg") {
                return builder.msgPtr(src);
            }

            if (expr.name === "block") {
                return builder.blockPtr(src);
            }

            if (expr.name === "this") {
                return builder.this(src);
            }
        }

        throw new Error(`NYI compileIdentifier(${pp(expr)})`);
    }

    /**
     * Return a copy of `expr` if its an array or struct pointer. Otherwise return just `expr`.
     */
    copy(expr: ir.Expression): ir.Expression {
        const exprT = this.typeOf(expr);

        if (exprT instanceof ir.PointerType) {
            const copyId = this.cfgBuilder.getTmpId(exprT, expr.src);
            const copyFunId = this.getCopyFun(exprT, exprT);
            this.cfgBuilder.call(
                [copyId],
                copyFunId,
                [exprT.region, exprT.region],
                [],
                [expr],
                expr.src
            );

            return copyId;
        }

        return expr;
    }

    /**
     * Return true if the type of `expr` is a pointer to the storage region
     */
    isStoragePtrExpr(expr: ir.Expression): boolean {
        const exprT = this.typeOf(expr);

        return (
            exprT instanceof ir.PointerType &&
            exprT.region instanceof ir.MemConstant &&
            exprT.region.name === "storage"
        );
    }

    /**
     * Assign a rhs _compiled_ expression to a solidity lhs. This handles several cases:
     *
     * 1. Assignment to a solidity local/return - normal assignment
     * 2. Assignment to a struct field or contract var - a store field operation
     * 3. Assignment to an array index - a store index operation
     *
     * Additionally this inserts an implicit copy when the solidity language semantics requires it:
     *
     * 1. Assignment between different memories (done by mustCastTo)
     * 2. Assignment to storage (that is not a local storage variable)
     */
    assignTo(lhs: sol.Expression | null, rhs: ir.Expression, assignSrc: ir.BaseSrc): ir.Expression {
        if (
            lhs instanceof sol.TupleExpression &&
            lhs.vOriginalComponents.length === 1 &&
            lhs.vOriginalComponents[0] !== null
        ) {
            return this.assignTo(lhs.vOriginalComponents[0], rhs, assignSrc);
        }

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

            if (this.isStoragePtrExpr(rhs) && this.isStoragePtrExpr(base)) {
                rhs = this.copy(rhs);
            }

            if (baseIrT instanceof ir.PointerType && baseIrT.toType instanceof ir.UserDefinedType) {
                const def = this.cfgBuilder.globalScope.getTypeDecl(baseIrT.toType);

                if (def instanceof ir.StructDefinition) {
                    this.cfgBuilder.storeField(base, lhs.memberName, rhs, assignSrc);

                    return rhs;
                }
            }
        }

        if (lhs instanceof sol.IndexAccess) {
            assert(lhs.vIndexExpression !== undefined, ``);

            const base = this.compile(lhs.vBaseExpression);
            const idx = this.compile(lhs.vIndexExpression);
            const baseIrT = this.typeOf(base);

            if (this.isStoragePtrExpr(rhs) && this.isStoragePtrExpr(base)) {
                rhs = this.copy(rhs);
            }

            if (
                baseIrT instanceof ir.PointerType &&
                baseIrT.toType instanceof ir.UserDefinedType &&
                baseIrT.toType.name === "ArrWithLen"
            ) {
                this.solArrWrite(base, idx, rhs, assignSrc);

                return rhs;
            }
        }

        if (rhs instanceof IRTuple2) {
            assert(
                (lhs instanceof sol.TupleExpression &&
                    lhs.vOriginalComponents.length === rhs.elements.length) ||
                    lhs === null,
                `Mismatch between lhs {0} and rhs {1} in tuple assignment`,
                lhs,
                rhs
            );

            const resExprs: ir.Expression[] = [];

            for (let i = 0; i < rhs.elements.length; i++) {
                const lhsC = lhs === null ? lhs : lhs.vOriginalComponents[i];
                const rhsC = rhs.elements[i];

                if (rhsC === null) {
                    assert(lhsC === null, `Unexpected null assignment to non-null lhs {0}`, lhsC);
                    continue;
                }

                resExprs.push(this.assignTo(lhsC, rhsC, assignSrc));
            }

            const resT = this.factory.tupleType(
                noSrc,
                resExprs.map((e) => this.typeOf(e))
            );

            return this.factory.tuple(assignSrc, resExprs, resT);
        }

        if (lhs === null) {
            const irLHS = this.cfgBuilder.getTmpId(this.typeOf(rhs), assignSrc);
            this.cfgBuilder.assign(irLHS, rhs, assignSrc);
            return irLHS;
        }

        throw new Error(`NYI Assigning to solidity expression ${pp(lhs)}`);
    }

    solArrRead(arrPtr: ir.Expression, idx: ir.Expression, src: BaseSrc): ir.Identifier {
        const arrPtrT = this.typeOf(arrPtr);

        assert(
            arrPtrT instanceof ir.PointerType &&
                arrPtrT.toType instanceof ir.UserDefinedType &&
                arrPtrT.toType.name === "ArrWithLen",
            ""
        );

        const elT = arrPtrT.toType.typeArgs[0];
        const res = this.cfgBuilder.getTmpId(elT, src);

        this.cfgBuilder.call(
            [res],
            this.factory.funIdentifier("sol_arr_read"),
            [arrPtrT.region],
            [elT],
            [arrPtr, this.mustCastTo(idx, u256, idx.src)],
            src
        );

        return res;
    }

    private solArrWrite(
        arrPtr: ir.Expression,
        idx: ir.Expression,
        val: ir.Expression,
        src: BaseSrc
    ): void {
        const arrPtrT = this.typeOf(arrPtr);

        assert(
            arrPtrT instanceof ir.PointerType &&
                arrPtrT.toType instanceof ir.UserDefinedType &&
                arrPtrT.toType.name === "ArrWithLen",
            ""
        );

        this.cfgBuilder.call(
            [],
            this.factory.funIdentifier("sol_arr_write"),
            [arrPtrT.region],
            [arrPtrT.toType.typeArgs[0]],
            [arrPtr, this.mustCastTo(idx, u256, idx.src), val],
            src
        );
    }

    /**
     * Compile a solidity assignment. This needs to handle:
     */
    compileAssignment(expr: sol.Assignment): ir.Expression {
        const src = new ASTSource(expr);

        const lhsT = this.cfgBuilder.infer.typeOf(expr.vLeftHandSide);
        const lhsIRT = transpileType(lhsT, this.factory);

        let rhs = this.compile(expr.vRightHandSide);

        const rhsIRT = this.factory.typeOf(rhs);

        // Perform any implicit casts from the rhs to the lhs (e.g. u8 to u16)
        const castedRHS = this.castTo(rhs, lhsIRT, src);

        assert(castedRHS !== undefined, "Cannot assign {0} to {1}", rhsIRT, lhsIRT);

        rhs = castedRHS;

        // Handle +=,-=, ...
        if (expr.operator !== "=") {
            rhs = this.makeBinaryOperation(
                this.compile(expr.vLeftHandSide),
                expr.operator.slice(0, -1) as ir.BinaryOperator,
                rhs,
                this.isArithmeticChecked(expr),
                src
            );
        }

        // Make the actual assignment
        return this.assignTo(expr.vLeftHandSide, rhs, src);
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

    getBytesLit(bytes: string, src: ir.BaseSrc): ir.Identifier {
        const val: bigint[] = [...Buffer.from(bytes, "hex")].map((x) => BigInt(x));

        const name = this.cfgBuilder.globalUid.get(`_bytes_lit_`);

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

            // Could be an address literal
            if (expr.value.startsWith("0x") && expr.value.length === 42) {
                type.md.set("sol_type", "address");
            }

            return this.factory.numberLiteral(
                src,
                BigInt(expr.value),
                expr.value.startsWith("0x") ? 16 : 10,
                type
            );
        }

        if (expr.kind === sol.LiteralKind.String) {
            return this.cfgBuilder.getStrLit(expr.value, src);
        }

        if (expr.kind === sol.LiteralKind.HexString) {
            return this.getBytesLit(expr.hexValue, src);
        }

        // Missing sol.LiteralKind.UnicodeString

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

        if (
            sol.BINARY_OPERATOR_GROUPS.Comparison.includes(op) ||
            sol.BINARY_OPERATOR_GROUPS.Equality.includes(op)
        ) {
            return this.factory.binaryOperation(src, lhs, op as ir.BinaryOperator, rhs, boolT);
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
        }

        if (typeof val === "bigint") {
            return this.factory.numberLiteral(
                src,
                val,
                10,
                transpileType(sol.smallestFittingType(val) as sol.IntType, this.factory)
            );
        }

        throw new Error(`NYI compileConstExpr(${pp(expr)}) with val ${val}`);
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
            return this.factory.unaryOperation(src, expr.operator, subExp, boolT);
        }

        const subT = this.typeOf(subExp);

        if (expr.operator === "delete") {
            return this.assignTo(expr.vSubExpression, this.cfgBuilder.zeroValue(subT, src), src);
        }

        if (expr.operator === "~") {
            return this.factory.unaryOperation(src, expr.operator, subExp, subT);
        }

        if (expr.operator === "-") {
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

    compileInlineArray(expr: sol.TupleExpression): ir.Expression {
        const src = new ASTSource(expr);
        const arrT = transpileType(this.cfgBuilder.infer.typeOf(expr), this.factory);
        const els = expr.vComponents.map((compE) => this.compile(compE));

        assert(
            arrT instanceof ir.PointerType &&
                arrT.toType instanceof ir.UserDefinedType &&
                arrT.toType.name === "ArrWithLen",
            `Unexpected type {0} of array literal`,
            arrT
        );

        const res = this.cfgBuilder.getTmpId(arrT, src);
        const elT = arrT.toType.typeArgs[0];
        this.cfgBuilder.call(
            [res],
            this.factory.funIdentifier("new_array"),
            [this.factory.memConstant(noSrc, "memory")],
            [elT],
            [this.factory.numberLiteral(noSrc, BigInt(els.length), 10, u256)],
            src
        );

        for (let i = 0; i < els.length; i++) {
            const castedEl = this.mustCastTo(els[i], elT, els[i].src);
            this.solArrWrite(
                res,
                this.factory.numberLiteral(noSrc, BigInt(i), 10, u256),
                castedEl,
                els[i].src
            );
        }

        return res;
    }

    compileTupleExpression(expr: sol.TupleExpression): ir.Expression {
        if (expr.isInlineArray) {
            return this.compileInlineArray(expr);
        }

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

    /**
     * Given a solidity type name or type tuple (second argument to decode)
     * return a list of ir-types corresponding to each solidity type, and a list
     * of string constants that give a Web3-compatible name to decode.
     */
    private prepDecodeArgs(solTypesExpr: sol.Expression): [ir.Expression[], ir.Type[]] {
        const solTypes = this.cfgBuilder.infer.typeOf(solTypesExpr);

        let solArgTs: sol.TypeNode[];

        if (solTypes instanceof sol.TypeNameType) {
            solArgTs = [solTypes.type];
        } else if (solTypes instanceof sol.TupleType) {
            solArgTs = solTypes.elements as sol.TypeNode[];
        } else {
            throw new Error(`NYI decode arg ${sol.pp(solTypesExpr)} of type ${solTypes.pp()}`);
        }

        solArgTs = solArgTs.map((argT) => sol.specializeType(argT, sol.DataLocation.Memory));

        const args: ir.Expression[] = [];
        const argTs: ir.Type[] = [];

        for (const solType of solArgTs) {
            const irArgT = transpileType(solType, this.factory);

            let abiSafeSolType: sol.TypeNode;

            if (solType instanceof sol.IntLiteralType) {
                const fitT = solType.smallestFittingType();

                assert(
                    fitT !== undefined,
                    "Unable to detect smalles fitting type for {0}",
                    solType
                );

                abiSafeSolType = fitT;
            } else if (solType instanceof sol.StringLiteralType) {
                abiSafeSolType = new sol.StringType();
            } else {
                abiSafeSolType = solType;
            }

            const abiType = generalizeType(
                this.cfgBuilder.infer.toABIEncodedType(abiSafeSolType, this.abiEncodeVersion)
            )[0];

            const abiTypeName = this.cfgBuilder.getStrLit(abiType.pp(), noSrc);

            args.push(abiTypeName);
            argTs.push(irArgT);
        }

        return [args, argTs];
    }

    /**
     * @todo Please, be careful with encoder here. Things may get bad quickly.
     *
     * @see https://github.com/ConsenSys/solc-typed-ast/blob/f3236d354c811f3bfcf4dd6370b02255911db3ee/src/types/infer.ts#L2290-L2346
     * @see https://github.com/ConsenSys/solc-typed-ast/blob/f3236d354c811f3bfcf4dd6370b02255911db3ee/src/types/infer.ts#L196-L215
     * @see https://github.com/ConsenSys/solc-typed-ast/blob/f3236d354c811f3bfcf4dd6370b02255911db3ee/src/types/abi.ts#L31-L65
     * @see https://github.com/ConsenSys/solc-typed-ast/blob/f3236d354c811f3bfcf4dd6370b02255911db3ee/src/types/abi.ts#L72-L122
     */
    private prepEncodeArgs(solArgs: sol.Expression[]): [ir.Expression[], ir.Type[]] {
        const args: ir.Expression[] = [];
        const argTs: ir.Type[] = [];

        for (const solArg of solArgs) {
            const solType = this.cfgBuilder.infer.typeOf(solArg);

            const irArg = this.compile(solArg);
            const irArgT = this.typeOf(irArg);

            let abiSafeSolType: sol.TypeNode;

            if (solType instanceof sol.IntLiteralType) {
                const fitT = solType.smallestFittingType();

                assert(
                    fitT !== undefined,
                    "Unable to detect smalles fitting type for {0}",
                    solType
                );

                abiSafeSolType = fitT;
            } else if (solType instanceof sol.StringLiteralType) {
                abiSafeSolType = new sol.StringType();
            } else {
                abiSafeSolType = solType;
            }

            const abiType = generalizeType(
                this.cfgBuilder.infer.toABIEncodedType(abiSafeSolType, this.abiEncodeVersion)
            )[0];

            const abiTypeName = this.cfgBuilder.getStrLit(abiType.pp(), noSrc);

            args.push(abiTypeName, irArg);
            argTs.push(irArgT);
        }

        return [args, argTs];
    }

    compileBuiltinFunctionCall(expr: sol.FunctionCall): ir.Expression {
        const exprSrc = new ASTSource(expr);
        const calleeSrc = new ASTSource(expr.vCallee);

        if (expr.vFunctionName === "assert") {
            this.cfgBuilder.call(
                [],
                this.factory.identifier(calleeSrc, "sol_assert", noType),
                [],
                [],
                [this.compile(single(expr.vArguments))],
                exprSrc
            );

            return this.factory.tuple(noSrc, [], noType);
        }

        if (expr.vFunctionName === "revert") {
            this.cfgBuilder.call(
                [],
                this.factory.identifier(calleeSrc, "sol_revert", noType),
                [],
                [],
                [],
                exprSrc
            );

            return this.factory.tuple(noSrc, [], noType);
        }

        if (expr.vFunctionName === "require") {
            const args = expr.vArguments.map((arg) => this.compile(arg));
            const memArgs: ir.MemDesc[] = [];

            let name: string;

            if (args.length === 2) {
                name = "sol_require_msg";

                const strT = this.typeOf(args[1]);
                assert(
                    strT instanceof ir.PointerType,
                    `Second arg of require must be a string pointer`
                );

                memArgs.push(strT.region);
            } else {
                name = "sol_require";
            }

            this.cfgBuilder.call(
                [],
                this.factory.identifier(calleeSrc, name, noType),
                memArgs,
                [],
                args,
                exprSrc
            );

            return this.factory.tuple(noSrc, [], noType);
        }

        if (expr.vFunctionName === "encode") {
            const [args, argTs] = this.prepEncodeArgs(expr.vArguments);
            const builtinName = `builtin_abi_encode_${expr.vArguments.length}`;
            const res = this.cfgBuilder.getTmpId(u8ArrMemPtr);

            this.cfgBuilder.call(
                [res],
                this.factory.identifier(calleeSrc, builtinName, noType),
                [],
                argTs,
                args,
                exprSrc
            );

            return res;
        }

        if (expr.vFunctionName === "decode") {
            sol.assert(expr.vArguments.length === 2, `Decode expects 2 arguments`);

            const solData = expr.vArguments[0];
            const solTypes = expr.vArguments[1];

            assert(
                solTypes instanceof sol.TupleExpression || solTypes instanceof sol.TypeName,
                `Second argument to decode must be type or tuple not {0}`,
                solTypes
            );

            const irData = this.compile(solData);
            const irDataT = this.typeOf(irData);

            assert(
                irDataT instanceof ir.PointerType,
                `First argument to decode must be a bytes pointer not {0}`,
                irDataT
            );

            const [args, argTs] = this.prepDecodeArgs(solTypes);
            const builtinName = `builtin_abi_decode_${argTs.length}`;
            const retT = argTs.length === 1 ? argTs[0] : this.factory.tupleType(noSrc, argTs);
            const res = this.cfgBuilder.getTmpId(retT);

            this.cfgBuilder.call(
                [res],
                this.factory.identifier(calleeSrc, builtinName, noType),
                [irDataT.region],
                argTs,
                [irData, ...args],
                exprSrc
            );

            return res;
        }

        if (expr.vFunctionName === "send" || expr.vFunctionName === "transfer") {
            const calledOn = expr.vExpression;
            const solAmount = single(expr.vArguments);
            const amount = this.mustCastTo(this.compile(solAmount), u256, new ASTSource(solAmount));

            assert(
                calledOn instanceof sol.MemberAccess,
                `Exepcted member access as callee on {0} not {1}`,
                expr.vFunctionName,
                calledOn
            );

            const sendAddr = this.mustCastTo(this.cfgBuilder.this(noSrc), u160, noSrc);
            const recvAddr = this.compile(calledOn.vExpression);
            const rets =
                expr.vFunctionName === "send" ? [this.cfgBuilder.getTmpId(boolT, exprSrc)] : [];

            this.cfgBuilder.call(
                rets,
                this.factory.identifier(calleeSrc, `builtin_${expr.vFunctionName}`, noType),
                [],
                [],
                [sendAddr, recvAddr, amount],
                exprSrc
            );

            return rets.length === 1 ? rets[0] : new IRTuple2(noSrc, []);
        }

        if (
            expr.vFunctionName === "call" ||
            expr.vFunctionName === "staticcall" ||
            expr.vFunctionName === "delegatecall" ||
            expr.vFunctionName === "callcode"
        ) {
            /**
             * @todo This function family uses variadic arguments in Solidity 0.4.
             * Args are processed with ABI ecnoding routines.
             *
             * @see https://docs.soliditylang.org/en/latest/050-breaking-changes.html#semantic-and-syntactic-changes
             */
            const calledOn = expr.vExpression;
            const callBytes = single(expr.vArguments.map((arg) => this.compile(arg)));
            const callBytesT = this.typeOf(callBytes);

            assert(
                calledOn instanceof sol.MemberAccess,
                `Exepcted member access as callee for {0} not {1}`,
                expr.vFunctionName,
                calledOn
            );

            assert(
                callBytesT instanceof ir.PointerType,
                `Expected {0} to be of a pointer type not {1} in call ({2})`,
                callBytes,
                callBytesT,
                expr.vFunctionName
            );

            const addr = this.compile(calledOn.vExpression);
            const rets = [this.cfgBuilder.getTmpId(boolT, exprSrc)];

            let builtinName: string;

            if (gte(this.cfgBuilder.solVersion, "0.5.0") && expr.vFunctionName !== "callcode") {
                rets.push(this.cfgBuilder.getTmpId(u8ArrMemPtr));

                builtinName = `builtin_${expr.vFunctionName}05`;
            } else {
                builtinName = `builtin_${expr.vFunctionName}04`;
            }

            this.cfgBuilder.call(
                rets,
                this.factory.identifier(calleeSrc, builtinName, noType),
                [callBytesT.region],
                [],
                [addr, callBytes],
                exprSrc
            );

            return rets.length === 1 ? rets[0] : new IRTuple2(noSrc, rets);
        }

        if (expr.vFunctionName === "encodePacked") {
            const [args, argTs] = this.prepEncodeArgs(expr.vArguments);
            const builtinName = `builtin_abi_encodePacked_${expr.vArguments.length}`;
            const res = this.cfgBuilder.getTmpId(u8ArrMemPtr);

            this.cfgBuilder.call(
                [res],
                this.factory.identifier(calleeSrc, builtinName, noType),
                [],
                argTs,
                args,
                exprSrc
            );

            return res;
        }

        if (expr.vFunctionName === "keccak256") {
            assert(
                gte(this.cfgBuilder.solVersion, "0.5.0"),
                "NYI function call to keccak256() for Solidity 0.4 in {0}",
                expr
            );

            const args = expr.vArguments.map((arg) => this.compile(arg));

            const builtinName = `builtin_keccak256_05`;
            const res = this.cfgBuilder.getTmpId(u256);

            this.cfgBuilder.call(
                [res],
                this.factory.identifier(calleeSrc, builtinName, noType),
                [],
                [],
                args,
                exprSrc
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
            const elT = newIrT.toType.typeArgs[0];
            this.cfgBuilder.call(
                [resId],
                this.factory.identifier(noSrc, "new_array", noType),
                [this.factory.memConstant(noSrc, "memory")],
                [elT],
                [size],
                src
            );

            if (irSize instanceof ir.NumberLiteral) {
                // Fixed size allocation
                for (let i = 0n; i < irSize.value; i++) {
                    this.solArrWrite(
                        resId,
                        this.factory.numberLiteral(src, i, 10, u256),
                        this.cfgBuilder.zeroValue(elT, src),
                        src
                    );
                }
            } else {
                // Dynamic size allocation
                const start = this.factory.numberLiteral(src, 0n, 10, u256);
                const [ctr, header, , exit] = this.cfgBuilder.startForLoop(start, irSize, src);
                this.solArrWrite(resId, ctr, this.cfgBuilder.zeroValue(elT, src), src);
                this.cfgBuilder.finishForLoop(ctr, start, header, exit, src);
            }
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
     * 2. The solidity function/public getter declaration that corresponds to the call
     * 3. Any gas modifiers
     * 4. Any value modifiers
     * 5. Any salt modifiers
     * 6. Whether this is an external call
     * 7. The name of the compiled function
     * 8. The Solidity formal argument types
     * 9. The Solidity return types
     * @param expr
     */
    private decodeCall(
        expr: sol.FunctionCall
    ): [
        ir.Expression,
        sol.FunctionDefinition | sol.VariableDeclaration,
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
        let calleeDecl: sol.FunctionDefinition | sol.VariableDeclaration;

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

        // There are several cases:
        if (callee instanceof sol.Identifier) {
            // 1. Internal call to the same contract or a free function call
            thisExpr = this.cfgBuilder.this(noSrc);
            isExternal = false;
            let solDef: sol.FunctionDefinition | sol.VariableDeclaration | undefined;

            assert(
                callee.vReferencedDeclaration instanceof sol.FunctionDefinition,
                `Unsupported calle with non-functiondef decl {0}`,
                callee.vReferencedDeclaration
            );

            if (this.solScope instanceof sol.ContractDefinition) {
                // Contract function
                solDef = sol.resolveCallable(
                    this.solScope,
                    callee.vReferencedDeclaration,
                    this.cfgBuilder.infer
                );
            } else {
                // Free function
                solDef = callee.vReferencedDeclaration;
            }

            assert(
                solDef instanceof sol.FunctionDefinition,
                `Unexpected most resolved definition {0}`,
                solDef
            );

            calleeDecl = solDef;
            irFun = getDesugaredFunName(solDef, this.solScope, this.cfgBuilder.infer);
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

                if (def instanceof sol.FunctionDefinition) {
                    irFun = getMethodDispatchName(baseT.definition, def, this.cfgBuilder.infer);

                    const baseIRExpr = this.compile(base);

                    thisExpr = this.mustCastTo(baseIRExpr, u160, new ASTSource(base));
                } else if (def instanceof sol.VariableDeclaration) {
                    sol.assert(
                        def.stateVariable && def.vScope instanceof ContractDefinition,
                        `Expected a state var in decodeCall`
                    );

                    irFun = getMethodDispatchName(def.vScope, def, this.cfgBuilder.infer);
                    const baseIRExpr = this.compile(base);

                    thisExpr = this.mustCastTo(baseIRExpr, u160, new ASTSource(base));
                } else {
                    assert(false, `Unexpected declaration ${sol.pp(def)} for ${sol.pp(expr)}`);
                }

                calleeDecl = def;
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
            calleeDecl,
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
        const [irCallee, solCallee, , , , isExternal, irFun, argTs, retTs] = this.decodeCall(expr);

        const irRetTs = retTs.map((retT) => transpileType(retT, this.factory));
        const lhss = irRetTs.map((retT) => this.cfgBuilder.getTmpId(retT, src));
        const callee = this.factory.identifier(src, irFun, noType);

        const args: ir.Expression[] = [];

        for (let i = 0; i < expr.vArguments.length; i++) {
            const irArg = this.compile(expr.vArguments[i]);
            const formalIRT = transpileType(argTs[i], this.factory);
            console.error(
                `Fun ${expr.vFunctionName} ${i}-th arg sol type ${argTs[
                    i
                ].pp()} transpiled to ${formalIRT.pp()}`
            );
            args.push(this.mustCastTo(irArg, formalIRT, irArg.src));
        }

        let msgPtrArg: ir.Identifier;

        if (isExternal) {
            // TODO @dimo Consider moving block and msg pointers to calldata or another region?
            msgPtrArg = this.cfgBuilder.getTmpId(msgPtrT, noSrc);
            this.cfgBuilder.allocStruct(
                msgPtrArg,
                msgT,
                this.factory.memConstant(noSrc, "memory"),
                noSrc
            );

            const msgData = this.cfgBuilder.getTmpId(u8ArrMemPtr, noSrc);
            this.cfgBuilder.call(
                [msgData],
                this.factory.funIdentifier(
                    getMsgBuilderName(
                        solCallee.vScope as sol.ContractDefinition,
                        solCallee,
                        this.cfgBuilder.infer
                    )
                ),
                [],
                [],
                [...args],
                noSrc
            );

            const thisAddr = this.mustCastTo(this.cfgBuilder.this(noSrc), u160, noSrc);
            const sigHash = this.factory.numberLiteral(
                noSrc,
                BigInt("0x" + this.cfgBuilder.infer.signatureHash(solCallee)),
                16,
                u32
            );

            this.cfgBuilder.storeField(msgPtrArg, "sender", thisAddr, noSrc);
            this.cfgBuilder.storeField(msgPtrArg, "sig", sigHash, noSrc);
            this.cfgBuilder.storeField(msgPtrArg, "data", msgData, noSrc);
            // TODO implement value
            this.cfgBuilder.storeField(
                msgPtrArg,
                "value",
                this.factory.numberLiteral(noSrc, 0n, 10, u256),
                noSrc
            );
        } else {
            msgPtrArg = this.cfgBuilder.msgPtr(noSrc);
        }

        args.splice(0, 0, irCallee, this.cfgBuilder.blockPtr(noSrc), msgPtrArg);

        this.cfgBuilder.call(lhss, callee, [], [], args, src);

        if (lhss.length === 0) {
            return noType;
        }

        if (lhss.length === 1) {
            return lhss[0];
        }

        return this.factory.tuple(src, lhss, this.factory.tupleType(noSrc, irRetTs));
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

        const structT = this.factory.userDefinedType(
            noSrc,
            irStruct.name,
            [this.factory.memConstant(noSrc, "memory")],
            []
        );
        const structPtrT = this.factory.pointerType(
            noSrc,
            structT,
            this.factory.memConstant(noSrc, "memory")
        );

        const res = this.cfgBuilder.getTmpId(structPtrT);
        this.cfgBuilder.allocStruct(res, structT, this.factory.memConstant(noSrc, "memory"), noSrc);

        const concreteFields = this.cfgBuilder.getConcreteFields(structT);
        assert(
            concreteFields.length === expr.vArguments.length,
            `Struct {0} expectes {1} fields, but given {2} initializers`,
            irStruct.name,
            concreteFields.length,
            expr.vArguments.length
        );

        for (let i = 0; i < concreteFields.length; i++) {
            const [fieldName, fieldT] = concreteFields[i];
            const initVal = this.compile(expr.vArguments[i]);
            const castedInitVal = this.mustCastTo(initVal, fieldT, initVal.src);

            this.cfgBuilder.storeField(res, fieldName, castedInitVal, new ASTSource(expr));
        }

        return res;
    }

    compileTypeConversion(expr: sol.FunctionCall): ir.Expression {
        const calleeT = this.cfgBuilder.infer.typeOf(expr.vExpression);

        assert(
            calleeT instanceof sol.TypeNameType,
            `Expected a type as callee not {0} of type {1}`,
            expr.vExpression,
            calleeT
        );

        assert(expr.vArguments.length === 1, ``);

        let toT = transpileType(calleeT.type, this.factory);

        // Cast to string/bytes. Wrap in a pointer type around it
        if (toT instanceof ir.UserDefinedType) {
            assert(toT.name === "ArrWithLen", `Unexpected cast to user defined type {0}`, toT);
            toT = this.factory.pointerType(
                new ASTSource(expr.vExpression),
                toT,
                this.factory.memConstant(ir.noSrc, "memory")
            );
        }

        return this.mustCastTo(this.compile(expr.vArguments[0]), toT, new ASTSource(expr));
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
        const src = new ASTSource(expr);

        if (
            baseT instanceof ir.PointerType &&
            baseT.toType instanceof ir.UserDefinedType &&
            baseT.toType.name === "ArrWithLen"
        ) {
            return this.solArrRead(base, idx, src);
        }

        throw new Error(
            `NYI compiling index expression ${expr.print()} with base type ${baseT.pp()}`
        );
    }

    compileMemberAccess(expr: sol.MemberAccess): ir.Expression {
        const base = this.compile(expr.vExpression);
        const baseT = this.typeOf(base);
        const src = new ASTSource(expr);
        const factory = this.cfgBuilder.factory;

        if (baseT instanceof ir.PointerType && baseT.toType instanceof ir.UserDefinedType) {
            const def = this.cfgBuilder.globalScope.getTypeDecl(baseT.toType);

            if (def instanceof ir.StructDefinition) {
                if (expr.memberName === "length" && expr.vReferencedDeclaration === undefined) {
                    assert(
                        def.name === "ArrWithLen",
                        "Expected ArrWithLen struct to get length, got {0} when processing {1}",
                        def.name,
                        expr
                    );

                    return this.cfgBuilder.loadField(base, baseT, "len", src);
                }

                for (const [fieldName] of def.fields) {
                    if (fieldName === expr.memberName) {
                        return this.cfgBuilder.loadField(base, baseT, fieldName, src);
                    }
                }
            }
        }

        if (isAddressType(baseT) && expr.memberName === "balance") {
            const res = this.cfgBuilder.getTmpId(u256, src);
            this.cfgBuilder.call(
                [res],
                factory.funIdentifier("builtin_balance"),
                [],
                [],
                [base],
                src
            );

            return res;
        }

        throw new Error(
            `NYI compiling member expression ${expr.print()} with base ${base.pp()} of type ${baseT.pp()} and member ${
                expr.memberName
            }`
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
        }

        if (expr instanceof sol.Assignment) {
            return this.compileAssignment(expr);
        }

        if (expr instanceof sol.BinaryOperation) {
            return this.compileBinaryOperation(expr);
        }

        if (expr instanceof sol.UnaryOperation) {
            return this.compileUnaryOperation(expr);
        }

        if (expr instanceof sol.Literal) {
            return this.compileLiteral(expr);
        }

        if (expr instanceof sol.TupleExpression) {
            return this.compileTupleExpression(expr);
        }

        if (expr instanceof sol.FunctionCall) {
            if (expr.kind === sol.FunctionCallKind.FunctionCall) {
                return this.compileFunctionCall(expr);
            }

            if (expr.kind === sol.FunctionCallKind.StructConstructorCall) {
                return this.compileStructConstructorCall(expr);
            }

            if (expr.kind === sol.FunctionCallKind.TypeConversion) {
                return this.compileTypeConversion(expr);
            }

            throw new Error(`Unknown function call kind ${expr.kind}`);
        }

        if (expr instanceof sol.Conditional) {
            return this.compileConditional(expr);
        }

        if (expr instanceof sol.IndexAccess) {
            return this.compileIndexAccess(expr);
        }

        if (expr instanceof sol.MemberAccess) {
            return this.compileMemberAccess(expr);
        }

        throw new Error(`NYI compiling ${pp(expr)}`);
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

    copyToMem(expr: ir.Expression, fromT: ir.Type, toMem: ir.MemConstant): ir.Expression {
        const toT = convertToMem(fromT, toMem.name, this.cfgBuilder.factory);

        if (!(fromT instanceof ir.PointerType)) {
            return expr;
        }

        assert(toT instanceof ir.PointerType, ``);

        const copyFunId = this.getCopyFun(fromT, toT);
        const lhs = this.cfgBuilder.getTmpId(toT, expr.src);
        this.cfgBuilder.call([lhs], copyFunId, [fromT.region, toT.region], [], [expr], expr.src);

        return lhs;
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

            if (def instanceof ir.GlobalVariable) {
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

        // Cast from singleton string literal to byte
        if (
            fromT instanceof ir.PointerType &&
            fromT.toType instanceof ir.UserDefinedType &&
            fromT.toType.name === `ArrWithLen` &&
            toT instanceof ir.IntType &&
            expr instanceof ir.Identifier &&
            expr.name.match(/_str_lit_[0-9]*/)
        ) {
            const def = this.cfgBuilder.funScope.get(expr.name);

            if (def instanceof ir.GlobalVariable && def.initialValue instanceof ir.StructLiteral) {
                const arr = def.initialValue.field("arr");
                if (arr instanceof ir.ArrayLiteral && arr.values.length === 1) {
                    return arr.values[0];
                }
            }
        }

        // In 0.4.x you can cast values greater than 20 bytes to address, and they get the lower bits
        if (fromT instanceof ir.IntType && isAddressType(toT)) {
            return this.factory.cast(
                src,
                toT,
                this.factory.binaryOperation(
                    src,
                    expr,
                    "&",
                    this.factory.numberLiteral(
                        src,
                        BigInt("0xffffffffffffffffffffffffffffffffffffffff"),
                        16,
                        fromT
                    ),
                    fromT
                )
            );
        }

        if (
            fromT instanceof IRTupleType2 &&
            toT instanceof IRTupleType2 &&
            expr instanceof IRTuple2 &&
            expr.elements.length === fromT.elementTypes.length &&
            fromT.elementTypes.length === toT.elementTypes.length
        ) {
            const castedEls: Array<ir.Expression | null> = [];

            for (let i = 0; i < fromT.elementTypes.length; i++) {
                const toElT = toT.elementTypes[i];
                const elExpr = expr.elements[i];

                const castedElExpr =
                    toElT === null || elExpr === null ? elExpr : this.castTo(elExpr, toElT, src);

                if (castedElExpr === undefined) {
                    return undefined;
                }

                castedEls.push(castedElExpr);
            }

            return new IRTuple2(src, castedEls);
        }

        return undefined;
    }

    private getCopyFun(fromT: ir.Type, toT: ir.Type): ir.Identifier {
        const name = CopyFunCompiler.getCopyName(fromT, toT);
        const decl = this.cfgBuilder.globalScope.get(name);

        if (decl !== undefined) {
            assert(decl instanceof ir.FunctionDefinition, ``);

            return this.factory.identifier(noSrc, name, noType);
        }

        const compiler = new CopyFunCompiler(
            this.factory,
            this.cfgBuilder.globalScope,
            this.cfgBuilder.globalUid,
            this.cfgBuilder.solVersion,
            this.abiEncodeVersion,
            fromT,
            toT
        );

        const fun = compiler.compile();

        this.cfgBuilder.globalScope.define(fun);

        return this.factory.identifier(noSrc, name, noType);
    }
}
