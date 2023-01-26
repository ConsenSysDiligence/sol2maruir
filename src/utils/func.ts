import { assert } from "solc-typed-ast";

export function isPrimitive(a: any): boolean {
    return (
        typeof a === "bigint" ||
        typeof a === "boolean" ||
        typeof a === "number" ||
        typeof a === "string" ||
        a === undefined ||
        a === null
    );
}

/**
 * Given a collection of `T`'s `args` assert that there is exactly 1 `T` in `args` and return it.
 *
 * @param args      collection that should contain a single `T`
 * @param message   optional error message
 * @param details   values for optional error message placeholders
 */
export function single<T>(args: T[], message?: string, ...details: any[]): T {
    if (message === undefined) {
        message = "Expected a single entry, not {0}: {1}";
        details = [args.length, args];
    }

    assert(args.length === 1, message, ...details);

    return args[0];
}

/**
 * Given a `v` of type `T` and a number `n` return an array with `n` copies of `v`.
 *
 * @param v     value to copy
 * @param n     number of times to copy
 */
export function repeat<T>(v: T, n: number): T[] {
    const res: T[] = [];

    for (let i = 0; i < n; i++) {
        res.push(v);
    }

    return res;
}
