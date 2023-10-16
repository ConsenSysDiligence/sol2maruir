import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { InternalExpression } from "./internal_expression";

// Placeholder node that is used for translating Identifier and MemberAccess
// expressions directly corresponding to contact, function, event, struct or
// other definition name. These may appear at the top-level in an ExpressionStatement, or as part of
// tuples.
// Note: SHOULD NOT APPEAR IN EMITTED CODE.
export class SolDefinitionExpression extends InternalExpression {
    constructor(
        src: ir.BaseSrc,
        public readonly raw: sol.Identifier | sol.MemberAccess | sol.IdentifierPath
    ) {
        super(src);
    }

    pp(): string {
        return `SolDefinitionExpression#${this.raw.id}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<ir.Node> {
        return [];
    }

    copy(): SolDefinitionExpression {
        return new SolDefinitionExpression(this.src, this.raw);
    }
}
