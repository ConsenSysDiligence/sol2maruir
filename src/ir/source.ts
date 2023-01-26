import { BaseSrc, noSrc } from "maru-ir2";
import { ASTNode } from "solc-typed-ast";

export class ASTSource extends BaseSrc {
    constructor(public nd: ASTNode) {
        super();
    }

    pp(): string {
        return this.nd.src;
    }
}

export class LocalVarZeroInit extends ASTSource {}
export class ReturnVarZeroInit extends ASTSource {}

export function getSrc(nd: ASTNode | undefined = undefined): BaseSrc {
    return nd ? new ASTSource(nd) : noSrc;
}
