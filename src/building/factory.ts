import * as ir from "maru-ir2";
import { BaseSrc, noSrc } from "maru-ir2";
import * as sol from "solc-typed-ast";
import { assert } from "solc-typed-ast";
import {
    IRTuple2,
    IRTupleType2,
    SolArrayLiteral,
    SolDefinitionExpression,
    SolElementaryTypenameExpression
} from "../ir";
import { boolT, noType, u256, u8 } from "./typing";

/**
 * The ir node factory class is the only entry point for creating IR nodes.
 * It also contains the mapping from expressions -> types,
 * and node usage by other nodes (if it happends through factory methods).
 */
export class IRFactory {
    private typeMap = new Map<ir.Expression, ir.Type>();
    private usageSet = new Set<ir.Node>();

    /**
     * Checks that passed node **is used** (tracked by usage set)
     */
    isUsed(node: ir.Node): boolean {
        return this.usageSet.has(node);
    }

    /**
     * Returns node, that **is safe to use** as a child for other nodes:
     * - If node is not used, then it is marked as "used" and returned.
     * - If node is already used, then creates its copy, mark copy as used and return it.
     */
    use<T extends ir.Node>(input: T): T;
    use<T extends ir.Node>(input: T[]): T[];
    use<T extends ir.Node>(input: T | T[]): T | T[] {
        if (Array.isArray(input)) {
            return input.map((node) => this.use(node));
        }

        if (!this.isUsed(input)) {
            this.usageSet.add(input);
            return input;
        }

        const res = this.copy(input);

        for (const node of ir.traverse(input)) {
            this.usageSet.add(node);
        }

        return res;
    }

    /**
     * Creates a copy of passed node.
     * Associated types are preserved for copied node and its nested nodes.
     */
    copy<T extends ir.Node>(node: T): T {
        const copy = ir.copy(node);

        const nodes = [...ir.traverse(node)];
        const copies = [...ir.traverse(copy)];

        assert(
            nodes.length === copies.length,
            "Node copying: subtree elements amount is different ({0} and {1})",
            nodes.length,
            copies.length
        );

        for (let i = 0; i < nodes.length; i++) {
            const type = this.typeMap.get(nodes[i]);

            if (type) {
                this.typeMap.set(copies[i], type);
            }
        }

        return copy;
    }

    typeOf(expr: ir.Expression): ir.Type {
        const res = this.typeMap.get(expr);

        assert(res !== undefined, `Missing type for {0}`, expr);

        return res;
    }

    locationOf(arg: ir.Type | ir.Expression): ir.MemDesc {
        const t = arg instanceof ir.Type ? arg : this.typeOf(arg);

        assert(t instanceof ir.PointerType, `Expected pointer type not {0} for {1}`, t, arg);

        return t.region;
    }

    binaryOperation(
        src: ir.BaseSrc,
        lExp: ir.Expression,
        op: ir.BinaryOperator,
        rExp: ir.Expression,
        typ: ir.Type
    ): ir.BinaryOperation {
        const res = new ir.BinaryOperation(src, this.use(lExp), op, this.use(rExp));

        this.typeMap.set(res, typ);

        return res;
    }

    unaryOperation(
        src: ir.BaseSrc,
        op: ir.UnaryOperator,
        subExp: ir.Expression,
        typ: ir.Type
    ): ir.UnaryOperation {
        const res = new ir.UnaryOperation(src, op, this.use(subExp));

        this.typeMap.set(res, typ);

        return res;
    }

    booleanLiteral(src: BaseSrc, val: boolean): ir.BooleanLiteral {
        const res = new ir.BooleanLiteral(src, val);

        this.typeMap.set(res, boolT);

        return res;
    }

    numberLiteral(src: BaseSrc, val: bigint, radix: number, type: ir.Type): ir.NumberLiteral {
        assert(type instanceof ir.IntType, "Unexpected type {0} for number literal", type);

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

    funIdentifier(name: string): ir.Identifier {
        return this.identifier(noSrc, name, noType);
    }

    cast(src: BaseSrc, toType: ir.Type, expr: ir.Expression): ir.Cast {
        const res = new ir.Cast(src, toType, this.use(expr));

        this.typeMap.set(res, toType);

        return res;
    }

    tuple(src: BaseSrc, elements: Array<ir.Expression | null>, type: ir.Type): IRTuple2 {
        const res = new IRTuple2(
            src,
            elements.map((element) => (element ? this.use(element) : null))
        );

        this.typeMap.set(res, type);

        return res;
    }

    solArrayLiteral(
        src: BaseSrc,
        elements: Array<ir.Expression | null>,
        type: ir.Type
    ): SolArrayLiteral {
        const res = new SolArrayLiteral(
            src,
            elements.map((element) => (element ? this.use(element) : null))
        );

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
            this.use(memoryParameters),
            this.use(typeParameters),
            name,
            this.use(params),
            this.use(locals),
            this.use(returns),
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
        return new ir.StructDefinition(
            src,
            this.use(memoryParameters),
            this.use(typeParameters),
            name,
            fields
        );
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
        return new ir.LoadField(src, this.use(lhs), this.use(baseExpr), member);
    }

    storeField(
        src: ir.BaseSrc,
        baseExpr: ir.Expression,
        member: string,
        rhs: ir.Expression
    ): ir.StoreField {
        return new ir.StoreField(src, this.use(baseExpr), member, this.use(rhs));
    }

    loadIndex(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        baseExpr: ir.Expression,
        idxExpr: ir.Expression
    ): ir.LoadIndex {
        return new ir.LoadIndex(src, this.use(lhs), this.use(baseExpr), this.use(idxExpr));
    }

    storeIndex(
        src: ir.BaseSrc,
        baseExpr: ir.Expression,
        idxExpr: ir.Expression,
        rhs: ir.Expression
    ): ir.StoreIndex {
        return new ir.StoreIndex(src, this.use(baseExpr), this.use(idxExpr), this.use(rhs));
    }

    contains(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        baseExpr: ir.Expression,
        keyExpr: ir.Expression
    ): ir.Contains {
        return new ir.Contains(src, this.use(lhs), this.use(baseExpr), this.use(keyExpr));
    }

    assignment(src: ir.BaseSrc, lhs: ir.Identifier, rhs: ir.Expression): ir.Assignment {
        return new ir.Assignment(src, this.use(lhs), this.use(rhs));
    }

    allocArray(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        type: ir.Type,
        size: ir.Expression,
        mem: ir.MemDesc
    ): ir.AllocArray {
        return new ir.AllocArray(src, this.use(lhs), type, this.use(size), mem);
    }

    allocStruct(
        src: ir.BaseSrc,
        lhs: ir.Identifier,
        type: ir.UserDefinedType,
        mem: ir.MemDesc
    ): ir.AllocStruct {
        return new ir.AllocStruct(src, this.use(lhs), type, this.use(mem));
    }

    allocMap(src: ir.BaseSrc, lhs: ir.Identifier, type: ir.MapType, mem: ir.MemDesc): ir.AllocMap {
        return new ir.AllocMap(src, this.use(lhs), type, this.use(mem));
    }

    functionCall(
        src: ir.BaseSrc,
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[]
    ): ir.FunctionCall {
        return new ir.FunctionCall(
            src,
            this.use(lhss),
            this.use(callee),
            this.use(memArgs),
            typeArgs,
            this.use(args)
        );
    }

    transactionCall(
        src: ir.BaseSrc,
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[]
    ): ir.TransactionCall {
        return new ir.TransactionCall(
            src,
            this.use(lhss),
            this.use(callee),
            this.use(memArgs),
            typeArgs,
            this.use(args)
        );
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
        return new ir.Branch(src, this.use(condition), trueLabel, falseLabel);
    }

    return(src: ir.BaseSrc, values: ir.Expression[]): ir.Return {
        return new ir.Return(src, this.use(values));
    }

    assert(src: ir.BaseSrc, cond: ir.Expression): ir.Assert {
        return new ir.Assert(src, this.use(cond));
    }

    // Types
    pointerType(
        src: ir.BaseSrc,
        toType: ir.Type,
        region: ir.MemIdentifier | ir.MemConstant
    ): ir.PointerType {
        return new ir.PointerType(src, toType, this.use(region));
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
        return new ir.UserDefinedType(src, name, this.use(memArgs), typeArgs);
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

    mapType(src: ir.BaseSrc, keyT: ir.Type, valueT: ir.Type): ir.MapType {
        return new ir.MapType(src, keyT, valueT);
    }

    abort(src: ir.BaseSrc): ir.Abort {
        return new ir.Abort(src);
    }

    elementaryTypeName(src: ir.BaseSrc, raw: sol.ElementaryTypeNameExpression): ir.Abort {
        return new SolElementaryTypenameExpression(src, raw);
    }

    definitionExpression(
        src: ir.BaseSrc,
        raw: sol.Identifier | sol.MemberAccess | sol.IdentifierPath
    ): ir.Abort {
        return new SolDefinitionExpression(src, raw);
    }

    bytesToArrayStruct(bytes: bigint[], src: BaseSrc): ir.StructLiteral {
        return this.structLiteral(src, [
            ["len", this.numberLiteral(src, BigInt(bytes.length), 10, u256)],
            ["capacity", this.numberLiteral(src, BigInt(bytes.length), 10, u256)],
            [
                "arr",
                this.arrayLiteral(
                    src,
                    bytes.map((v) => this.numberLiteral(src, v, 10, u8))
                )
            ]
        ]);
    }
}
