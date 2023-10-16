import * as ir from "maru-ir2";
import { pp } from "maru-ir2";
import { InternalExpression } from "./internal_expression";

export class SolArrayLiteral extends InternalExpression {
    constructor(
        src: ir.BaseSrc,
        public readonly elements: Array<ir.Expression | null>
    ) {
        super(src);
    }

    pp(): string {
        return `(${this.elements.map((el) => pp(el)).join(", ")})`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<ir.Node> {
        return this.elements.filter((el) => el !== null) as ir.Expression[];
    }

    copy(): SolArrayLiteral {
        return new SolArrayLiteral(
            this.src,
            this.elements.map((el) => (el ? el.copy() : el))
        );
    }
}
