import { Definition } from "maru-ir2";
import { SourceUnit } from "solc-typed-ast";
import { UnitCompiler } from ".";

export function transpile(units: SourceUnit[], compilerVersion: string): Definition[] {
    const compiler = new UnitCompiler(compilerVersion);

    const defs = [...compiler.compile(units)];

    return defs;
}
