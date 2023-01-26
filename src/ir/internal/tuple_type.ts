import * as ir from "maru-ir2";
import { pp } from "maru-ir2";
import { InternalType } from "./internal_type";

export class IRTupleType2 extends InternalType {
    constructor(src: ir.BaseSrc, public readonly elementTypes: Array<ir.Type | null>) {
        super(src);
    }

    pp(): string {
        return `(${this.elementTypes.map((el) => pp(el)).join(", ")})`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<ir.Node> {
        return this.elementTypes.filter((el) => el !== null) as ir.Type[];
    }
}
