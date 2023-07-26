import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { ASTSource } from "../ir/source";
import {
    getContractCallables,
    isContractDeployable,
    isExternallyCallable,
    isExternallyVisible,
    UIDGenerator
} from "../utils";
import { ConstructorCompiler } from "./constructor_compiler";
import { MethodDispatchCompiler } from "./method_dispatch_compiler";
import { IRFactory } from "./factory";
import { FunctionCompiler } from "./function_compiler";
import { GetterCompiler } from "./getter_compiler";
import { compileGlobalVarInitializer } from "./literal_compiler";
import { MsgBuilderCompiler } from "./msg_builder_compiler";
import { preamble } from "./preamble";
import { getDesugaredGlobalVarName, getIRStructDefName } from "./resolving";
import { transpileType, u16, u160Addr } from "./typing";
import { MsgDecoderCompiler } from "./msg_decoder_compiler";
import { ContractDispatchCompiler } from "./contract_dispatch_compiler";
import { RootDispatchCompiler } from "./root_dispatch_compiler";

type InheritMap = Map<sol.ContractDefinition, sol.ContractDefinition[]>;

type OverridenImplsList = Array<
    [ir.StructDefinition, ir.FunctionDefinition | ir.VariableDeclaration]
>;
type OverridenImplsMap = Map<sol.FunctionDefinition | sol.VariableDeclaration, OverridenImplsList>;
type OverrideMap = Map<sol.ContractDefinition, OverridenImplsMap>;

export class UnitCompiler {
    public readonly globalScope: ir.Scope;

    readonly inference: sol.InferType;
    readonly factory = new IRFactory();
    readonly globalUid = new UIDGenerator();

    private emittedStructMap = new Map<sol.ContractDefinition, ir.StructDefinition>();
    private emittedMethodMap = new Map<
        sol.ContractDefinition,
        Map<string, ir.FunctionDefinition>
    >();

    constructor(private readonly solVersion: string) {
        this.globalScope = new ir.Scope();
        this.inference = new sol.InferType(solVersion);
    }

    private detectAbiEncoderVersion(unit: sol.SourceUnit): sol.ABIEncoderVersion {
        return sol.getABIEncoderVersion(unit, this.solVersion);
    }

    globalDefine(def: ir.FunctionDefinition | ir.StructDefinition | ir.GlobalVariable): void {
        if (def instanceof ir.FunctionDefinition) {
            this.globalScope.makeFunScope(def);
        } else if (def instanceof ir.StructDefinition) {
            this.globalScope.makeStructScope(def);
        }

        this.globalScope.define(def);
    }

    compile(units: sol.SourceUnit[]): Iterable<ir.Definition> {
        for (const def of preamble) {
            this.globalDefine(
                def as ir.FunctionDefinition | ir.StructDefinition | ir.GlobalVariable
            );
        }

        for (const unit of units) {
            this.compileUnit(unit);
        }

        const inheritMap = this.buildInheritMap(units);
        const overrideMap = this.buildOverrideMap(inheritMap);

        for (const [contract, methodOverrideMap] of overrideMap) {
            const abiVersion = this.detectAbiEncoderVersion(contract.vScope);

            if (isContractDeployable(contract)) {
                this.globalDefine(this.compileContractDispatch(contract, abiVersion));
            }

            for (const [methodOrVar, overridingImpls] of methodOverrideMap) {
                this.globalDefine(
                    this.compileMethodDispatch(contract, methodOrVar, overridingImpls, abiVersion)
                );
            }
        }

        const infer = new sol.InferType(this.solVersion);
        for (const [contract] of overrideMap) {
            let emitDecodeMsgData: boolean;
            let emitDecodeRetData: boolean;
            const abiVersion = this.detectAbiEncoderVersion(contract.vScope);

            for (const callable of getContractCallables(contract, infer)) {
                if (!isExternallyCallable(callable)) {
                    continue;
                }

                if (callable instanceof sol.FunctionDefinition) {
                    if (callable.kind !== sol.FunctionKind.Function) {
                        continue;
                    }

                    emitDecodeMsgData = callable.vParameters.vParameters.length > 0;
                    emitDecodeRetData = callable.vReturnParameters.vParameters.length > 0;
                } else {
                    const [args] = infer.getterArgsAndReturn(callable);
                    emitDecodeMsgData = args.length > 0;
                    emitDecodeRetData = true;
                }

                this.globalDefine(this.compileBuildMsgData(contract, callable, abiVersion));
                this.globalDefine(this.compileBuildReturnData(contract, callable, abiVersion));

                if (emitDecodeMsgData) {
                    this.globalDefine(
                        this.compileDecodeMsgData(contract, callable, abiVersion, true)
                    );
                }

                if (emitDecodeRetData) {
                    this.globalDefine(
                        this.compileDecodeMsgData(contract, callable, abiVersion, false)
                    );
                }
            }
        }

        this.globalDefine(this.compileRootDispatch(units));

        return this.globalScope.definitions();
    }

    compileStructDef(def: sol.StructDefinition): ir.StructDefinition {
        const fields: Array<[string, ir.Type]> = [];

        for (const decl of def.vMembers) {
            fields.push([
                decl.name,
                transpileType(
                    this.inference.variableDeclarationToTypeNode(decl),
                    this.factory,
                    new ir.MemIdentifier(ir.noSrc, "M")
                )
            ]);
        }

        const name = getIRStructDefName(def);

        const res = this.factory.structDefinition(
            new ASTSource(def),
            [new ir.MemVariableDeclaration(ir.noSrc, "M")],
            [],
            name,
            fields
        );

        return res;
    }

    compileUnit(unit: sol.SourceUnit): void {
        const abiVersion = this.detectAbiEncoderVersion(unit);

        for (const structDef of unit.getChildrenByType(sol.StructDefinition)) {
            const struct = this.compileStructDef(structDef);

            this.globalDefine(struct);
        }

        for (const contract of unit.vContracts) {
            const struct = this.getContractStruct(contract);

            this.globalDefine(struct);
            this.compileContractMethods(contract, struct, abiVersion);
        }

        for (const fun of unit.vFunctions) {
            const funCompile = new FunctionCompiler(
                this.factory,
                fun,
                this.globalScope,
                this.globalUid,
                this.solVersion,
                abiVersion,
                unit
            );

            if (funCompile.canEmitBody()) {
                this.globalDefine(funCompile.compile());
            }
        }

        for (const globConst of unit.vVariables) {
            this.globalDefine(this.compileGlobalConst(globConst));
        }
    }

    compileGlobalConst(c: sol.VariableDeclaration): ir.GlobalVariable {
        const solT = this.inference.variableDeclarationToTypeNode(c);
        const irT = transpileType(solT, this.factory);

        sol.assert(c.vValue !== undefined, `NYI zero-intializing of global vars`);

        const initialValue = compileGlobalVarInitializer(c.vValue, this.inference, this.factory);

        return this.factory.globalVariable(
            new ASTSource(c),
            getDesugaredGlobalVarName(c),
            irT,
            initialValue
        );
    }

    compileContractGetters(
        contract: sol.ContractDefinition,
        irContract: ir.StructDefinition,
        abiVersion: sol.ABIEncoderVersion
    ): void {
        for (const sVar of contract.vStateVariables) {
            if (sVar.visibility !== sol.StateVariableVisibility.Public) {
                continue;
            }

            const compiler = new GetterCompiler(
                this.factory,
                sVar,
                this.globalScope,
                this.globalUid,
                this.solVersion,
                abiVersion,
                contract,
                irContract
            );

            const getter = compiler.compile();

            this.globalDefine(getter);
        }
    }

    compileContractMethods(
        contract: sol.ContractDefinition,
        irContract: ir.StructDefinition,
        abiVersion: sol.ABIEncoderVersion
    ): void {
        const constrCompiler = new ConstructorCompiler(
            this.factory,
            contract,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion,
            irContract
        );

        for (const constr of constrCompiler.compilePartialConstructors()) {
            this.globalDefine(constr);
        }

        this.globalDefine(constrCompiler.compileConstructor());

        this.emittedMethodMap.set(contract, new Map());

        const seenSigs = new Set<string>();

        for (const base of contract.vLinearizedBaseContracts) {
            for (const method of base.vFunctions) {
                // Handled separately in ConstructionCompiler
                if (method.isConstructor) {
                    continue;
                }

                let sig: string;
                if (method.kind === sol.FunctionKind.Function) {
                    sig = this.inference.signature(method);
                } else if (method.kind === sol.FunctionKind.Fallback) {
                    sig = "fallback";
                } else if (method.kind === sol.FunctionKind.Receive) {
                    sig = "receive";
                } else {
                    sol.assert(false, `Unexpected method kind {0}`, method.kind);
                }

                if (seenSigs.has(sig)) {
                    continue;
                }

                seenSigs.add(sig);

                const funCompiler = new FunctionCompiler(
                    this.factory,
                    method,
                    this.globalScope,
                    this.globalUid,
                    this.solVersion,
                    abiVersion,
                    contract,
                    irContract
                );

                if (!funCompiler.canEmitBody()) {
                    continue;
                }

                const fun = funCompiler.compile();
                this.globalDefine(fun);

                (this.emittedMethodMap.get(contract) as Map<string, ir.FunctionDefinition>).set(
                    sig,
                    fun
                );
            }

            // Emit all the public getters. Note that these can be overriden by normal methods potentially
            for (const sVar of base.vStateVariables) {
                if (sVar.visibility !== sol.StateVariableVisibility.Public) {
                    continue;
                }

                const sig = this.inference.signature(sVar);

                if (seenSigs.has(sig)) {
                    continue;
                }

                seenSigs.add(sig);

                const compiler = new GetterCompiler(
                    this.factory,
                    sVar,
                    this.globalScope,
                    this.globalUid,
                    this.solVersion,
                    abiVersion,
                    contract,
                    irContract
                );

                const getter = compiler.compile();

                this.globalDefine(getter);

                (this.emittedMethodMap.get(contract) as Map<string, ir.FunctionDefinition>).set(
                    sig,
                    getter
                );
            }
        }
    }

    compileContractDispatch(
        contract: sol.ContractDefinition,
        abiVersion: sol.ABIEncoderVersion
    ): ir.FunctionDefinition {
        const irContract = this.getContractStruct(contract);
        const dispatchCompiler = new ContractDispatchCompiler(
            this.factory,
            contract,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion,
            irContract
        );

        return dispatchCompiler.compile();
    }

    compileMethodDispatch(
        contract: sol.ContractDefinition,
        solMethodOrVar: sol.FunctionDefinition | sol.VariableDeclaration,
        overridingImpls: OverridenImplsList,
        abiVersion: sol.ABIEncoderVersion
    ): ir.FunctionDefinition {
        const dispatchCompiler = new MethodDispatchCompiler(
            this.factory,
            contract,
            solMethodOrVar,
            overridingImpls,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion
        );

        return dispatchCompiler.compile();
    }

    compileBuildMsgData(
        contract: sol.ContractDefinition,
        solMethodOrVar: sol.FunctionDefinition | sol.VariableDeclaration,
        abiVersion: sol.ABIEncoderVersion
    ): ir.FunctionDefinition {
        const dispatchCompiler = new MsgBuilderCompiler(
            this.factory,
            contract,
            solMethodOrVar,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion,
            true
        );

        return dispatchCompiler.compile();
    }

    compileBuildReturnData(
        contract: sol.ContractDefinition,
        solMethodOrVar: sol.FunctionDefinition | sol.VariableDeclaration,
        abiVersion: sol.ABIEncoderVersion
    ): ir.FunctionDefinition {
        const dispatchCompiler = new MsgBuilderCompiler(
            this.factory,
            contract,
            solMethodOrVar,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion,
            false
        );

        return dispatchCompiler.compile();
    }

    compileDecodeMsgData(
        contract: sol.ContractDefinition,
        solMethodOrVar: sol.FunctionDefinition | sol.VariableDeclaration,
        abiVersion: sol.ABIEncoderVersion,
        args: boolean
    ): ir.FunctionDefinition {
        const dispatchCompiler = new MsgDecoderCompiler(
            this.factory,
            contract,
            solMethodOrVar,
            this.globalScope,
            this.globalUid,
            this.solVersion,
            abiVersion,
            args
        );

        return dispatchCompiler.compile();
    }

    compileRootDispatch(units: sol.SourceUnit[]): ir.FunctionDefinition {
        const dispatchCompiler = new RootDispatchCompiler(
            this.factory,
            units,
            this,
            this.globalScope,
            this.globalUid,
            this.solVersion
        );

        return dispatchCompiler.compile();
    }

    getContractStruct(contract: sol.ContractDefinition): ir.StructDefinition {
        if (this.emittedStructMap.has(contract)) {
            return this.emittedStructMap.get(contract) as ir.StructDefinition;
        }

        const name = `${contract.name}_${contract.id}`;

        /// @todo Make sure these don't clash with other contract fields
        /// @todo Maybe move the EVM states in their own sub-struct?
        const fields: Array<[string, ir.Type]> = [
            ["__address__", u160Addr],
            ["__rtti__", u16]
        ];

        for (const base of contract.vLinearizedBaseContracts) {
            for (const decl of base.vStateVariables) {
                const solType = this.inference.variableDeclarationToTypeNode(decl);
                const irType = transpileType(solType, this.factory);

                fields.push([decl.name, irType]);
            }
        }

        const res = this.factory.structDefinition(new ASTSource(contract), [], [], name, fields);

        this.emittedStructMap.set(contract, res);

        return res;
    }

    buildInheritMap(units: sol.SourceUnit[]): InheritMap {
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
            const seenSigs = new Map<string, sol.FunctionDefinition | sol.VariableDeclaration>();

            const overridenImplMap: OverridenImplsMap = new Map();

            // Get all externally visible method signatures for contract, including inherited ones
            for (const base of contract.vLinearizedBaseContracts) {
                for (const method of base.vFunctions) {
                    // Ignore internal/private functions
                    if (!isExternallyVisible(method)) {
                        continue;
                    }

                    const sig = this.inference.signature(method);

                    // Ignore constructors, receive and fallback
                    if (sig === "" || sig === "receive" || sig === "fallback") {
                        continue;
                    }

                    seenSigs.set(sig, method);
                }

                for (const sVar of base.vStateVariables) {
                    if (sVar.visibility !== sol.StateVariableVisibility.Public) {
                        continue;
                    }

                    const sig = this.inference.signature(sVar);
                    seenSigs.set(sig, sVar);
                }
            }

            for (const [sig, methodOrVar] of seenSigs) {
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
                }

                overridenImplMap.set(methodOrVar, implementations);
            }

            res.set(contract, overridenImplMap);
        }

        return res;
    }
}
