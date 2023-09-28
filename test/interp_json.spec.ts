import expect from "expect";
import * as fse from "fs-extra";
import { Definition } from "maru-ir2";
import { assert, ASTReader, compileSol, getABIEncoderVersion } from "solc-typed-ast";
import { UnitCompiler } from "../src";
import { SolMaruirInterp } from "../src/interp";
import { buildMaps, JSONConfigTranspiler } from "./json_config_transpiler";
import { searchRecursive } from "./utils";

describe("Interpreter tests for *.config.json", () => {
    const files = searchRecursive("test/samples/solidity", (fileName) =>
        fileName.endsWith(".config.json")
    );

    /*
    const files = [
        "test/samples/solidity/calls.config.json",
        "test/samples/solidity/EncodingTest.config.json",
        "test/samples/solidity/ABIEncoderV2_Structs.config.json",
        "test/samples/solidity/public_getters.config.json",
        "test/samples/solidity/AddressLiteralMemberAccess.config.json",
        "test/samples/solidity/CalldataArgPassing.config.json",
        "test/samples/solidity/dispatch.config.json",
        "test/samples/solidity/public_getters.config.json"
        "test/samples/solidity/abi_decode_fails.config.json"
        "test/samples/solidity/value.config.json"
        "test/samples/solidity/lowlevel_calls_04.config.json"
        "test/samples/solidity/TryCatch.config.json",
        "test/samples/solidity/TryCatchMisc.config.json",
        "test/samples/solidity/TryCatchShadowing.config.json",
        "test/samples/solidity/TryCatchState.config.json",
        "test/samples/solidity/TryCatchStateNested.config.json"
        "test/samples/solidity/TryCatch08.config.json",
        "test/samples/solidity/lowlevel_calls_04.config.json",
        "test/samples/solidity/lowlevel_calls_08.config.json"
    ];
        */

    for (const jsonFile of files) {
        it(jsonFile, async () => {
            const config = await fse.readJson(jsonFile);
            const file = config.file;

            const result = await compileSol(file, "auto");
            const reader = new ASTReader();
            const units = reader.read(result.data);

            assert(result.compilerVersion !== undefined, "Unable to detect compiler version");

            const compiler = new UnitCompiler(result.compilerVersion);

            let transpiledDefs: Definition[];

            try {
                transpiledDefs = [...compiler.compile(units)];
            } catch (e) {
                console.error(`Failed transpiling ${jsonFile}`);

                throw e;
            }

            const [methodMap, contractMap, buildMsgDataMap] = buildMaps(
                transpiledDefs,
                result.compilerVersion as string
            );

            const jsonCompiler = new JSONConfigTranspiler(
                result.compilerVersion as string,
                getABIEncoderVersion(units[0], result.compilerVersion),
                compiler.factory,
                compiler.globalUid,
                compiler.globalScope,
                config,
                methodMap,
                contractMap,
                buildMsgDataMap,
                units[0]
            );

            const main = jsonCompiler.compile();
            compiler.globalScope.define(main);

            const defs = [...compiler.globalScope.definitions()];

            // Uncomment below lines to see compiled maruir file
            const contents = defs.map((def) => def.pp()).join("\n");
            const maruirFile = jsonFile.replace(".config.json", ".maruir");

            fse.writeFileSync(maruirFile, contents, {
                encoding: "utf8"
            });

            const interp = new SolMaruirInterp(defs, true);

            interp.run(main, true);

            if (interp.state.failure) {
                console.log(JSON.stringify(interp.state.dump(), undefined, 4));

                throw interp.state.failure;
            }

            if (interp.state.failed) {
                console.error(`Failed interpreting ${jsonFile}`);
            }

            expect(interp.state.failed).not.toBeTruthy();

            console.error(`Success: ${jsonFile}`);
        });
    }
});
