import * as ir from "maru-ir2";
import { BaseSrc } from "maru-ir2";
import { assert } from "solc-typed-ast";
import { IRTuple2, IRTupleType2 } from "../ir";
import { boolT } from "./typing";

/**
 * The ir node factory class is the only entry point for creating IR nodes.
 * It also contains the mapping from expressions -> types.
 */
export class IRFactory {
    private typeMap = new Map<ir.Expression, ir.Type>();

    typeOf(expr: ir.Expression): ir.Type {
        const res = this.typeMap.get(expr);

        assert(res !== undefined, `Missing type for {0}`, expr);

        return res;
    }

    binaryOperation(
        src: ir.BaseSrc,
        lExp: ir.Expression,
        op: ir.BinaryOperator,
        rExp: ir.Expression,
        typ: ir.Type
    ): ir.BinaryOperation {
        const res = new ir.BinaryOperation(src, lExp, op, rExp);
        this.typeMap.set(res, typ);
        return res;
    }

    unaryOperation(
        src: ir.BaseSrc,
        op: ir.UnaryOperator,
        subExp: ir.Expression,
        typ: ir.Type
    ): ir.UnaryOperation {
        const res = new ir.UnaryOperation(src, op, subExp);
        this.typeMap.set(res, typ);
        return res;
    }

    booleanLiteral(src: BaseSrc, val: boolean): ir.BooleanLiteral {
        const res = new ir.BooleanLiteral(src, val);
        this.typeMap.set(res, boolT);

        return res;
    }

    numberLiteral(src: BaseSrc, val: bigint, radix: number, type: ir.Type): ir.NumberLiteral {
        assert(type instanceof ir.IntType, `Unexpected type ${type.pp()} for number literal`);
        const res = new ir.NumberLiteral(src, val, radix, type);
        this.typeMap.set(res, type);

        return res;
    }

    globalVariable(
        src: ir.BaseSrc,
        name: string,
        type: ir.Type,
        initialVal: ir.GlobalVarLiteral
    ): ir.GlobalVariable {
        return new ir.GlobalVariable(src, name, type, initialVal);
    }

    structLiteral(src: BaseSrc, fields: Array<[string, ir.GlobalVarLiteral]>): ir.StructLiteral {
        return new ir.StructLiteral(src, fields);
    }

    arrayLiteral(src: BaseSrc, values: ir.GlobalVarLiteral[]): ir.ArrayLiteral {
        return new ir.ArrayLiteral(src, values);
    }

    identifier(src: BaseSrc, name: string, type: ir.Type): ir.Identifier {
        const res = new ir.Identifier(src, name);
        this.typeMap.set(res, type);

        return res;
    }

    cast(src: BaseSrc, toType: ir.Type, expr: ir.Expression): ir.Cast {
        const res = new ir.Cast(src, toType, expr);
        this.typeMap.set(res, toType);

        return res;
    }

    tuple(src: BaseSrc, elements: Array<ir.Expression | null>, type: ir.Type): IRTuple2 {
        const res = new IRTuple2(src, elements);
        this.typeMap.set(res, type);

        return res;
    }

    functionDefinition(
        src: ir.BaseSrc,
        memoryParameters: ir.MemVariableDeclaration[],
        typeParameters: ir.TypeVariableDeclaration[],
        name: string,
        params: ir.VariableDeclaration[],
        locals: ir.VariableDeclaration[],
        returns: ir.Type[],
        body?: ir.CFG
    ): ir.FunctionDefinition {
        return new ir.FunctionDefinition(
            src,
            memoryParameters,
            typeParameters,
            name,
            params,
            locals,
            returns,
            body
        );
    }

    structDefinition(
        src: ir.BaseSrc,
        memoryParameters: ir.MemVariableDeclaration[],
        typeParameters: ir.TypeVariableDeclaration[],
        name: string,
        fields: Array<[string, ir.Type]>
    ): ir.StructDefinition {
        return new ir.StructDefinition(src, memoryParameters, typeParameters, name, fields);
    }

    variableDeclaration(src: ir.BaseSrc, name: string, type: ir.Type): ir.VariableDeclaration {
        return new ir.VariableDeclaration(src, name, type);
    }

    loadField(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        baseExpr: ir.Expression,
        member: string
    ): ir.LoadField {
        return new ir.LoadField(src, lhs, baseExpr, member);
    }

    storeField(
        src: ir.BaseSrc,
        baseExpr: ir.Expression,
        member: string,
        rhs: ir.Expression
    ): ir.StoreField {
        return new ir.StoreField(src, baseExpr, member, rhs);
    }

    loadIndex(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        baseExpr: ir.Expression,
        idxExpr: ir.Expression
    ): ir.LoadIndex {
        return new ir.LoadIndex(src, lhs, baseExpr, idxExpr);
    }

    storeIndex(
        src: ir.BaseSrc,
        baseExpr: ir.Expression,
        idxExpr: ir.Expression,
        rhs: ir.Expression
    ): ir.StoreIndex {
        return new ir.StoreIndex(src, baseExpr, idxExpr, rhs);
    }

    assignment(src: ir.BaseSrc, lhs: ir.Identifier, rhs: ir.Expression): ir.Assignment {
        return new ir.Assignment(src, lhs, rhs);
    }

    allocArray(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        type: ir.Type,
        size: ir.Expression,
        mem: ir.MemDesc
    ): ir.AllocArray {
        return new ir.AllocArray(src, lhs, type, size, mem);
    }

    allocStruct(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        type: ir.UserDefinedType,
        mem: ir.MemDesc
    ): ir.AllocStruct {
        return new ir.AllocStruct(src, lhs, type, mem);
    }

    functionCall(
        src: ir.BaseSrc,
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[]
    ): ir.FunctionCall {
        return new ir.FunctionCall(src, lhss, callee, memArgs, typeArgs, args);
    }

    transactionCall(
        src: ir.BaseSrc,
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[]
    ): ir.TransactionCall {
        return new ir.TransactionCall(src, lhss, callee, memArgs, typeArgs, args);
    }

    jump(src: ir.BaseSrc, label: string): ir.Jump {
        return new ir.Jump(src, label);
    }

    branch(
        src: ir.BaseSrc,
        condition: ir.Expression,
        trueLabel: string,
        falseLabel: string
    ): ir.Branch {
        return new ir.Branch(src, condition, trueLabel, falseLabel);
    }

    return(src: ir.BaseSrc, values: ir.Expression[]): ir.Return {
        return new ir.Return(src, values);
    }

    assert(src: ir.BaseSrc, cond: ir.Expression): ir.Assert {
        return new ir.Assert(src, cond);
    }

    // Types
    pointerType(
        src: ir.BaseSrc,
        toType: ir.Type,
        region: ir.MemIdentifier | ir.MemConstant
    ): ir.PointerType {
        return new ir.PointerType(src, toType, region);
    }

    arrayType(src: ir.BaseSrc, elType: ir.Type): ir.ArrayType {
        return new ir.ArrayType(src, elType);
    }

    userDefinedType(
        src: ir.BaseSrc,
        name: string,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[]
    ): ir.UserDefinedType {
        return new ir.UserDefinedType(src, name, memArgs, typeArgs);
    }

    intType(src: ir.BaseSrc, nbits: number, signed: boolean): ir.IntType {
        return new ir.IntType(src, nbits, signed);
    }

    boolType(src: ir.BaseSrc): ir.BoolType {
        return new ir.BoolType(src);
    }

    memConstant(src: ir.BaseSrc, name: string): ir.MemConstant {
        return new ir.MemConstant(src, name);
    }

    memVariableDeclaration(src: ir.BaseSrc, name: string): ir.MemVariableDeclaration {
        return new ir.MemVariableDeclaration(src, name);
    }

    memIdentifier(src: BaseSrc, name: string): ir.MemIdentifier {
        return new ir.MemIdentifier(src, name);
    }

    tupleType(src: ir.BaseSrc, elementTypes: Array<ir.Type | null>): IRTupleType2 {
        return new IRTupleType2(src, elementTypes);
    }

    abort(src: ir.BaseSrc): ir.Abort {
        return new ir.Abort(src);
    }
}
