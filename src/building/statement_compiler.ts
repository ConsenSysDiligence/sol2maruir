import * as ir from "maru-ir2";
import { BasicBlock, boolT, noSrc } from "maru-ir2";
import * as sol from "solc-typed-ast";
import {
    abiTypeToCanonicalName,
    assert,
    ErrorDefinition,
    generalizeType,
    pp,
    TryCatchClause,
    TryStatement
} from "solc-typed-ast";
import { IRTuple2, IRTupleType2 } from "../ir";
import { ASTSource } from "../ir/source";
import { single } from "../utils";
import { CFGBuilder } from "./cfg_builder";
import { ExpressionCompiler } from "./expression_compiler";
import { noType, transpileType, u256, u32, u8ArrExcPtr, u8ArrMemPtr } from "./typing";

export type ModifierStack2 = Array<
    [sol.Block | sol.UncheckedBlock | undefined, sol.ModifierInvocation | undefined]
>;

export function flattenTuple(e: ir.Expression): ir.Expression[] {
    if (!(e instanceof IRTuple2)) {
        return [e];
    }

    const res: ir.Expression[] = [];

    for (const el of e.elements) {
        if (el !== null) {
            res.push(...flattenTuple(el));
        }
    }

    return res;
}

export class StatementCompiler {
    private loopStack: Array<[ir.BasicBlock, ir.BasicBlock]> = [];

    constructor(
        private readonly cfgBuilder: CFGBuilder,
        private readonly exprCompiler: ExpressionCompiler,
        private readonly modifierStack: ModifierStack2
    ) {
        this.cfgBuilder;
        this.exprCompiler;
        this.modifierStack;
    }

    compileBlock(block: sol.Block | sol.UncheckedBlock): void {
        for (const stmt of block.vStatements) {
            this.compile(stmt);
        }
    }

    compilePlaceholderStatement(stmt: sol.PlaceholderStatement): void {
        this.cfgBuilder.placeHolderStack.push(stmt);

        const modEntry = this.modifierStack.shift();
        assert(modEntry !== undefined, `Pop from empty modifier stack`);

        const [body, invocation] = modEntry;

        assert(
            body !== undefined,
            `Undefined body in modifier stack. Shouldn't be trying to compile function`
        );

        if (invocation !== undefined) {
            assert(body.parent instanceof sol.ModifierDefinition, `Body must be modifier body`);
            const mod = body.parent;

            const formals = mod.vParameters.vParameters;
            const actuals = invocation.vArguments;

            for (const decl of formals) {
                this.cfgBuilder.addModifierArg(decl);
            }

            for (let i = 0; i < formals.length; i++) {
                const formal = formals[i];
                const actual = actuals[i];

                assert(formal.vType !== undefined, "Expected type for modifier parameter", formal);

                const rhs = this.exprCompiler.compile(actual);
                const lhs = this.cfgBuilder.getVarId(formal, new ASTSource(formal));

                this.cfgBuilder.assign(lhs, rhs, new ASTSource(actual));
            }
        }

        this.compile(body);

        this.modifierStack.unshift(modEntry);
        this.cfgBuilder.placeHolderStack.pop();
    }

    compileExpressionStatement(stmt: sol.ExpressionStatement): void {
        this.exprCompiler.compile(stmt.vExpression);
    }

    compileReturn(stmt: sol.Return): void {
        const src = new ASTSource(stmt);
        const factory = this.cfgBuilder.factory;

        if (stmt.vExpression) {
            const retEs = this.exprCompiler.compile(stmt.vExpression);

            const rets: ir.Expression[] =
                retEs instanceof IRTuple2 ? (retEs.elements as ir.Expression[]) : [retEs];

            const formals = this.cfgBuilder.returns;

            assert(
                rets.length === formals.length,
                `Mismatch in number of return values - got {0} expected {1}`,
                rets.length,
                formals.length
            );

            for (let i = 0; i < rets.length; i++) {
                this.cfgBuilder.assign(
                    factory.identifier(noSrc, formals[i].name, formals[i].type),
                    this.exprCompiler.mustCastTo(rets[i], formals[i].type, rets[i].src),
                    src
                );
            }
        }

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, src);
    }

    compileIfStatement(stmt: sol.IfStatement): void {
        const cond = this.exprCompiler.compile(stmt.vCondition);
        const trueBB = this.cfgBuilder.mkBB();
        const unionBB = this.cfgBuilder.mkBB();
        const falseBB = stmt.vFalseBody ? this.cfgBuilder.mkBB() : unionBB;

        this.cfgBuilder.branch(cond, trueBB, falseBB, new ASTSource(stmt));

        this.cfgBuilder.curBB = trueBB;

        this.compile(stmt.vTrueBody);

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(unionBB, noSrc);
        }

        if (stmt.vFalseBody) {
            this.cfgBuilder.curBB = falseBB;

            this.compile(stmt.vFalseBody);

            if (this.cfgBuilder.isCurBBSet) {
                this.cfgBuilder.jump(unionBB, noSrc);
            }
        }

        this.cfgBuilder.curBB = unionBB;
    }

    compileBreak(stmt: sol.Break): void {
        const [exit] = this.loopStack[this.loopStack.length - 1];

        this.cfgBuilder.jump(exit, new ASTSource(stmt));
    }

    compileContinue(stmt: sol.Continue): void {
        const [, header] = this.loopStack[this.loopStack.length - 1];

        this.cfgBuilder.jump(header, new ASTSource(stmt));
    }

    /**
     * While statements result in the following fragment:
     * ```
     *                    cur BB
     *                       |
     *                  header BB  ---------------|
     *                    /    \                  |
     *       !vCondition /      \ s.vCondition    |
     *                   |      body entry BB     |
     *                   |             |          |
     *                   |            ...         |
     *                   |             |          |
     *                   |      body exit  BB     |
     *                   |             |__________|
     *                    \
     *                   exit BB
     * ```
     */
    compileWhileStatement(stmt: sol.WhileStatement): void {
        const src = new ASTSource(stmt);
        const header = this.cfgBuilder.mkBB();
        const body = this.cfgBuilder.mkBB();
        const exit = this.cfgBuilder.mkBB();

        // Compile header
        this.cfgBuilder.jump(header, noSrc);
        this.cfgBuilder.curBB = header;
        const cond = this.exprCompiler.compile(stmt.vCondition);
        this.cfgBuilder.branch(cond, body, exit, src);

        // Compile body
        this.cfgBuilder.curBB = body;
        this.loopStack.push([exit, header]);
        this.compile(stmt.vBody);
        this.loopStack.pop();

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(header, src);
        }

        this.cfgBuilder.curBB = exit;
    }

    /**
     * DoWhile statements result in the following fragment:
     * ```
     *                      cur
     *                       |
     *                body Entry -----------------|
     *                       |                    |
     *                      ...                   |
     *                       |                    |
     *                body Exit BB                |
     *                       |                    |
     *                   footer BB                |
     *       !vCondition |      | s.vCondition    |
     *                   |      |_________________|
     *                 exit BB
     * ```
     */
    compileDoWhileStatement(stmt: sol.DoWhileStatement): void {
        const src = new ASTSource(stmt);
        const footer = this.cfgBuilder.mkBB();
        const body = this.cfgBuilder.mkBB();
        const exit = this.cfgBuilder.mkBB();

        this.cfgBuilder.jump(body, src);

        this.cfgBuilder.curBB = body;
        this.loopStack.push([exit, footer]);
        this.compile(stmt.vBody);
        this.loopStack.pop();

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(footer, src);
        }

        this.cfgBuilder.curBB = footer;

        const cond = this.exprCompiler.compile(stmt.vCondition);
        this.cfgBuilder.branch(cond, body, exit, src);

        this.cfgBuilder.curBB = exit;
    }

    /**
     * For statements result in the following fragment:
     * ```
     *                      cur   (initialization expression goes here)
     *                       |
     *                   header bb    ----------------------------
     *  !s.vCondition   /         \ s.vCondition                  |
     *                 /       body entry BB                      |
     *             exit BB           |                            |
     *                              ...                           |
     *                               |                            |
     *                         body exit  BB                      |
     *                               |                            |
     *                          loop expr BB                      |
     *                               |____________________________|
     * ```
     */
    compileForStatement(stmt: sol.ForStatement): void {
        const src = new ASTSource(stmt);
        const header = this.cfgBuilder.mkBB();
        const body = this.cfgBuilder.mkBB();
        const loopIncBB = this.cfgBuilder.mkBB();
        const exit = this.cfgBuilder.mkBB();

        if (stmt.vInitializationExpression) {
            this.compile(stmt.vInitializationExpression);
        }

        this.cfgBuilder.jump(header, src);
        this.cfgBuilder.curBB = header;

        const cond = stmt.vCondition
            ? this.exprCompiler.compile(stmt.vCondition)
            : this.cfgBuilder.factory.booleanLiteral(noSrc, true);

        this.cfgBuilder.branch(cond, body, exit, src);
        this.cfgBuilder.curBB = body;

        this.loopStack.push([exit, header]);
        this.compile(stmt.vBody);
        this.loopStack.pop();

        if (this.cfgBuilder.isCurBBSet) {
            this.cfgBuilder.jump(loopIncBB, src);
        }

        this.cfgBuilder.curBB = loopIncBB;

        if (stmt.vLoopExpression) {
            this.compile(stmt.vLoopExpression);
        }

        this.cfgBuilder.jump(header, src);
        this.cfgBuilder.curBB = exit;
    }

    makeTmpAssignments(expr: ir.Expression | null, type: ir.Type | null): ir.Identifier[] {
        if (expr instanceof IRTuple2) {
            assert(type instanceof IRTupleType2, `Unexpected type {0} for tuple {1}`, type, expr);
            assert(
                expr.elements.length === type.elementTypes.length,
                `Mismatch between type {0} and tuple {1}`,
                type,
                expr
            );

            const res: ir.Identifier[] = [];

            for (let i = 0; i < expr.elements.length; i++) {
                const el = expr.elements[i];
                if (el === null) {
                    continue;
                }

                res.push(...this.makeTmpAssignments(el, type.elementTypes[i] as ir.Type));
            }

            return res;
        }

        if (expr === null) {
            return [];
        }

        assert(type !== null, `Missing type for non-null expr {0}`, expr);

        const lhs = this.cfgBuilder.getTmpId(type, ir.noSrc);

        this.cfgBuilder.assign(lhs, expr, noSrc);

        return [lhs];
    }

    /**
     * Compile a `VariableDeclarationStatement`. This needs to:
     * 1. Add all the locals to the CFGBuilder
     * 2. If there is/are initial values initialize them
     * @param stmt
     */
    compileVariableDeclarationStatement(stmt: sol.VariableDeclarationStatement): void {
        for (const decl of stmt.vDeclarations) {
            this.cfgBuilder.addLocal(decl);
        }

        if (!stmt.vInitialValue) {
            return;
        }

        const rhsV = this.exprCompiler.compile(stmt.vInitialValue);
        const rhsVs = rhsV instanceof IRTuple2 ? rhsV.elements : [rhsV];

        assert(
            rhsVs.length === stmt.assignments.length,
            `Mismatch in number of rhs vals {0} and number of lhs assignments {1} in {2}`,
            rhsVs.length,
            stmt.assignments.length,
            stmt
        );

        for (let rhsI = 0, lhsI = 0; rhsI < stmt.assignments.length; rhsI++) {
            const rhs = rhsVs[rhsI];

            if (rhs === null) {
                continue;
            }

            if (stmt.assignments[rhsI] === null) {
                /**
                 * Solidity does allow mixing values and types in tuples,
                 * and even nested tuples as long as they are not
                 * assigned to a value. However inside the nested tuple
                 * there may be some effectful expressions we want to
                 * evaluate (e.g. function calls). So flaten the rhs
                 * and emit tmp defs for anything that is not a type
                 * expr.
                 */
                this.makeTmpAssignments(rhs, this.exprCompiler.typeOf(rhs));
            } else {
                const decl = stmt.vDeclarations[lhsI++];

                assert(stmt.assignments[rhsI] === decl.id, "Builder internal error");

                const src = new ASTSource(decl);
                const lhs = this.cfgBuilder.getVarId(decl, src);
                const lhsT = this.cfgBuilder.getVarType(decl);

                this.cfgBuilder.assign(lhs, this.exprCompiler.mustCastTo(rhs, lhsT, rhs.src), src);
            }
        }
    }

    /**
     * Compile a revert statement.
     * This needs to encode the error signature correctly.
     */
    compileRevert(stmt: sol.RevertStatement): void {
        const decl = stmt.errorCall.vReferencedDeclaration;
        const factory = this.cfgBuilder.factory;

        assert(
            decl instanceof ErrorDefinition,
            `Expected error def not {0} for {1}`,
            decl,
            stmt.errorCall
        );

        const sig = this.cfgBuilder.infer.signature(decl);
        const sigStr = this.cfgBuilder.getStrLit(sig, noSrc);
        const args: ir.Expression[] = [];

        for (const arg of stmt.errorCall.vArguments) {
            const solArgT = this.cfgBuilder.infer.typeOf(arg);
            args.push(this.cfgBuilder.getStrLit(abiTypeToCanonicalName(solArgT), noSrc));
            args.push(this.exprCompiler.compile(arg));
        }

        const argTs = args.map((arg) => this.exprCompiler.typeOf(arg));

        const errBytes = this.cfgBuilder.getTmpId(u8ArrMemPtr);
        const funName = `builtin_abi_encodeWithSignature_${args.length}`;
        // Call builtin_abi_encodeWithSignature_N
        this.cfgBuilder.call(
            [errBytes],
            factory.identifier(noSrc, funName, noType),
            [factory.memConstant(noSrc, "memory")],
            argTs,
            [sigStr, ...args],
            new ASTSource(stmt.errorCall)
        );

        // Call sol_revert_08(bytes)
        this.cfgBuilder.call(
            [],
            this.cfgBuilder.factory.identifier(new ASTSource(stmt), "sol_revert_08", noType),
            [factory.memConstant(noSrc, "memory")],
            [],
            [errBytes],
            new ASTSource(stmt)
        );
    }

    /**
     * Compile a throw statement
     */
    compileThrow(stmt: sol.Throw): void {
        const src = new ASTSource(stmt);

        this.cfgBuilder.call(
            [],
            this.cfgBuilder.factory.identifier(src, "sol_revert", noType),
            [],
            [],
            [],
            src
        );
    }

    private detectClauses(
        node: sol.TryStatement
    ): [sol.TryCatchClause, sol.TryCatchClause | undefined, sol.TryCatchClause[]] {
        const success = node.vClauses[0];

        const withSignature: sol.TryCatchClause[] = [];

        let catchAll: sol.TryCatchClause | undefined;

        for (let i = 1; i < node.vClauses.length; i++) {
            const clause = node.vClauses[i];

            if (clause.errorName === "") {
                assert(catchAll === undefined, "Multiple catch-all clauses", node);

                catchAll = clause;
            } else {
                withSignature.push(clause);
            }
        }

        return [success, catchAll, withSignature];
    }

    // @todo (dimo) this should be moved to solc-typed-ast
    private getClauseSigHash(clause: TryCatchClause): string {
        const infer = this.cfgBuilder.infer;
        const argTypes: string[] = clause.vParameters
            ? clause.vParameters.vParameters.map((decl) =>
                  abiTypeToCanonicalName(
                      generalizeType(infer.variableDeclarationToTypeNode(decl))[0]
                  )
              )
            : [];
        const sig = `${clause.errorName}(${argTypes.join(",")})`;
        return sol.encodeFuncSignature(sig, true);
    }

    /**
     * Compile a single try-catch clause with pre-computed arguments in `actuals`.
     */
    private compileTryClause(
        clause: TryCatchClause,
        actuals: ir.Expression[],
        unionBB: BasicBlock
    ): void {
        const builder = this.cfgBuilder;
        const formals = clause.vParameters === undefined ? [] : clause.vParameters.vParameters;

        assert(
            clause.vParameters === undefined || formals.length === actuals.length,
            "Mismatch between try/catch clause params: {0} and actuals: {1}",
            clause,
            actuals
        );

        // Assign clause formals
        for (let i = 0; i < formals.length; i++) {
            const formal = formals[i];
            const actual = actuals[i];

            const declSrc = new ASTSource(formal);
            const irFormal = builder.getVarId(formal, declSrc);
            builder.assign(irFormal, actual, declSrc);
        }

        // Compile clause body
        this.compile(clause.vBlock);

        // Jump to union BB if we didnt terminate already
        if (builder.isCurBBSet) {
            builder.jump(unionBB, new ASTSource(clause));
        }
    }

    /**
     * Compile a single try-catch clause with signature. Just abi-decodes the arguments
     * and lets `compileTryClause` do ther est.
     */
    private compileTryClauseWithSignature(
        clause: TryCatchClause,
        sigExpr: ir.Expression,
        errorBytes: ir.Expression,
        nextClauseBB: BasicBlock,
        unionBB: BasicBlock
    ): void {
        const builder = this.cfgBuilder;
        const factory = builder.factory;
        const infer = builder.infer;

        const sigMatchBB = builder.mkBB();
        const sig = this.getClauseSigHash(clause);
        const clauseSrc = new ASTSource(clause);
        const errorBytesT = factory.typeOf(errorBytes);

        assert(errorBytesT instanceof ir.PointerType, ``);

        builder.branch(
            factory.binaryOperation(
                noSrc,
                sigExpr,
                "==",
                factory.numberLiteral(noSrc, BigInt(sig), 16, u32),
                boolT
            ),
            sigMatchBB,
            nextClauseBB,
            clauseSrc
        );

        builder.curBB = sigMatchBB;

        const params = clause.vParameters ? clause.vParameters.vParameters : [];
        const paramTs = params.map((decl) => infer.variableDeclarationToTypeNode(decl));
        const paramIrTs = paramTs.map((soLT) => transpileType(soLT, factory));
        const irParams = params.map((decl, i) =>
            this.cfgBuilder.getTmpId(paramIrTs[i], new ASTSource(decl))
        );

        if (irParams.length > 0) {
            const args: ir.Expression[] = [errorBytes];

            for (let i = 0; i < irParams.length; i++) {
                args.push(this.exprCompiler.getAbiTypeStringConst(paramTs[i]));
            }

            builder.call(
                irParams,
                factory.funIdentifier(`builtin_abi_decodeWithHash_${paramTs.length}`),
                [errorBytesT.region],
                paramIrTs,
                args,
                clauseSrc
            );
        }

        this.compileTryClause(clause, irParams, unionBB);
    }

    /**
     * Compile the try-catch clause. Several edge cases:
     * 1. If no clause is present, emit a default clause that aborts.
     * 2. Handle the case when not bytes memory arg is present
     */
    private compileCatchAllClause(
        clause: TryCatchClause | undefined,
        errorBytes: ir.Expression,
        unionBB: BasicBlock
    ): void {
        const builder = this.cfgBuilder;
        const factory = builder.factory;

        if (clause === undefined) {
            builder.abort(noSrc);
            return;
        }

        const params: ir.Expression[] = [];

        if (clause.vParameters) {
            const decl = single(clause.vParameters.vParameters);
            const declSrc = new ASTSource(decl);
            const irDecl = builder.getVarId(decl, declSrc);
            params.push(this.exprCompiler.mustCastTo(errorBytes, factory.typeOf(irDecl), declSrc));
        }

        this.compileTryClause(clause, params, unionBB);
    }

    compileTryStatement(stmt: sol.TryStatement): void {
        const builder = this.cfgBuilder;
        const factory = builder.factory;

        // Before we get started add clause decls as locals
        for (const clause of stmt.vClauses) {
            if (clause.vParameters === undefined) {
                continue;
            }

            for (const decl of clause.vParameters.vParameters) {
                this.cfgBuilder.addLocal(decl);
            }
        }

        // First make the transaction call
        const callRes = this.exprCompiler.compile(stmt.vExternalCall);
        let rets: ir.Expression[];
        let aborted: ir.Expression;
        const src = new ASTSource(stmt);

        if (callRes instanceof IRTuple2) {
            rets = callRes.elements.slice(0, -1) as ir.Expression[];
            aborted = callRes.elements[callRes.elements.length - 1] as ir.Expression;
        } else {
            rets = [];
            aborted = callRes;
        }

        // Next detect the different kinds of clauses
        const [successClause, catchAllClause, clausesWithSigs] = this.detectClauses(stmt);

        const successBB = builder.mkBB();
        const checkArrLenBB = builder.mkBB();
        const unionBB = builder.mkBB();

        builder.branch(aborted, checkArrLenBB, successBB, src);

        // Next compile the success clause
        builder.curBB = successBB;
        this.compileTryClause(successClause, rets, unionBB);

        // Next compile the catch-all clause. If no catch-all clause is present, emit a
        // default one that aborts to propagate exception
        const catchAllBB = builder.mkBB();
        builder.curBB = catchAllBB;
        this.compileCatchAllClause(
            catchAllClause,
            factory.identifier(noSrc, "_exception_bytes_", u8ArrExcPtr),
            unionBB
        );

        // Jump to catch-all clause if < 4 bytes of exception bytes found
        let nextClauseBB = builder.mkBB();
        builder.curBB = checkArrLenBB;

        const excBytes = factory.identifier(noSrc, "_exception_bytes_", u8ArrExcPtr);
        const lenLessThan4 = factory.binaryOperation(
            noSrc,
            builder.arrayLength(noSrc, excBytes),
            "<",
            factory.numberLiteral(noSrc, 4n, 10, u256),
            boolT
        );
        builder.branch(lenLessThan4, catchAllBB, nextClauseBB, src);

        builder.curBB = nextClauseBB;
        const sigExpr = builder.getSelectorFromData(excBytes);

        // Next compile each clause with a signature. For each we check if its
        // signature matches the exception bytes selector.
        for (const clause of clausesWithSigs) {
            nextClauseBB = builder.mkBB();
            this.compileTryClauseWithSignature(clause, sigExpr, excBytes, nextClauseBB, unionBB);

            builder.curBB = nextClauseBB;
        }

        // If none of the signature clauses matched, jump to the catch-all clause
        builder.jump(catchAllBB, src);

        // Finally set the curBB to the unionBB to continue compilation
        builder.curBB = unionBB;
    }

    /**
     * Compile a single Solidity statment `stmt`. Note that this may
     * add multiple ir statements, or even new basic blocks (e.g. for ternaries)
     */
    compile(stmt: sol.Statement): void {
        if (stmt instanceof sol.Block || stmt instanceof sol.UncheckedBlock) {
            return this.compileBlock(stmt);
        }

        if (stmt instanceof sol.PlaceholderStatement) {
            return this.compilePlaceholderStatement(stmt);
        }

        if (stmt instanceof sol.ExpressionStatement) {
            return this.compileExpressionStatement(stmt);
        }

        if (stmt instanceof sol.Return) {
            return this.compileReturn(stmt);
        }

        if (stmt instanceof sol.IfStatement) {
            return this.compileIfStatement(stmt);
        }
        if (stmt instanceof sol.VariableDeclarationStatement) {
            return this.compileVariableDeclarationStatement(stmt);
        }

        if (stmt instanceof sol.WhileStatement) {
            return this.compileWhileStatement(stmt);
        }

        if (stmt instanceof sol.DoWhileStatement) {
            return this.compileDoWhileStatement(stmt);
        }

        if (stmt instanceof sol.ForStatement) {
            return this.compileForStatement(stmt);
        }

        if (stmt instanceof sol.Break) {
            return this.compileBreak(stmt);
        }

        if (stmt instanceof sol.Continue) {
            return this.compileContinue(stmt);
        }

        if (stmt instanceof sol.RevertStatement) {
            return this.compileRevert(stmt);
        }

        if (stmt instanceof sol.Throw) {
            return this.compileThrow(stmt);
        }

        if (stmt instanceof TryStatement) {
            return this.compileTryStatement(stmt);
        }

        throw new Error(`NYI compiling ${pp(stmt)}`);
    }
}
