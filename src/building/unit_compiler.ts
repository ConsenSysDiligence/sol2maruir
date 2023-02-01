import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { noSrc } from "maru-ir2";
import { transpileType, u16, u160 } from "./typing";
import { ASTSource } from "../ir/source";
import { FunctionCompiler } from "./function_compiler";
import { assert, InferType } from "solc-typed-ast";
import { compileGlobalVarInitializer } from "./literal_compiler";
import { getDesugaredGlobalVarName, getIRStructDefName } from "./resolving";
import { ConstructorCompiler } from "./constructor_compiler";
import { preamble } from "./preamble";
import { IRFactory } from "./factory";
import { DispatchCompiler } from "./dispatch_compiler";

type InheritMap = Map<sol.ContractDefinition, sol.ContractDefinition[]>;

type OverridenImplsList = Array<[ir.StructDefinition, ir.FunctionDefinition]>;
type OverridenImplsMap = Map<sol.FunctionDefinition, OverridenImplsList>;
type OverrideMap = Map<sol.ContractDefinition, OverridenImplsMap>;

function isExternallyVisible(fun: sol.FunctionDefinition): boolean {
    return [
        sol.FunctionVisibility.Default,
        sol.FunctionVisibility.Public,
        sol.FunctionVisibility.External
    ].includes(fun.visibility);
}

export class UnitCompiler {
    private readonly globalScope: ir.Scope;
    private readonly versionMap: Map<sol.SourceUnit, [string, string]>;
    private readonly inferMap: Map<string, sol.InferType>;
    public readonly factory: IRFactory = new IRFactory();

    private emittedStructMap = new Map<sol.ContractDefinition, ir.StructDefinition>();
    private emittedMethodMap = new Map<
        sol.ContractDefinition,
        Map<string, ir.FunctionDefinition>
    >();

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

        const inheritMap = this.buildInheritMap(units);
        const overrideMap = this.buildOverrideMap(inheritMap);

        for (const [contract, methodOverrideMap] of overrideMap) {
            for (const [method, overridingImpls] of methodOverrideMap) {
                this.globalScope.define(
                    this.compileMethodDispatch(contract, method, overridingImpls)
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

    compileStructDef(def: sol.StructDefinition, infer: sol.InferType): ir.StructDefinition {
        const fields: Array<[string, ir.Type]> = [];

        for (const decl of def.vMembers) {
            fields.push([
                decl.name,
                transpileType(
                    infer.variableDeclarationToTypeNode(decl),
                    this.factory,
                    new ir.MemIdentifier(noSrc, "M")
                )
            ]);
        }

        const name = getIRStructDefName(def);

        const res = this.factory.structDefinition(
            new ASTSource(def),
            [new ir.MemVariableDeclaration(noSrc, "M")],
            [],
            name,
            fields
        );

        return res;
    }

    compileUnit(unit: sol.SourceUnit): void {
        const [compilerVersion] = this.detectVersions(unit);
        const infer = this.getInfer(compilerVersion);

        for (const structDef of unit.getChildrenByType(sol.StructDefinition)) {
            const struct = this.compileStructDef(structDef, infer);
            this.globalScope.define(struct);
        }

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

            if (funCompile.canEmitBody()) {
                this.globalScope.define(funCompile.compile());
            }
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

        for (const constr of constrCompiler.compilePartialConstructors()) {
            this.globalScope.define(constr);
        }

        this.globalScope.define(constrCompiler.compileConstructor());

        this.emittedMethodMap.set(contract, new Map());

        const seenSigs = new Set<string>();

        for (const base of contract.vLinearizedBaseContracts) {
            for (const method of base.vFunctions) {
                // Handled separately in ConstructionCompiler
                if (method.isConstructor) {
                    continue;
                }

                const sig = infer.signature(method, this.abiVersion);

                if (seenSigs.has(sig)) {
                    continue;
                }

                seenSigs.add(sig);

                const funCompiler = new FunctionCompiler(
                    this.factory,
                    method,
                    this.globalScope,
                    this.solVersion,
                    this.abiVersion,
                    contract,
                    irContract
                );

                if (!funCompiler.canEmitBody()) {
                    continue;
                }

                const fun = funCompiler.compile();
                this.globalScope.define(fun);

                (this.emittedMethodMap.get(contract) as Map<string, ir.FunctionDefinition>).set(
                    sig,
                    fun
                );
            }
        }
    }

    compileMethodDispatch(
        contract: sol.ContractDefinition,
        solMethod: sol.FunctionDefinition,
        overridingImpls: OverridenImplsList
    ): ir.FunctionDefinition {
        const dispatchCompiler = new DispatchCompiler(
            this.factory,
            contract,
            solMethod,
            overridingImpls,
            this.globalScope,
            this.solVersion,
            this.abiVersion
        );

        return dispatchCompiler.compile();
    }

    getContractStruct(contract: sol.ContractDefinition, infer: sol.InferType): ir.StructDefinition {
        const name = `${contract.name}_${contract.id}`;

        const fields: Array<[string, ir.Type]> = [
            ["__address__", u160],
            ["__rtti__", u16]
        ];

        for (const base of contract.vLinearizedBaseContracts) {
            for (const decl of base.vStateVariables) {
                const solType = infer.variableDeclarationToTypeNode(decl);
                const irType = transpileType(solType, this.factory);

                fields.push([decl.name, irType]);
            }
        }

        const res = this.factory.structDefinition(new ASTSource(contract), [], [], name, fields);
        this.emittedStructMap.set(contract, res);
        return res;
    }

    private buildInheritMap(units: sol.SourceUnit[]): InheritMap {
        const res: InheritMap = new Map();

        for (const unit of units) {
            for (const contract of unit.vContracts) {
                for (const base of contract.vLinearizedBaseContracts) {
                    if (!res.has(base)) {
                        res.set(base, []);
                    }

                    (res.get(base) as sol.ContractDefinition[]).push(contract);
                }
            }
        }

        return res;
    }

    buildOverrideMap(inhMap: InheritMap): OverrideMap {
        // Map from contracts, to a map from function signatures to the list of overriding implementations
        const res: OverrideMap = new Map();

        for (const [contract, subContracts] of inhMap) {
            const unit = contract.vScope;
            const infer = this.getInfer(unit);
            const [, abiVersion] = this.versionMap.get(unit) as [string, sol.ABIEncoderVersion];

            const seenSigs = new Map<string, sol.FunctionDefinition>();

            const overridenImplMap: OverridenImplsMap = new Map();

            // Get all externally visible method signatures for contract, including inherited ones
            for (const base of contract.vLinearizedBaseContracts) {
                for (const method of base.vFunctions) {
                    // Ignore internal/private functions
                    if (!isExternallyVisible(method)) {
                        continue;
                    }

                    const sig = infer.signature(method, abiVersion);
                    // Ignore constructors, receive and fallback
                    if (sig === "" || sig === "receive" || sig === "fallback") {
                        continue;
                    }

                    seenSigs.set(sig, method);
                }
            }

            for (const [sig, method] of seenSigs) {
                const implementations: Array<[ir.StructDefinition, ir.FunctionDefinition]> = [];

                for (const subContract of subContracts) {
                    const irFun = (
                        this.emittedMethodMap.get(subContract) as Map<string, ir.FunctionDefinition>
                    ).get(sig);

                    if (irFun) {
                        implementations.push([
                            this.emittedStructMap.get(subContract) as ir.StructDefinition,
                            irFun
                        ]);
                    }

                    overridenImplMap.set(method, implementations);
                }
            }

            res.set(contract, overridenImplMap);
        }

        return res;
        /*
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

                    // We specialze all inherited methods to the sub-contract, even when it doesn't
                    // Explicitly override them.
                    overridingImplementations.push(subVtbl.get(sig) as sol.FunctionDefinition);
                }

                (res.get(contract) as Map<string, sol.FunctionDefinition[]>).set(
                    sig,
                    overridingImplementations
                );
            }
        }

        return res;
        */
    }
}
