import expect from "expect";
import * as fse from "fs-extra";
import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { InternalExpression, InternalType, UnitCompiler } from "../src";
import { SolMaruirInterp } from "../src/interp";
import { JSONConfigTranspiler, buildMaps } from "./json_config_transpiler";
import { searchRecursive } from "./utils";

describe("*.config.json samples", () => {
    const files = searchRecursive("test/samples/solidity", (fileName) =>
        fileName.endsWith(".config.json")
    );

    for (const sample of files) {
        describe(sample, () => {
            let defs: ir.Program;
            let entryFunc: ir.FunctionDefinition;
            let interp: SolMaruirInterp;

            before(async () => {
                const config = await fse.readJson(sample);
                const file = config.file;

                const result = await sol.compileSol(file, "auto");
                const reader = new sol.ASTReader();
                const units = reader.read(result.data);

                sol.assert(
                    result.compilerVersion !== undefined,
                    "Unable to detect compiler version"
                );

                const compiler = new UnitCompiler(result.compilerVersion);

                let transpiledDefs: ir.Definition[];

                try {
                    transpiledDefs = [...compiler.compile(units)];
                } catch (e) {
                    console.error(`Failed transpiling ${sample}`);

                    throw e;
                }

                const [methodMap, contractMap, buildMsgDataMap] = buildMaps(
                    transpiledDefs,
                    result.compilerVersion as string
                );

                const jsonCompiler = new JSONConfigTranspiler(
                    result.compilerVersion as string,
                    sol.getABIEncoderVersion(units[0], result.compilerVersion),
                    compiler.factory,
                    compiler.globalUid,
                    compiler.globalScope,
                    config,
                    methodMap,
                    contractMap,
                    buildMsgDataMap,
                    units[0]
                );

                entryFunc = jsonCompiler.compile();

                compiler.globalScope.define(entryFunc);

                defs = [...compiler.globalScope.definitions()];

                // Uncomment below lines to see compiled maruir file
                // const contents = defs.map((def) => def.pp()).join("\n");
                // const irFile = sample.replace(".config.json", ".maruir");

                // await fse.writeFile(irFile, contents, { encoding: "utf8" });

                interp = new SolMaruirInterp(defs, true);
            });

            it("IR program does not have node reuses", () => {
                const reuses = ir.findMultiParentNodes(defs);

                const parts: string[] = [];

                const helper = (node: ir.Node): string =>
                    `${node.constructor.name} #${node.id} [${node.pp()}]`;

                const indentedHelper = (node: ir.Node): string => "    " + helper(node);

                for (const [used, using] of reuses) {
                    if (
                        used instanceof ir.Type ||
                        used instanceof ir.MemConstant ||
                        used instanceof ir.MemIdentifier
                    ) {
                        continue;
                    }

                    parts.push(
                        `${helper(used)} is used by several nodes:\n${using
                            .map(indentedHelper)
                            .join("\n")}`
                    );
                }

                sol.assert(parts.length === 0, parts.join("\n\n"));
            });

            it("IR program does not contain compile-time (internal) nodes", () => {
                for (const def of defs) {
                    for (const node of ir.traverse(def)) {
                        expect(node).not.toBeInstanceOf(InternalExpression);

                        if (node instanceof ir.Expression) {
                            const typeNode = interp.typing.typeOf(node);

                            expect(typeNode).not.toBeInstanceOf(InternalType);
                        }
                    }
                }
            });

            it("IR program is executed by interpreter as expected", async () => {
                const showOutput = false;

                interp.run(entryFunc, showOutput);

                if (interp.state.failure) {
                    console.log(JSON.stringify(interp.state.dump(), undefined, 4));

                    throw interp.state.failure;
                }

                if (interp.state.failed) {
                    console.error(`Failed interpreting ${sample}`);
                }

                expect(interp.state.failed).not.toBeTruthy();
            });
        });
    }
});
