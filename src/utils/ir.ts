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
