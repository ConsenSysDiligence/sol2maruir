#!/usr/bin/env node
import fse from "fs-extra";
import minimist from "minimist";
import { ASTReader, compileSourceString, LatestCompilerVersion } from "solc-typed-ast";
import { transpile } from "../transpile";

const cli = {
    boolean: ["version", "help", "stdin"],
    string: [],
    default: {}
};

(async () => {
    const args = minimist(process.argv.slice(2), cli);

    if (args.version) {
        const { version } = require("../../package.json");

        console.log(version);
    } else if (args.help || (!args._.length && !args.stdin)) {
        const message = `Utility for translating solidity files to MaruIR
USAGE:
$ sol2maruir <filename>

OPTIONS:
    --help                  Print help message.
    --version               Print package version.
    --stdin                 Read input from STDIN instead of file.
`;

        console.log(message);
    } else {
        let fileName: string;
        let contents: string;

        if (args.stdin) {
            fileName = "stdin";
            contents = await fse.readFile(process.stdin.fd, { encoding: "utf-8" });
        } else {
            fileName = args._[0];
            contents = await fse.readFile(fileName, { encoding: "utf-8" });
        }

        const result = await compileSourceString(fileName, contents, "auto");
        const reader = new ASTReader();

        const units = reader.read(result.data);

        const defs = transpile(units, result.compilerVersion || LatestCompilerVersion);

        console.log(defs.map((def) => def.pp()).join("\n"));
    }
})().catch((e) => {
    console.log(e.message);

    process.exit(1);
});
