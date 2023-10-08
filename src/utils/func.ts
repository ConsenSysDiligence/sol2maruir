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

/**
 * Given a list of T's `things` and a partial ordering between them `order` return
 * a topologically sorted version of `things`. For any pair `[a,b]` in `order` we assume
 * that `a` has to come before `b`.
 * TODO: This is duplicated with scribble. Remove, or re-use a 3rd party implementation
 */
export function topoSort<T>(things: T[], order: Array<[T, T]>): T[] {
    const successors = new Map<T, Set<T>>();
    const nPreds = new Map<T, number>();

    // Initialize datastructures
    for (const thing of things) {
        nPreds.set(thing, 0);
        successors.set(thing, new Set());
    }

    // Populate nPreds and successors according to the partial order `order`
    for (const [a, b] of order) {
        nPreds.set(b, (nPreds.get(b) as number) + 1);
        (successors.get(a) as Set<T>).add(b);
    }

    // Compute the initial roots and add them to res
    const res: T[] = [];

    for (const thing of things) {
        if ((nPreds.get(thing) as number) === 0) {
            res.push(thing);
        }
    }

    assert(res.length > 0, "Order is not a proper partial order");

    let i = 0;

    // Add nodes to the order until all are added
    while (res.length < things.length) {
        const curLength = res.length;

        // For every newly added node N from last iteration ([i...curLength-1]),
        // and for all successors S of N, reduce nPreds[S]. If nPreds[S] == 0 add to res.
        for (; i < curLength; i++) {
            for (const successor of successors.get(res[i]) as Set<T>) {
                const newCount = (nPreds.get(successor) as number) - 1;

                nPreds.set(successor, newCount);

                if (newCount === 0) {
                    res.push(successor);
                }
            }
        }

        assert(
            res.length > curLength,
            "Order is not a valid proper order. Topo sort stalled at {1} out of {2}",
            res.length,
            things.length
        );
    }

    return res;
}
