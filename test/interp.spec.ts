import { ASTReader, compileSol } from "solc-typed-ast";
import { ABIEncoderVersion } from "solc-typed-ast/dist/types/abi";
import { single, UnitCompiler } from "../src";
import { Resolving, Typing } from "maru-ir2";
import { buildMaps, JSONConfigTranspiler } from "./json_config_transpiler";
import * as fse from "fs-extra";
import * as ir from "maru-ir2";
import { SolMaruirInterp } from "../src/interp";
import expect from "expect";

describe("Mir2", async () => {
    const files = [
        /*
        "test/samples/solidity/simple.config.json",
        "test/samples/solidity/ifs_v04.config.json",
        "test/samples/solidity/while_v04.config.json",
        "test/samples/solidity/fors_v04.config.json",
        "test/samples/solidity/overflow_and_underflow.config.json"
        */
        "test/samples/solidity/overflow_08.config.json"
    ];

    for (const jsonFile of files) {
        const file = jsonFile.replace(".config.json", ".sol");

        const config = fse.readJsonSync(jsonFile);
        const result = await compileSol(file, "auto");
        const reader = new ASTReader();
        const units = reader.read(result.data);

        const compiler = new UnitCompiler(result.compilerVersion as string, ABIEncoderVersion.V2);
        const jsonCompiler = new JSONConfigTranspiler(
            result.compilerVersion as string,
            compiler.factory
        );
        const transpiledDefs = [...compiler.compile(units)];
        const [methodMap, contractMap] = buildMaps(
            transpiledDefs,
            result.compilerVersion as string,
            ABIEncoderVersion.V2
        );
        const mainDefs = [...jsonCompiler.compileConfig(config, methodMap, contractMap)];

        const defs = [...transpiledDefs, ...mainDefs];

        let contents = "";
        for (const def of defs) {
            contents += def.pp() + "\n";
        }

        console.log(contents);

        const resolving = new Resolving(defs);
        new Typing(defs, resolving);

        const interp = new SolMaruirInterp(defs, true);

        const main = single(
            defs.filter((def) => def instanceof ir.FunctionDefinition && def.name === "main")
        ) as ir.FunctionDefinition;

        const [failed] = interp.call(main, [], true);

        expect(failed).not.toBeTruthy();
    }
});
