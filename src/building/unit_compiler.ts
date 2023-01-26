import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { noSrc } from "maru-ir2";
import { blockPtrT, msgPtrT, transpileType, u16, u160 } from "./typing";
import { ASTSource } from "../ir/source";
import { FunctionCompiler } from "./function_compiler";
import { ABIEncoderVersion, assert, InferType } from "solc-typed-ast";
import { compileGlobalVarInitializer } from "./literal_compiler";
import { getDesugaredGlobalVarName, getDispatchName } from "./resolving";
import { ConstructorCompiler } from "./constructor_compiler";
import { CFGBuilder } from "./cfg_builder";
import { preamble } from "./preamble";
import { IRFactory } from "./factory";

type OverrideMap = Map<sol.ContractDefinition, Map<string, sol.FunctionDefinition[]>>;
type InheritMap = Map<sol.ContractDefinition, sol.ContractDefinition[]>;

export class UnitCompiler {
    private readonly globalScope: ir.Scope;
    private readonly versionMap: Map<sol.SourceUnit, [string, string]>;
    private readonly inferMap: Map<string, sol.InferType>;
    public readonly factory: IRFactory = new IRFactory();

    constructor(
        private readonly solVersion: string,
        private readonly abiVersion: sol.ABIEncoderVersion
    ) {
        this.globalScope = new ir.Scope();
        this.solVersion;
        this.abiVersion;
        this.versionMap = new Map();
        this.inferMap = new Map();
    }

    compile(units: sol.SourceUnit[]): Iterable<ir.Definition> {
        for (const def of preamble) {
            this.globalScope.define(
                def as ir.FunctionDefinition | ir.StructDefinition | ir.GlobalVariable
            );
        }
        for (const unit of units) {
            const [compilerVersion, abiVersion] = this.detectVersions(unit);
            this.versionMap.set(unit, [compilerVersion, abiVersion]);
        }

        for (const unit of units) {
            this.compileUnit(unit);
        }

        const overrideMap = this.buildOverrideMap(units);

        for (const [contract, methodOverrideMap] of overrideMap) {
            const unit = contract.vScope;
            const [solVersion] = this.versionMap.get(unit) as [string, ABIEncoderVersion];
            const infer = this.inferMap.get(solVersion) as InferType;

            for (const [sig, overridingImpls] of methodOverrideMap) {
                // Ignore constructors, receive and fallback
                if (sig === "" || sig === "receive" || sig === "fallback") {
                    continue;
                }

                this.globalScope.define(
                    this.compileMethodDispatch(contract, sig, overridingImpls, infer)
                );
            }
        }

        return this.globalScope.definitions();
    }

    private getInfer(arg: string | sol.SourceUnit): sol.InferType {
        if (arg instanceof sol.SourceUnit) {
            const [version] = this.versionMap.get(arg) as [string, string];

            arg = version;
        }

        if (!this.inferMap.has(arg)) {
            this.inferMap.set(arg, new sol.InferType(arg));
        }

        return this.inferMap.get(arg) as sol.InferType;
    }

    private detectVersions(unit: sol.SourceUnit): [string, sol.ABIEncoderVersion] {
        // @note For now we just assume all units have the same sol/abi version.
        // In the future We may want to detect them per unit.
        // @todo: After upgrading to solc-typed-ast 11.0.3 change the abi logic here
        return [this.solVersion, this.abiVersion];
    }

    compileUnit(unit: sol.SourceUnit): void {
        const [compilerVersion] = this.detectVersions(unit);
        const infer = this.getInfer(compilerVersion);

        for (const contract of unit.vContracts) {
            const struct = this.getContractStruct(contract, infer);

            this.globalScope.define(struct);
            this.compileContractMethods(contract, struct, infer);
        }

        for (const fun of unit.vFunctions) {
            const funCompile = new FunctionCompiler(
                this.factory,
                fun,
                this.globalScope,
                this.solVersion,
                this.abiVersion,
                unit
            );

            this.globalScope.define(funCompile.compile());
        }

        for (const globConst of unit.vVariables) {
            this.globalScope.define(this.compileGlobalConst(globConst, infer));
        }
    }

    compileGlobalConst(c: sol.VariableDeclaration, infer: InferType): ir.GlobalVariable {
        const solT = infer.variableDeclarationToTypeNode(c);
        const irT = transpileType(solT, this.factory);

        assert(c.vValue !== undefined, `NYI zero-intializing of global vars`);
        const initialValue = compileGlobalVarInitializer(c.vValue, infer, this.factory);

        return this.factory.globalVariable(
            new ASTSource(c),
            getDesugaredGlobalVarName(c),
            irT,
            initialValue
        );
    }

    compileContractMethods(
        contract: sol.ContractDefinition,
        irContract: ir.StructDefinition,
        infer: InferType
    ): void {
        const constrCompiler = new ConstructorCompiler(
            this.factory,
            contract,
            this.globalScope,
            this.solVersion,
            this.abiVersion,
            irContract
        );

        this.globalScope.define(constrCompiler.compilePartialConstructor());
        this.globalScope.define(constrCompiler.compileConstructor());

        const vtbl = new Map<string, ir.FunctionDefinition>();

        for (const base of contract.vLinearizedBaseContracts) {
            for (const method of base.vFunctions) {
                // Handled separately in ConstructionCompiler
                if (method === contract.vConstructor && contract === base) {
                    continue;
                }

                const sigHash = infer.signatureHash(method, this.abiVersion);

                if (vtbl.has(sigHash)) {
                    // Already overriden
                    continue;
                }

                const funCompiler = new FunctionCompiler(
                    this.factory,
                    method,
                    this.globalScope,
                    this.solVersion,
                    this.abiVersion,
                    contract,
                    irContract
                );

                const fun = funCompiler.compile();
                this.globalScope.define(fun);

                vtbl.set(sigHash, fun);
            }
        }
    }

    compileMethodDispatch(
        contract: sol.ContractDefinition,
        sig: string,
        overridingImpls: sol.FunctionDefinition[],
        infer: InferType
    ): ir.FunctionDefinition {
        const firstImpl = overridingImpls[0];

        const funScope = new ir.Scope(this.globalScope);
        const builder = new CFGBuilder(this.globalScope, funScope, this.solVersion, this.factory);

        builder.addIRArg("block", blockPtrT, noSrc);
        builder.addIRArg("msg", msgPtrT, noSrc);
        builder.addIRArg("this", u160, noSrc);

        for (const solArg of firstImpl.vParameters.vParameters) {
            builder.addArg(solArg);
        }

        for (const solRet of firstImpl.vReturnParameters.vParameters) {
            builder.addRet(solRet);
        }

        return this.factory.functionDefinition(
            noSrc,
            [],
            [],
            getDispatchName(contract, firstImpl, infer, this.abiVersion),
            builder.args,
            [],
            builder.returns.map((ret) => ret.type)
        );
    }

    getContractStruct(contract: sol.ContractDefinition, infer: sol.InferType): ir.StructDefinition {
        const name = `${contract.name}_${contract.id}`;

        const fields: Array<[string, ir.Type]> = [
            ["__address__", u160],
            ["__rtti__", u16]
        ];

        for (const decl of contract.vStateVariables) {
            const solType = infer.variableDeclarationToTypeNode(decl);
            const irType = transpileType(solType, this.factory);

            fields.push([decl.name, irType]);
        }

        return this.factory.structDefinition(new ASTSource(contract), [], [], name, fields);
    }

    buildOverrideMap(units: sol.SourceUnit[]): OverrideMap {
        // Map from contracts to a list of their sub-contracts
        const inhMap: InheritMap = new Map();
        // Map from contracts, to a map from function signatures to the list of overriding implementations
        const res: OverrideMap = new Map();
        // Map from contracts to their vtables
        const vtblMap = new Map<sol.ContractDefinition, Map<string, sol.FunctionDefinition>>();

        // First build inheritance and vtbl maps
        for (const unit of units) {
            const infer = this.getInfer(unit);
            const [, abiVersion] = this.versionMap.get(unit) as [string, sol.ABIEncoderVersion];

            for (const contract of unit.vContracts) {
                inhMap.set(contract, []);
                res.set(contract, new Map());
                vtblMap.set(
                    contract,
                    new Map(
                        contract.vFunctions.map((fun) => [infer.signature(fun, abiVersion), fun])
                    )
                );
            }
        }

        for (const unit of units) {
            for (const contract of unit.vContracts) {
                for (const base of contract.vLinearizedBaseContracts) {
                    if (base !== contract) {
                        (inhMap.get(base) as sol.ContractDefinition[]).push(contract);
                    }
                }
            }
        }

        for (const [contract, subContracts] of inhMap) {
            const vtbl = vtblMap.get(contract) as Map<string, sol.FunctionDefinition>;

            for (const [sig, method] of vtbl) {
                // Only care about externally callable methods for dynamic dispatch.
                if (
                    method.visibility !== sol.FunctionVisibility.Default &&
                    method.visibility !== sol.FunctionVisibility.External &&
                    method.visibility !== sol.FunctionVisibility.Public
                ) {
                    continue;
                }

                const overridingImplementations: sol.FunctionDefinition[] = [method];

                for (const subContract of subContracts) {
                    const subVtbl = vtblMap.get(subContract) as Map<string, sol.FunctionDefinition>;

                    if (subVtbl.has(sig)) {
                        overridingImplementations.push(subVtbl.get(sig) as sol.FunctionDefinition);
                    }
                }

                (res.get(contract) as Map<string, sol.FunctionDefinition[]>).set(
                    sig,
                    overridingImplementations
                );
            }
        }

        return res;
    }
}
