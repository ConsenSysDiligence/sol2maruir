import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { assert, InferType, pp, smallestFittingType } from "solc-typed-ast";
import { ASTSource } from "../ir/source";
import { transpileType } from "./typing";
import { IRFactory } from "./factory";

/**
 * Infer the type of an int literal from the context in which its used.
 * This assumes that the operations invloving literals have been folded.
 * @param expr
 */
function inferIntType(expr: sol.Literal, infer: InferType): sol.IntType {
    const parentE = expr.parent;
    let resT: sol.TypeNode;

    if (parentE instanceof sol.BinaryOperation) {
        if (["<<", ">>", "**"].includes(parentE.operator)) {
            if (expr === parentE.vRightExpression) {
                return smallestFittingType(BigInt(expr.value)) as sol.IntType;
            }

            throw new Error(`NYI type of int literal as left child of << >> or **`);
        }

        resT = infer.typeOf(
            expr === parentE.vLeftExpression ? parentE.vRightExpression : parentE.vLeftExpression
        );
    } else if (parentE instanceof sol.Assignment) {
        assert(expr === parentE.vRightHandSide, `Unexpected position of literal in assignment`);
        resT = infer.typeOf(parentE.vLeftHandSide);
    } else {
        throw new Error(`NYI infer type of literal inside of an ${pp(parentE)}`);
    }

    assert(resT instanceof sol.IntType, `Expected int type not {0}`, resT);
    return resT;
}

export function compileGlobalVarInitializer(
    l: sol.Expression,
    infer: InferType,
    factory: IRFactory
): ir.NumberLiteral | ir.BooleanLiteral {
    const src = new ASTSource(l);

    if (l instanceof sol.Literal) {
        if (l.kind === sol.LiteralKind.Bool) {
            return factory.booleanLiteral(src, l.value === "true");
        }

        if (l.kind === sol.LiteralKind.Number) {
            const litT = inferIntType(l, infer);
            const irT = transpileType(litT, factory);

            return factory.numberLiteral(
                src,
                BigInt(l.value),
                l.value.startsWith("0x") ? 16 : 10,
                irT as ir.IntType
            );
        }
    }

    throw new Error(`NYI compileGlobalVarInitializer(${pp(l)})`);
}
