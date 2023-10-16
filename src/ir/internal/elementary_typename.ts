import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { InternalExpression } from "./internal_expression";

// Placeholder node that is used for translating ElementaryTypeNameExpressions appearing at the top-level or inside tuples.
// Note: SHOULD NOT APPEAR IN EMITTED CODE.
export class SolElementaryTypenameExpression extends InternalExpression {
    constructor(
        src: ir.BaseSrc,
        public readonly raw: sol.ElementaryTypeNameExpression
    ) {
        super(src);
    }

    pp(): string {
        return this.raw.type;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<ir.Node> {
        return [];
    }

    copy(): SolElementaryTypenameExpression {
        return new SolElementaryTypenameExpression(this.src, this.raw);
    }
}
