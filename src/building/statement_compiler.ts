import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { ABIEncoderVersion, assert, ErrorDefinition, pp } from "solc-typed-ast";
import { CFGBuilder } from "./cfg_builder";
import { ExpressionCompiler } from "./expression_compiler";
import { ASTSource } from "../ir/source";
import { IRTuple2, IRTupleType2 } from "../ir";
import { noSrc } from "maru-ir2";
import { noType, u8ArrMemPtr } from "./typing";

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
        private readonly modifierStack: ModifierStack2,
        private readonly abiVersion: ABIEncoderVersion
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

        const modEntry = this.modifierStack.pop();
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
                    rets[i],
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
            `Mismatch in number of decls {0} and number of rhs exprs {1} in {2}`,
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
                this.cfgBuilder.assign(lhs, rhs, src);
            }
        }
    }

    /**
     * Compile a revert statement. This needs to encode the error signature
     * correctly.
     * @param stmt
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

        const sig = this.cfgBuilder.infer.signature(decl, this.abiVersion);
        const sigStr = this.exprCompiler.getStrLit(sig, noSrc);
        const args = stmt.errorCall.vArguments.map((arg) => this.exprCompiler.compile(arg));
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
     * Compile a single Solidity statment `stmt`. Note that this may
     * add multiple ir statements, or even new basic blocks (e.g. for ternaries)
     */
    compile(stmt: sol.Statement): void {
        if (stmt instanceof sol.Block || stmt instanceof sol.UncheckedBlock) {
            this.compileBlock(stmt);
        } else if (stmt instanceof sol.PlaceholderStatement) {
            this.compilePlaceholderStatement(stmt);
        } else if (stmt instanceof sol.ExpressionStatement) {
            this.compileExpressionStatement(stmt);
        } else if (stmt instanceof sol.Return) {
            this.compileReturn(stmt);
        } else if (stmt instanceof sol.IfStatement) {
            this.compileIfStatement(stmt);
        } else if (stmt instanceof sol.VariableDeclarationStatement) {
            this.compileVariableDeclarationStatement(stmt);
        } else if (stmt instanceof sol.WhileStatement) {
            this.compileWhileStatement(stmt);
        } else if (stmt instanceof sol.DoWhileStatement) {
            this.compileDoWhileStatement(stmt);
        } else if (stmt instanceof sol.ForStatement) {
            this.compileForStatement(stmt);
        } else if (stmt instanceof sol.Break) {
            this.compileBreak(stmt);
        } else if (stmt instanceof sol.Continue) {
            this.compileContinue(stmt);
        } else if (stmt instanceof sol.RevertStatement) {
            this.compileRevert(stmt);
        } else {
            throw new Error(`NYI Compiling ${pp(stmt)}`);
        }
    }
}
