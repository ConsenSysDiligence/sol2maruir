import expect from "expect";
// import * as fse from "fs-extra";
import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { InternalExpression, InternalType, UnitCompiler } from "../src";
import { SolMaruirInterp } from "../src/interp";
import { EntryPointFunctionCompiler } from "./entry_point_function_compiler";
import { searchRecursive } from "./utils";

describe("*.config.sol samples", () => {
    const files = searchRecursive("test/samples/solidity", (fileName) =>
        fileName.endsWith(".config.sol")
    );

    for (const sample of files) {
        describe(sample, () => {
            let defs: ir.Program;
            let entryFunc: ir.FunctionDefinition;
            let interp: SolMaruirInterp;

            before(async () => {
                const result = await sol.compileSol(sample, "auto");
                const reader = new sol.ASTReader();

                const units = reader.read(result.data);
                const mainUnit = units[0];

                sol.assert(
                    result.compilerVersion !== undefined,
                    "Unable to detect compiler version"
                );

                const compiler = new UnitCompiler(result.compilerVersion);

                try {
                    defs = [...compiler.compile(units)];
                } catch (e) {
                    console.error(`Failed transpiling ${sample}`);

                    throw e;
                }

                const mainContractName = "__IRTest__";

                const mainContract = defs.find(
                    (def): def is ir.StructDefinition =>
                        def instanceof ir.StructDefinition && def.name.startsWith(mainContractName)
                );

                sol.assert(
                    mainContract !== undefined,
                    `Unable to detect contract definition "${mainContractName}"`
                );

                const mainContractCtr = defs.find(
                    (def): def is ir.FunctionDefinition =>
                        def instanceof ir.FunctionDefinition &&
                        def.name.startsWith(mainContractName + "_constructor")
                );

                sol.assert(
                    mainContractCtr !== undefined,
                    `Unable to detect ${mainContractName}.main() function`
                );

                const mainFunc = defs.find(
                    (def): def is ir.FunctionDefinition =>
                        def instanceof ir.FunctionDefinition &&
                        def.name.match(new RegExp(mainContractName + "_main_[0-9a-f]{8}")) !== null
                );

                sol.assert(
                    mainFunc !== undefined,
                    `Unable to detect ${mainContractName}.main() function`
                );

                const entryCompiler = new EntryPointFunctionCompiler(
                    result.compilerVersion,
                    sol.getABIEncoderVersion(mainUnit, result.compilerVersion),
                    compiler.factory,
                    compiler.globalUid,
                    compiler.globalScope,
                    mainUnit,
                    mainContract,
                    mainContractCtr,
                    mainFunc
                );

                entryFunc = entryCompiler.compile();

                defs.push(entryFunc);

                // Uncomment below lines to see compiled maruir file
                // const contents = defs.map((def) => def.pp()).join("\n");
                // const irFile = sample.replace(".config.sol", ".maruir");

                // await fse.writeFile(irFile, contents, { encoding: "utf8" });

                interp = new SolMaruirInterp(defs, true);
            });

            it("Resulting IR program does not contain compile-time (internal) nodes and duplicate nodes", () => {
                const nodes = new Set<ir.Node>();

                for (const def of defs) {
                    ir.walk(def, (node) => {
                        // sol.assert(
                        //     !nodes.has(node),
                        //     "Node {0} ({1}) has a duplicate",
                        //     node,
                        //     node.constructor.name
                        // );

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
                    console.error(`Failed interpreting "${sample}"`);
                }

                expect(interp.state.failed).not.toBeTruthy();

                /**
                 * @todo Uncomment following lines to remove original samples
                 * and their JSON configs on successful run.
                 */
                // const config = sample.replace(".config.sol", ".config.json");

                // if (await fse.exists(config)) {
                //     const json = await fse.readJson(config, { encoding: "utf-8" });

                //     await fse.remove(json.file);
                //     await fse.remove(config);
                // } else {
                //     console.error(`Config file "${config}" already removed`);
                // }
            });
        });
    }
});
