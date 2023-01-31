import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { assert, ContractDefinition } from "solc-typed-ast";
import { MemDesc, noSrc } from "maru-ir2";
import { IRTupleType2 } from "../ir";
import { IRFactory } from "./factory";
import { getIRStructDefName } from "./resolving";

// @todo These consts are the only IR nodes that are not produced by the IRFactory
// For now this is not a problem, but we should fix this eventually.
export const boolT = new ir.BoolType(noSrc);
export const u8 = new ir.IntType(noSrc, 8, false);
export const u16 = new ir.IntType(noSrc, 8, false);
export const u160 = new ir.IntType(noSrc, 160, false);
export const u256 = new ir.IntType(noSrc, 256, false);
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
export const u8ArrExcPtr = new ir.PointerType(
    noSrc,
    u8ArrExc,
    new ir.MemConstant(noSrc, "exception")
);
export const u8ArrMemPtr = new ir.PointerType(noSrc, u8ArrMem, new ir.MemConstant(noSrc, "memory"));
export const noType = new IRTupleType2(noSrc, []);

export const blockT = new ir.UserDefinedType(noSrc, "Block", [], []);
export const blockPtrT = new ir.PointerType(noSrc, blockT, new ir.MemConstant(noSrc, "memory"));
export const msgT = new ir.UserDefinedType(noSrc, "Message", [], []);
export const msgPtrT = new ir.PointerType(noSrc, msgT, new ir.MemConstant(noSrc, "memory"));

export function transpileType(type: sol.TypeNode, factory: IRFactory, ptrLoc?: MemDesc): ir.Type {
    if (type instanceof sol.IntType) {
        return factory.intType(ir.noSrc, type.nBits === undefined ? 256 : type.nBits, type.signed);
    }

    if (type instanceof sol.BoolType) {
        return factory.boolType(ir.noSrc);
    }

    if (type instanceof sol.AddressType) {
        return factory.intType(ir.noSrc, 160, false);
    }

    if (type instanceof sol.FixedBytesType) {
        return factory.intType(ir.noSrc, type.size * 8, false);
    }

    if (type instanceof sol.MappingType) {
        throw new Error(`NYI Mappings!`);
    }

    if (type instanceof sol.UserDefinedType) {
        const def = type.definition;

        if (def instanceof sol.EnumDefinition) {
            assert(def.vMembers.length < 256, `Enum {0} too big`, type.name);
            return factory.intType(ir.noSrc, 8, false);
        }

        if (def instanceof sol.StructDefinition) {
            assert(ptrLoc !== undefined, `Expected ptrLoc for sol struct`);
            return factory.userDefinedType(ir.noSrc, getIRStructDefName(def), [ptrLoc], []);
        }

        if (def instanceof ContractDefinition) {
            return factory.intType(ir.noSrc, 160, false);
        }
    }

    if (type instanceof sol.PointerType) {
        const loc = ptrLoc ? ptrLoc : factory.memConstant(ir.noSrc, type.location);

        if (type.to instanceof sol.StringType || type.to instanceof sol.BytesType) {
            return factory.pointerType(
                ir.noSrc,
                factory.userDefinedType(ir.noSrc, "ArrWithLen", [loc], [u8]),
                loc
            );
        }

        if (type.to instanceof sol.ArrayType) {
            return factory.pointerType(
                ir.noSrc,
                factory.userDefinedType(
                    noSrc,
                    "ArrWithLen",
                    [loc],
                    [transpileType(type.to.elementT, factory, loc)]
                ),
                loc
            );
        }

        if (type.to instanceof sol.UserDefinedType) {
            return factory.pointerType(ir.noSrc, transpileType(type.to, factory, loc), loc);
        }
    }

    if (type instanceof sol.TupleType) {
        return factory.tupleType(
            ir.noSrc,
            type.elements.map((solT) => transpileType(solT, factory))
        );
    }

    assert(false, "Unable to transpile type {0} ({1})", type, type.constructor.name);
}
