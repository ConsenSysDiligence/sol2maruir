import expect from "expect";
import * as fse from "fs-extra";
import * as ir from "maru-ir2";
import { Definition } from "maru-ir2";
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

                let transpiledDefs: Definition[];

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

            /**
             * Note that this test case is skipped intentionally
             * to not cause additional time consumption.
             *
             * Feel free to unskip it for sake of local testing purposes.
             */
            it.skip("Resulting IR program does not contain compile-time (internal) nodes and duplicate nodes", () => {
                const nodes = new Set<ir.Node>();

                for (const def of defs) {
                    ir.walk(def, (node) => {
                        sol.assert(
                            !nodes.has(node),
                            "Node {0} ({1}) has a duplicate",
                            node,
                            node.constructor.name
                        );

                        nodes.add(node);

                        expect(node).not.toBeInstanceOf(InternalExpression);

                        if (node instanceof ir.Expression) {
                            const typeNode = interp.typing.typeOf(node);

                            expect(typeNode).not.toBeInstanceOf(InternalType);
                        }
                    });
                }
            });

            it("IR program is executed by interpreter as expected", async () => {
                const withOutput = true;

                interp.run(entryFunc, withOutput);

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
