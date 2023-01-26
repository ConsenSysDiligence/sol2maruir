import * as sol from "solc-typed-ast";

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
