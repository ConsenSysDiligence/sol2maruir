import * as ir from "maru-ir2";
import { pp } from "maru-ir2";
import { InternalExpression } from "./internal_expression";

export class IRTuple2 extends InternalExpression {
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

    copy(): IRTuple2 {
        return new IRTuple2(
            this.src,
            this.elements.map((el) => (el ? el.copy() : el))
        );
    }
}
