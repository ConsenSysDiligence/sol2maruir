import * as sol from "solc-typed-ast";
import { topoSort } from "./func";

/**
 * Detect inheritance specifier-style and modifier-style invocation arguments
 * of contract definition and creates corresponding entries in map.
 * Recursively descends for detection in base contract definitions too.
 *
 * @param contract  contract definition to detect args.
 * @param argsMap   mapping to collect corresponding arguments to call base constructors.
 */
export function grabInheritanceArgs(
    contract: sol.ContractDefinition,
    argsMap: Map<sol.ContractDefinition, sol.Expression[]>
): void {
    for (const inheritanceSpecifier of contract.vInheritanceSpecifiers) {
        const base = inheritanceSpecifier.vBaseType
            .vReferencedDeclaration as sol.ContractDefinition;

        grabInheritanceArgs(base, argsMap);

        if (inheritanceSpecifier.vArguments.length) {
            /**
             * Overwrite here is just fine as Solc 0.4+ does the same (with warning).
             * Solc 0.5+ will not compile at all.
             */
            argsMap.set(base, inheritanceSpecifier.vArguments);
        }
    }

    if (contract.vConstructor) {
        for (const invocation of contract.vConstructor.vModifiers) {
            const base = invocation.vModifier;

            /**
             * Prior to Solidity 0.6.0, it was allowed to specify current contract
             * as modifier to it's own constructor. Compiler ignores the call in such case.
             *
             * Since Solidity 0.6.0 such use is forbidden.
             */
            if (base instanceof sol.ContractDefinition && base !== contract) {
                grabInheritanceArgs(base, argsMap);

                /**
                 * Modifier-style invocations are taking precedence over
                 * inheritance specifier-style calls for Solc 0.4.21 and lower.
                 *
                 * Solc 0.4.22 and further will not compile at all.
                 *
                 * @see https://solidity.readthedocs.io/en/v0.4.21/contracts.html#arguments-for-base-constructors
                 * @see https://solidity.readthedocs.io/en/v0.4.22/contracts.html#arguments-for-base-constructors
                 */
                argsMap.set(base, invocation.vArguments);
            }
        }
    }
}

/**
 * Given a `contract` return an iterable over all solidity "callable"
 * declarations for the contract, for which we need to emit an IR function. This
 * includes methods and public getters of this contract, as well as methods and
 * public getters inherited from base contracts.
 */
export function* getContractCallables(
    contract: sol.ContractDefinition,
    infer: sol.InferType
): Iterable<sol.FunctionDefinition | sol.VariableDeclaration> {
    const seenSigs = new Set<string>();

    for (const base of contract.vLinearizedBaseContracts) {
        for (const method of base.vFunctions) {
            // Skip constructors, receive and fallback functions
            if (method.kind === sol.FunctionKind.Constructor) {
                continue;
            }

            const sig = infer.signature(method);

            if (seenSigs.has(sig)) {
                continue;
            }

            seenSigs.add(sig);

            yield method;
        }

        for (const sVar of base.vStateVariables) {
            if (sVar.visibility !== sol.StateVariableVisibility.Public) {
                continue;
            }

            const sig = infer.signature(sVar);

            if (seenSigs.has(sig)) {
                continue;
            }

            seenSigs.add(sig);
            yield sVar;
        }
    }
}

export function isExternallyCallable(
    callable: sol.FunctionDefinition | sol.VariableDeclaration
): boolean {
    if (callable instanceof sol.FunctionDefinition) {
        return isExternallyVisible(callable);
    }

    return callable.visibility === sol.StateVariableVisibility.Public;
}

export function isExternallyVisible(fun: sol.FunctionDefinition): boolean {
    return [
        sol.FunctionVisibility.Default,
        sol.FunctionVisibility.Public,
        sol.FunctionVisibility.External
    ].includes(fun.visibility);
}

export function isContractDeployable(c: sol.ContractDefinition): boolean {
    return (
        (c.kind === sol.ContractKind.Contract || c.kind === sol.ContractKind.Library) && !c.abstract
    );
}

export function isFileConstant(v: sol.ASTNode): v is sol.VariableDeclaration {
    return v instanceof sol.VariableDeclaration && v.vScope instanceof sol.SourceUnit && v.constant;
}

/**
 * Sort units in topological order of imports
 */
export function sortUnits(units: sol.SourceUnit[]): sol.SourceUnit[] {
    const pred = new Map<sol.SourceUnit, Set<sol.SourceUnit>>();
    for (const unit of units) {
        for (const imp of unit.vImportDirectives) {
            let s = pred.get(imp.vScope);

            if (s == undefined) {
                s = new Set();
            }

            s.add(imp.vSourceUnit);

            pred.set(imp.vScope, s);
        }
    }

    const order: Array<[sol.SourceUnit, sol.SourceUnit]> = [];
    for (const [k, v] of pred) {
        for (const u of v) {
            order.push([u, k]);
        }
    }

    return topoSort(units, order);
}
