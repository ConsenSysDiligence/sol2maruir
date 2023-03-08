import * as ir from "maru-ir2";
import { BaseSrc, GlobalVariable, noSrc } from "maru-ir2";
import { gte } from "semver";
import * as sol from "solc-typed-ast";
import { assert, ContractKind, generalizeType, pp } from "solc-typed-ast";
import { IRTuple2 } from "../ir";
import { ASTSource } from "../ir/source";
import { single } from "../utils";
import { CFGBuilder } from "./cfg_builder";
import { CopyFunCompiler } from "./copy_fun_compiler";
import { IRFactory } from "./factory";
import {
    FunctionScope,
    getDesugaredConstructorName,
    getDispatchName,
    getIRContractName,
    getIRStructDefName
} from "./resolving";
import { boolT, noType, transpileType, u160, u256, u8, u8ArrExcPtr, u8ArrMemPtr } from "./typing";

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
    assignTo(lhs: sol.Expression, rhs: ir.Expression, assignSrc: ir.BaseSrc): ir.Expression {
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

        throw new Error(`NYI Assigning to solidity expression ${pp(lhs)}`);
    }

    private solArrRead(arrPtr: ir.Expression, idx: ir.Expression, src: BaseSrc): ir.Expression {
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
     * TODO:
     *  - breaking tuple assignments into primitive assignments
     *  - converting assignments to array/structs/map into heap operations
     * DONE:
     *  - implicit casts from lhs to rhs
     *  - desugaring assignments of the shape +=, -=...
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

    getStrLit(str: string, src: ir.BaseSrc): ir.Identifier {
        const val: bigint[] = [...Buffer.from(str, "utf-8")].map((x) => BigInt(x));

        const name = this.cfgBuilder.globalUid.get(`_str_lit_`);

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

            return this.factory.numberLiteral(
                src,
                BigInt(expr.value),
                expr.value.startsWith("0x") ? 16 : 10,
                type
            );
        }

        if (expr.kind === sol.LiteralKind.String) {
            return this.getStrLit(expr.value, src);
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
            } else {
                abiSafeSolType = solType;
            }

            const abiType = generalizeType(
                this.cfgBuilder.infer.toABIEncodedType(abiSafeSolType, this.abiEncodeVersion)
            )[0];

            const abiTypeName = this.getStrLit(abiType.pp(), noSrc);

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
            const argTs: ir.Type[] = [];

            let name: string;

            if (args.length === 2) {
                name = "sol_require_msg";

                argTs.push(this.typeOf(args[1]));
            } else {
                name = "sol_require";
            }

            this.cfgBuilder.call(
                [],
                this.factory.identifier(calleeSrc, name, noType),
                [],
                argTs,
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

        if (expr.vFunctionName === "keccak256") {
            assert(
                gte(this.cfgBuilder.infer.version, "0.5.0"),
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
            isExternal = false;

            const def = expr.vReferencedDeclaration;

            assert(
                def instanceof sol.FunctionDefinition,
                `Unexpected declaration {0} for {1}`,
                def,
                expr
            );

            assert(
                funScope instanceof sol.ContractDefinition,
                `NYI call free function via identifier`
            );

            const src = new ASTSource(expr);

            thisExpr = this.mustCastTo(this.cfgBuilder.this(src), u160, src);

            irFun = getDispatchName(funScope, def, this.cfgBuilder.infer);
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

                irFun = getDispatchName(baseT.definition, def, this.cfgBuilder.infer);

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

        return this.mustCastTo(
            this.compile(expr.vArguments[0]),
            transpileType(calleeT.type, this.factory),
            new ASTSource(expr)
        );
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

                    return this.cfgBuilder.loadField(base, baseT, "len", new ASTSource(expr));
                }

                for (const [fieldName] of def.fields) {
                    if (fieldName === expr.memberName) {
                        return this.cfgBuilder.loadField(
                            base,
                            baseT,
                            fieldName,
                            new ASTSource(expr)
                        );
                    }
                }
            }
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
