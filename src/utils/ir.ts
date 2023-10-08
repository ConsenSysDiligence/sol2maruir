import * as ir from "maru-ir2";

export function isBytesType(t: ir.Type): t is ir.PointerType {
    return (
        t instanceof ir.PointerType &&
        t.toType instanceof ir.UserDefinedType &&
        t.toType.name === "ArrWithLen" &&
        t.toType.typeArgs.length === 1 &&
        t.toType.typeArgs[0] instanceof ir.IntType &&
        t.toType.typeArgs[0].nbits === 8
    );
}

export function isBytesLit(e: ir.Expression, eT: ir.Type): e is ir.Identifier {
    return (
        e instanceof ir.Identifier &&
        e.name.match(/_bytes_lit_[0-9]*/) !== null &&
        isBytesType(eT) &&
        eT.region instanceof ir.MemConstant
    );
}

export function isStrLit(e: ir.Expression, eT: ir.Type): e is ir.Identifier {
    return (
        e instanceof ir.Identifier &&
        e.name.match(/_str_lit_[0-9]*/) !== null &&
        isBytesType(eT) &&
        eT.region instanceof ir.MemConstant
    );
}

export function typeContainsMapping(t: ir.Type): boolean {
    let hasMapping = t instanceof ir.MapType;
    ir.walk(t, (subT) => (hasMapping ||= subT instanceof ir.MapType));

    return hasMapping;
}
