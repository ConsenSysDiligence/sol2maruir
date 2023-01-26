import {
    assert,
    ContractDefinition,
    ContractKind,
    EventDefinition,
    FunctionDefinition,
    FunctionKind,
    InferType,
    ModifierDefinition,
    resolve,
    SourceUnit,
    VariableDeclaration
} from "solc-typed-ast";
import { ABIEncoderVersion } from "solc-typed-ast/dist/types/abi";

export type FunctionScope = ContractDefinition | SourceUnit;
/**
 * Given a function `fun` and a contract definition scope `scope` (where `scope` inherits from `fun.vScope`), check
 * if `scope` overides a virtual modifier of `fun`.
 *
 * @param fun - function to check
 * @param scope - scope in which to check if `fun` has an overriden modifier
 */
export function funHasOverridenModifierInScope(
    fun: FunctionDefinition,
    scope: ContractDefinition
): boolean {
    const funVirtualModifierNames: Set<string> = new Set(
        fun.vModifiers
            .filter(
                (modInv) =>
                    modInv.vModifier instanceof ModifierDefinition && modInv.vModifier.virtual
            )
            .map((modInv) => modInv.vModifier.name)
    );

    /**
     * Its sufficient to check if scope defines an overriding modifer with a
     * name same as one of the modifiers to fun (assuming `scope` subclasses
     * from `fun.vScope`). This is so since in multiple inheritance, if we have
     * multiple modifiers with the same name in parent contracts the child
     * needs to override ALL of them.
     */
    for (const scopeMod of scope.vModifiers) {
        if (
            scopeMod.vOverrideSpecifier !== undefined &&
            scopeMod.vBody !== undefined &&
            funVirtualModifierNames.has(scopeMod.name)
        ) {
            return true;
        }
    }

    return false;
}

/**
 * Given a raw function `fun` and a C3-linearized list of bases `bases`, find
 * the most derived (i.e. first in the C3 order) contract in `bases` such that
 * all of the virtual modifiers of `fun` are completely resolved.
 *
 * Note: `bases` MUST include a single contract inheriting from ALL at the start!
 *
 * @param fun - raw function
 * @param bases - list of bases in C3-linearized order
 */
export function getMDCModifierScope(
    fun: FunctionDefinition,
    bases: readonly ContractDefinition[],
    infer: InferType
): ContractDefinition {
    assert(
        fun.vScope instanceof ContractDefinition,
        "getMDCModifierScope doesn't apply to free functions."
    );

    // Compute the virtual modifiers of `fun`
    const funVirtualModifiers: ModifierDefinition[] = fun.vModifiers
        .filter(
            (modInv) => modInv.vModifier instanceof ModifierDefinition && modInv.vModifier.virtual
        )
        .map((modInv) => modInv.vModifier as ModifierDefinition);

    // No virtual modifiers - just return the function's scope.
    if (funVirtualModifiers.length === 0) {
        return fun.vScope;
    }

    // For each virtual modifier of `fun` compute the most resolved contract in `bases` that overrides it.
    const mostResolved = new Set(
        funVirtualModifiers.map(
            (modDef) => (resolve(bases[0], modDef, infer) as ModifierDefinition).vScope
        )
    );

    let mdc: ContractDefinition | undefined = undefined;

    // The most-derived contract for all of the virtual modifiers of `fun` is the
    // left-most contract in `mostResolved` in the C3-linearized order.
    // So walk bases backwards until we have seen all of the contracts in `mostResolved`.
    for (let i = bases.length - 1; i >= 0; i--) {
        mostResolved.delete(bases[i]);
        if (mostResolved.size === 0) {
            mdc = bases[i];
            break;
        }
    }

    assert(
        mdc !== undefined,
        "Couldn't determine MDC modifier scope for {0} in bases {1}",
        fun.name,
        bases.map((b) => b.name).join(",")
    );

    // Finally its possible that `fun` is declared below `mdc`. In that case we need to return `fun.vScope`.
    if (bases.indexOf(mdc) >= bases.indexOf(fun.vScope as ContractDefinition)) {
        return fun.vScope;
    }

    return mdc;
}

/**
 * Given a raw function definition and scope in which its referenced, return its desugared name's scope.
 * Due to virtual modifiers we may need to specialize a parent function in a child contract that
 * overrides a virtual modifier. E.g.:
 *
 *   A: modifier M virtual {...}, function foo() M {}
 *   |
 *   B: modifer M overrides {...}
 *   |
 *   C:
 *
 * When calling resolveDesugaredFunScope(A.foo, C) we would expect to get B as a scope, since we need to emit
 * a specialized version of A.foo inside B, due to the overriden modifier M.
 *
 * @param f - function definition to resolve.
 * @param scope - scope in which the function definition is referenced.
 */
export function resolveDesugaredFunModifierScope(
    f: FunctionDefinition,
    scope: FunctionScope,
    infer: InferType
): FunctionScope {
    assert(
        f.kind !== FunctionKind.Constructor,
        "Use getResolvedConstructorName/getResolvedPartialConstructorName for constructors."
    );

    const definingScope = f.vScope;

    // Free functions don't get a class prefix
    if (definingScope instanceof SourceUnit) {
        return definingScope;
    }

    // Library functions can't be overridden (libraries don't support inheritance)
    if (definingScope.kind === ContractKind.Library) {
        return definingScope;
    }

    /**
     * At this point this must be a normal virtual function either in the current contract or
     * inherited from a parent contract.
     */
    assert(scope instanceof ContractDefinition, ``);

    // Case 1. A function defined in the current contract - just the current contract
    if (definingScope === scope) {
        return definingScope;
    }

    const bases = scope.vLinearizedBaseContracts;

    return getMDCModifierScope(f, bases, infer);
}

/**
 * Given a raw function definition and scope in which its referenced, return its desugared name.
 * There are several things to take into account:
 * 
 * 1. Overloading. We may have functions with the same name and different signatures. For those we append the 
 * hash of the canonical signature to the name of the low-level function. E.g.
 * 
 * contract A {
 *   function foo(uint x) ...
 *   function foo(uint x, uint y) ...
 * }
 * 
 * Would result in 2 different low-level functions:
 *      A_foo_<hash1>
 *      A_foo_<hash2>
  
 * Where <hash1> and <hash2> are the canonical hashes of the original functions.
 *
 * 2. Virtual modifiers. Due to virtual modifiers we may need to specialize a parent function in a child contract that
 * overrides a virtual modifier. E.g.:
 * 
 *   A: modifier M virtual {...}, function foo() M {}
 *   |
 *   B: modifer M overrides {...}
 *   |
 *   C:
 * 
 * When calling getDesugaredFunName(A.foo, C) we would expect to get A_in_B_foo_<hash> as a name, since we need to emit
 * a specialized version of A.foo inside B, due to the overriden modifier M.
 * 
 * 3. Free functions - with free functions we just need to worry about overriding.
 * 
 * @todo - what about free functions from 2 files with the same names and args, that are imported and renamed? 
 * 
 * @param f - function definition to resolve.
 * @param scope - scope in which the function definition is referenced.
 */
export function getDesugaredFunName(
    f: FunctionDefinition,
    scope: FunctionScope,
    abiEncoderVersion: ABIEncoderVersion,
    infer: InferType
): string {
    assert(
        f.kind !== FunctionKind.Constructor,
        "Use getResolvedConstructorName/getResolvedPartialConstructorName for constructors."
    );

    const definingScope = f.vScope;
    let overloadingSuffix: string;

    if (f.kind === FunctionKind.Fallback) {
        overloadingSuffix = "fallback";
    } else if (f.kind === FunctionKind.Receive) {
        overloadingSuffix = "receive";
    } else {
        overloadingSuffix = `${f.name}_${infer.signatureHash(f, abiEncoderVersion)}`;
    }

    // Free functions don't get a class prefix
    if (definingScope instanceof SourceUnit) {
        return overloadingSuffix;
    }

    // Library functions can't be overridden (libraries don't support inheritance)
    if (definingScope.kind === ContractKind.Library) {
        return `${definingScope.name}_${overloadingSuffix}`;
    }

    /**
     * At this point this must be a normal virtual function either in the current contract or
     * inherited from a parent contract.
     */
    assert(scope instanceof ContractDefinition, ``);

    return `${scope.name}_${overloadingSuffix}`;
}

/**
 * Given a raw event `evt` return the desugared event name.
 *
 * Events follow a simple naming logic - <defining contract>_<event name>_<canonical hash>
 * @param evt - raw event
 */
export function getDesugaredEventName(
    evt: EventDefinition,
    infer: InferType,
    abiEncoderVersion: ABIEncoderVersion
): string {
    return `${evt.vScope.name}_${evt.name}_${infer.signatureHash(evt, abiEncoderVersion)}`;
}

/**
 * Given a raw contract definition `contract` return the desugared constructor name.
 *
 * Constructors follow a simple naming logic - <defining contract>_constructor. Note that
 * constructors are only ever invoked by `new` statements.
 *
 * @param contract - raw contract definition
 *
 * @todo what if we have 2 contracts in 2 unrelated files with the same name? Would we ever need to distinguish them?
 */
export function getDesugaredConstructorName(contract: ContractDefinition): string {
    return `${contract.name}_constructor`;
}

/**
 * Given a raw contract definition `contract` return the desugared partial constructor name.
 *
 * Partial constructors follow a simple naming logic:
 * 1) If we are a partial constructor for our own class then - <defining contract>_partial_constructor.
 * 2) If we are a partial constructor for class A, specialized in a child class B, then its A_in_B_partial_constructor
 *
 * @param contract - raw contract definition
 *
 * @todo if we optimize contract_builder.ts to only emit specialized partial constructors when we have virtual modifier overriding then
 *  fix this function too.
 * @todo what if we have 2 contracts in 2 unrelated files with the same name? Would we ever need to distinguish them?
 */
export function getDesugaredPartialConstructorName(
    contract: ContractDefinition,
    scope: ContractDefinition
): string {
    if (contract !== scope) {
        // `contract` defines a constructor, with virtual modifiers, that are overriden in scope.
        // Need to specialize the partial constructor.
        return `${contract.name}_in_${scope.name}_partial_constructor`;
    }

    return `${contract.name}_partial_constructor`;
}

/// @todo (dimo): remove this eventually. Code is duplicated in builder.getVarName
export function getDesugaredGlobalVarName(v: VariableDeclaration): string {
    return `${v.name}_${v.id}`;
}

export function getDispatchName(
    contract: ContractDefinition,
    fun: FunctionDefinition,
    infer: InferType,
    abiVersion: ABIEncoderVersion
): string {
    return `${contract.name}_${fun.name}_${infer.signatureHash(fun, abiVersion)}_dispatch`;
}
