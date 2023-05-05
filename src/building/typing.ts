import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { assert, ContractDefinition } from "solc-typed-ast";
import { MemDesc, noSrc, Scope } from "maru-ir2";
import { IRTupleType2 } from "../ir";
import { IRFactory } from "./factory";
import { getIRStructDefName } from "./resolving";

// @todo These consts are the only IR nodes that are not produced by the IRFactory
// For now this is not a problem, but we should fix this eventually.
export const boolT = new ir.BoolType(noSrc);
export const u8 = new ir.IntType(noSrc, 8, false);
export const u32 = new ir.IntType(noSrc, 32, false);
export const u16 = new ir.IntType(noSrc, 16, false);
export const u160 = new ir.IntType(noSrc, 160, false);
export const u160Addr = new ir.IntType(noSrc, 160, false);
u160Addr.md.set("sol_type", "address");

export const u256 = new ir.IntType(noSrc, 256, false);
export const i256 = new ir.IntType(noSrc, 256, true);
export const u8ArrExc = new ir.UserDefinedType(
    noSrc,
    "ArrWithLen",
    [new ir.MemConstant(noSrc, "exception")],
    [u8]
);
export const u8ArrMem = new ir.UserDefinedType(
    noSrc,
    "ArrWithLen",
    [new ir.MemConstant(noSrc, "memory")],
    [u8]
);
export const u8ArrCD = new ir.UserDefinedType(
    noSrc,
    "ArrWithLen",
    [new ir.MemConstant(noSrc, "calldata")],
    [u8]
);
export const u8ArrExcPtr = new ir.PointerType(
    noSrc,
    u8ArrExc,
    new ir.MemConstant(noSrc, "exception")
);
export const u8ArrMemPtr = new ir.PointerType(noSrc, u8ArrMem, new ir.MemConstant(noSrc, "memory"));
export const u8ArrCDPtr = new ir.PointerType(noSrc, u8ArrCD, new ir.MemConstant(noSrc, "calldata"));
export const noType = new IRTupleType2(noSrc, []);

export const blockT = new ir.UserDefinedType(noSrc, "Block", [], []);
export const blockPtrT = new ir.PointerType(noSrc, blockT, new ir.MemConstant(noSrc, "memory"));
export const msgT = new ir.UserDefinedType(noSrc, "Message", [], []);
export const msgPtrT = new ir.PointerType(noSrc, msgT, new ir.MemConstant(noSrc, "memory"));
export const balancesMapT = new ir.MapType(noSrc, u160, u256);
export const balancesMapPtrT = new ir.PointerType(
    noSrc,
    balancesMapT,
    new ir.MemConstant(noSrc, "storage")
);

export function transpileType(type: sol.TypeNode, factory: IRFactory, ptrLoc?: MemDesc): ir.Type {
    let res: ir.Type | undefined;

    if (type instanceof sol.IntLiteralType) {
        assert(type.literal !== undefined, `Missing literal in type {0}`, type);

        const smallestT = sol.smallestFittingType(type.literal);

        assert(smallestT !== undefined, `Can't fit literal {0} in a type`, type.literal);

        res = transpileType(smallestT, factory, ptrLoc);
    } else if (type instanceof sol.IntType) {
        res = factory.intType(ir.noSrc, type.nBits === undefined ? 256 : type.nBits, type.signed);
    } else if (type instanceof sol.BoolType) {
        res = factory.boolType(ir.noSrc);
    } else if (type instanceof sol.AddressType) {
        res = factory.intType(ir.noSrc, 160, false);
    } else if (type instanceof sol.FixedBytesType) {
        res = factory.intType(ir.noSrc, type.size * 8, false);
    } else if (type instanceof sol.UserDefinedType) {
        const def = type.definition;

        if (def instanceof sol.EnumDefinition) {
            assert(def.vMembers.length < 256, `Enum {0} too big`, type.name);

            res = factory.intType(ir.noSrc, 8, false);
        } else if (def instanceof sol.StructDefinition) {
            assert(ptrLoc !== undefined, `Expected ptrLoc for sol struct`);

            res = factory.userDefinedType(ir.noSrc, getIRStructDefName(def), [ptrLoc], []);
        } else if (def instanceof ContractDefinition) {
            res = u160Addr;
        }
    } else if (type instanceof sol.PointerType) {
        const loc = ptrLoc ? ptrLoc : factory.memConstant(ir.noSrc, type.location);

        if (
            type.to instanceof sol.StringType ||
            type.to instanceof sol.BytesType ||
            type.to instanceof sol.ArrayType ||
            type.to instanceof sol.UserDefinedType
        ) {
            res = factory.pointerType(ir.noSrc, transpileType(type.to, factory, loc), loc);
        } else if (type.to instanceof sol.MappingType) {
            const keyT = transpileType(type.to.keyType, factory, ptrLoc);
            const valT = transpileType(type.to.valueType, factory, ptrLoc);

            res = factory.pointerType(ir.noSrc, factory.mapType(ir.noSrc, keyT, valT), loc);
        }
    } else if (type instanceof sol.TupleType) {
        const elements: Array<ir.Type | null> = [];

        for (let i = 0; i < type.elements.length; i++) {
            const elT = type.elements[i];
            let irT: ir.Type | null;

            try {
                irT = elT === null ? null : transpileType(elT, factory);
            } catch (e) {
                // We allow transpileType to crash here as tuples can contain
                // things that are not typeable (e.g. an elementary type name
                // expression like uint), as long as its not assigned or used anywhere
                irT = null;
            }

            elements.push(irT);
        }

        res = factory.tupleType(ir.noSrc, elements);
    } else if (type instanceof sol.StringType || type instanceof sol.BytesType) {
        res = factory.userDefinedType(
            ir.noSrc,
            "ArrWithLen",
            [ptrLoc ? ptrLoc : factory.memConstant(ir.noSrc, "memory")],
            [u8]
        );
    } else if (type instanceof sol.ArrayType) {
        const loc = ptrLoc ? ptrLoc : factory.memConstant(ir.noSrc, "memory");

        res = factory.userDefinedType(
            ir.noSrc,
            "ArrWithLen",
            [loc],
            [transpileType(type.elementT, factory, loc)]
        );

        if (type.size !== undefined) {
            res.md.set("size", type.size);
        }
    }

    assert(res !== undefined, "Unable to transpile type {0} ({1})", type, type.constructor.name);

    res.md.set("sol_type", type.pp());

    return res;
}

export function isAddressType(t: ir.Type): t is ir.IntType {
    const solType = t.md.get("sol_type");
    return (
        t instanceof ir.IntType &&
        (["address", "address payable", "payable"].includes(solType) ||
            (solType !== undefined && solType.startsWith("contract ")))
    );
}

/**
 * Returns true IFF all memory descriptors in a given type are concrete
 */
export function isConcreteMemT(t: ir.Type, scope: Scope): boolean {
    const memDescs = collectMemDesc(t, scope);

    for (const desc of memDescs) {
        // Not fully concrete.
        if (desc instanceof ir.MemIdentifier) {
            return false;
        }
    }

    return true;
}

/**
 * Collect all memory descriptors that appear in t (after concretizing any polymorphic types)
 * @param t
 */
function collectMemDesc(t: ir.Type, scope: Scope): MemDesc[] {
    const res: MemDesc[] = [];

    ir.walkType(
        t,
        (typ) => {
            if (typ instanceof ir.PointerType) {
                res.push(typ.region);
                return;
            }

            if (typ instanceof ir.UserDefinedType) {
                res.push(...typ.memArgs);
                return;
            }
        },
        scope
    );

    return res;
}

/**
 * Returns true IFF the type t is primitive, or lives in a single memory
 * @param t
 */
export function isSingleMem(t: ir.Type, scope: Scope): boolean {
    const memDescs = collectMemDesc(t, scope);
    const mems = new Set<string>();

    for (const desc of memDescs) {
        // Not fully concrete.
        if (desc instanceof ir.MemIdentifier) {
            return false;
        }

        mems.add(desc.name);
    }

    return mems.size <= 1;
}

/**
 * Given a type, return a new type with  all memory region references in the original substituted to `mem`.
 */
export function convertToMem(typ: ir.Type, mem: string, factory: IRFactory): ir.Type {
    if (typ instanceof ir.PointerType) {
        return factory.pointerType(
            typ.src,
            convertToMem(typ.toType, mem, factory),
            factory.memConstant(noSrc, mem)
        );
    }

    if (typ instanceof ir.ArrayType) {
        return factory.arrayType(typ.src, convertToMem(typ.baseType, mem, factory));
    }

    if (typ instanceof ir.UserDefinedType) {
        sol.assert(typ.memArgs.length === 1, `Can't template type {0} with multiple mem args`, typ);

        return factory.userDefinedType(
            typ.src,
            typ.name,
            typ.memArgs.map(() => factory.memConstant(noSrc, mem)),
            typ.typeArgs.map((tArg) => convertToMem(tArg, mem, factory))
        );
    }

    return typ;
}
