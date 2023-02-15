import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BasicBlock } from "maru-ir2/dist/ir/cfg";
import { assert, InferType, pp } from "solc-typed-ast";
import { UIDGenerator } from "../utils";
import { BaseSrc, concretizeType, makeSubst, noSrc } from "maru-ir2";
import { transpileType, u256 } from "./typing";
import { ASTSource } from "../ir/source";
import { IRFactory } from "./factory";

export class CFGBuilder {
    /**
     * UID generator for local unique BB/TMP Identifiers
     */
    readonly localUid: UIDGenerator;

    /**
     * Function entry block
     */
    private _entryBB: BasicBlock | undefined;

    /**
     * Successful function return block
     */
    public readonly returnBB: BasicBlock;

    /**
     * Failed `require()`, `revert()` or `assert()` call block.
     */
    readonly _exceptionBB: BasicBlock;

    /**
     * The parameters of the function
     */
    readonly args: ir.VariableDeclaration[];

    /**
     * The returns of the function. We keep an explicit variable for each return
     * to transpile Solidity assignments to returns.
     */
    readonly returns: ir.VariableDeclaration[];

    /**
     * Local variables used in the function.
     */
    private readonly _locals: ir.VariableDeclaration[];

    /**
     * Temporary locals for internal use.
     */
    private readonly temps: ir.VariableDeclaration[];

    /**
     * Current basic block of the function execution control flow
     */
    private _curBB: BasicBlock | undefined;

    /**
     * Map from names to variables
     */
    private defMap: Map<string, ir.VariableDeclaration>;

    /**
     * Array of produced basic blocks
     */
    private _nodes: BasicBlock[];

    /**
     *  Infer the type of of a solidity expression
     */
    public readonly infer: sol.InferType;

    /**
     * Map from solidity params/returns/locals to their corresponding low-level IR local variable.
     */
    private solidityVarsToIRVarsMap = new Map<sol.VariableDeclaration, ir.VariableDeclaration>();

    public placeHolderStack: sol.PlaceholderStatement[];

    constructor(
        public readonly globalScope: ir.Scope,
        public readonly funScope: ir.Scope,
        public readonly globalUid: UIDGenerator,
        public readonly solVersion: string,
        public readonly factory: IRFactory
    ) {
        this.localUid = new UIDGenerator();

        this._nodes = [];

        this._entryBB = this.mkBB("entry");
        this.curBB = this._entryBB;

        this.returnBB = this.mkBB("return");
        this._exceptionBB = this.mkBB("exception");

        this.args = [];
        this._locals = [];
        this.temps = [];
        this.returns = [];
        this.placeHolderStack = [];

        this.defMap = new Map();
        this.infer = new InferType(solVersion);
    }

    get locals(): ir.VariableDeclaration[] {
        return [...this._locals, ...this.temps, ...this.returns];
    }

    public addIRLocalImpl(
        name: string,
        typ: ir.Type,
        src: BaseSrc,
        collection: ir.VariableDeclaration[]
    ): ir.VariableDeclaration {
        if (this.defMap.has(name)) {
            throw new Error(`Local ${name} duplicates existing def.`);
        }

        const decl = this.factory.variableDeclaration(src, name, typ);
        collection.push(decl);
        this.defMap.set(name, decl);

        return decl;
    }

    private addSolVarImpl(
        v: sol.VariableDeclaration,
        collection: ir.VariableDeclaration[]
    ): ir.VariableDeclaration {
        const name = this.getVarName(v);
        const type = transpileType(this.infer.variableDeclarationToTypeNode(v), this.factory);

        const decl = this.addIRLocalImpl(name, type, new ASTSource(v), collection);
        this.solidityVarsToIRVarsMap.set(v, decl);

        return decl;
    }

    public addIRArg(name: string, type: ir.Type, src: BaseSrc): ir.VariableDeclaration {
        return this.addIRLocalImpl(name, type, src, this.args);
    }

    public addIRLocal(name: string, type: ir.Type, src: BaseSrc): ir.VariableDeclaration {
        return this.addIRLocalImpl(name, type, src, this._locals);
    }

    public addIRRet(name: string, type: ir.Type, src: BaseSrc): ir.VariableDeclaration {
        return this.addIRLocalImpl(name, type, src, this.returns);
    }

    public getVarId(decl: sol.VariableDeclaration, src: BaseSrc): ir.Identifier {
        const irDecl = this.solidityVarsToIRVarsMap.get(decl);

        assert(irDecl !== undefined, `No IR decl for solidity variable {0}`, decl);

        return this.factory.identifier(src, this.getVarName(decl), irDecl.type);
    }

    public getVarType(decl: sol.VariableDeclaration): ir.Type {
        const irDecl = this.solidityVarsToIRVarsMap.get(decl);

        assert(irDecl !== undefined, `No IR decl for solidity variable {0}`, decl);

        return irDecl.type;
    }

    private getVarName(decl: sol.VariableDeclaration): string {
        // Global constants
        if (decl.parent instanceof sol.SourceUnit) {
            return `${decl.name}_${decl.id}`;
        }

        // Function arguments/returns
        if (
            decl.parent instanceof sol.ParameterList &&
            decl.parent.parent instanceof sol.FunctionDefinition
        ) {
            const name = decl.name === "" ? "RET" : decl.name;
            return `${name}_${decl.id}`;
        }

        // Local variables, modifier local variables, modifier arguments
        if (
            decl.parent instanceof sol.VariableDeclarationStatement ||
            (decl.parent instanceof sol.ParameterList &&
                decl.parent.parent instanceof sol.ModifierDefinition)
        ) {
            let phPath = "";

            if (this.placeHolderStack.length > 1) {
                phPath =
                    "_ph_" +
                    this.placeHolderStack
                        .slice(1)
                        .map((x) => "" + x.id)
                        .join("_");
            }

            return `${decl.name}_${decl.id}${phPath}`;
        }

        throw new Error(`Cannot get ir identifier name for ${pp(decl)}`);
    }

    addLocal(localV: sol.VariableDeclaration): ir.VariableDeclaration {
        return this.addSolVarImpl(localV, this._locals);
    }

    addModifierArg(localV: sol.VariableDeclaration): ir.VariableDeclaration {
        return this.addSolVarImpl(localV, this._locals);
    }

    addArg(argV: sol.VariableDeclaration): ir.VariableDeclaration {
        return this.addSolVarImpl(argV, this.args);
    }

    addRet(retV: sol.VariableDeclaration): ir.VariableDeclaration {
        return this.addSolVarImpl(retV, this.returns);
    }

    addThis(typ: ir.Type, isConstructor = false): ir.VariableDeclaration {
        /// @todo (dimo): Handle potential shadowing here
        return this.addIRLocalImpl("this", typ, noSrc, isConstructor ? this._locals : this.args);
    }

    mkBB(name?: string): BasicBlock {
        const bb = new BasicBlock(name ? name : this.localUid.get("BB"));
        this._nodes.push(bb);
        return bb;
    }

    set curBB(newVal: BasicBlock | undefined) {
        this._curBB = newVal;
    }

    get curBB(): BasicBlock {
        assert(this._curBB !== undefined, `Missing _curBB`);

        return this._curBB;
    }

    get isCurBBSet(): boolean {
        return this._curBB !== undefined;
    }

    get entry(): BasicBlock {
        assert(this._entryBB !== undefined, `Missing _entry`);

        return this._entryBB;
    }

    set entry(bb: BasicBlock) {
        this._entryBB = bb;
    }

    get exits(): BasicBlock[] {
        return [this.returnBB, this._exceptionBB];
    }

    public getCFG(): ir.CFG {
        // Make sure the entry is always the first block in the CFG
        const nodes: BasicBlock[] = [this.entry, ...this._nodes.filter((nd) => nd !== this.entry)];

        return new ir.CFG(nodes, this.entry, this.exits);
    }

    addStmt(stmt: ir.Statement): void {
        this.curBB.statements.push(stmt);
    }

    getTmpId(type: ir.Type, src: ir.BaseSrc = noSrc): ir.Identifier {
        const name = this.localUid.get("TMP");
        this.addIRLocalImpl(name, type, src, this.temps);
        const newId = this.factory.identifier(src, name, type);

        return newId;
    }

    resolve(name: string): ir.Def {
        return this.funScope.mustGet(name, noSrc);
    }

    /**
     * Add a statement to the current BB that loads `base.field` in a new temp identifier and returns it.
     */
    loadField(base: ir.Expression, type: ir.Type, field: string, src: ir.BaseSrc): ir.Identifier {
        assert(
            type instanceof ir.PointerType && type.toType instanceof ir.UserDefinedType,
            `Expected a pointer type not {0}`,
            type
        );

        const def = this.resolve(type.toType.name);

        assert(def instanceof ir.StructDefinition, `Cannot load field on non-struct def {0}`, def);

        const fieldT = def.getFieldType(field);

        assert(fieldT !== undefined, `No field {0} on struct {1}`, field, def);

        const subst = makeSubst(type.toType, this.funScope);
        const concreteFieldT = concretizeType(fieldT, subst, this.globalScope.scopeOf(def));

        const lhs = this.getTmpId(concreteFieldT, src);

        this.curBB.statements.push(this.factory.loadField(src, lhs, base, field));

        return lhs;
    }

    /**
     * Add a statement to the current BB that stores `rhs` in `base.field`.
     */
    storeField(base: ir.Expression, field: string, rhs: ir.Expression, src: ir.BaseSrc): void {
        this.curBB.statements.push(this.factory.storeField(src, base, field, rhs));
    }

    /**
     * Add a statement to the current BB that loads `base[idx]` in a new temp identifier and returns it.
     */
    loadIndex(
        base: ir.Expression,
        type: ir.Type,
        idx: ir.Expression,
        src: ir.BaseSrc
    ): ir.Identifier {
        assert(
            type instanceof ir.PointerType && type.toType instanceof ir.ArrayType,
            `Expected a pointer type not {0}`,
            type
        );

        const elT = type.toType.baseType;
        const lhs = this.getTmpId(elT, src);
        this.curBB.statements.push(this.factory.loadIndex(src, lhs, base, idx));

        return lhs;
    }

    /**
     * Add a statement to the current BB that stores `rhs` in `base[idx]`.
     */
    storeIndex(base: ir.Expression, idx: ir.Expression, rhs: ir.Expression, src: ir.BaseSrc): void {
        this.curBB.statements.push(this.factory.storeIndex(src, base, idx, rhs));
    }

    /**
     * Add an assignment to the current BB
     */
    assign(lhs: ir.Identifier, rhs: ir.Expression, src: ir.BaseSrc): void {
        this.curBB.statements.push(this.factory.assignment(src, lhs, rhs));
    }

    allocArray(
        lhs: ir.Identifier,
        baseT: ir.Type,
        size: ir.Expression,
        inMem: ir.MemDesc,
        src: ir.BaseSrc
    ): void {
        this.curBB.statements.push(this.factory.allocArray(src, lhs, baseT, size, inMem));
    }

    allocStruct(
        lhs: ir.Identifier,
        baseT: ir.UserDefinedType,
        inMem: ir.MemDesc,
        src: ir.BaseSrc
    ): void {
        this.curBB.statements.push(this.factory.allocStruct(src, lhs, baseT, inMem));
    }

    call(
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[],
        src: BaseSrc
    ): void {
        this.curBB.statements.push(
            this.factory.functionCall(src, lhss, callee, memArgs, typeArgs, args)
        );
    }

    transCall(
        lhss: ir.Identifier[],
        callee: ir.Identifier,
        memArgs: ir.MemDesc[],
        typeArgs: ir.Type[],
        args: ir.Expression[],
        src: BaseSrc
    ): void {
        this.curBB.statements.push(
            this.factory.transactionCall(src, lhss, callee, memArgs, typeArgs, args)
        );
    }

    jump(to: ir.BasicBlock, src: BaseSrc): void {
        this.curBB.statements.push(this.factory.jump(src, to.label));
        this._curBB = undefined;
    }

    branch(cond: ir.Expression, trueBB: ir.BasicBlock, falseBB: ir.BasicBlock, src: BaseSrc): void {
        this.curBB.statements.push(this.factory.branch(src, cond, trueBB.label, falseBB.label));
        this._curBB = undefined;
    }

    return(vals: ir.Expression[], src: BaseSrc): void {
        this.curBB.statements.push(this.factory.return(src, vals));
        this._curBB = undefined;
    }

    abort(src: BaseSrc): void {
        this.curBB.statements.push(this.factory.abort(src));
        this._curBB = undefined;
    }

    typeOfLocal(name: string): ir.Type {
        const decl = this.defMap.get(name);
        assert(decl !== undefined, `Unknown local {0}`, name);
        return decl.type;
    }

    /**
     * Return the length of an array
     */
    arrayLength(src: ir.BaseSrc, array: ir.Identifier): ir.Expression {
        return this.loadField(array, this.typeOfLocal(array.name), "len", src);
    }

    id(src: ir.BaseSrc, decl: ir.VariableDeclaration): ir.Identifier {
        return this.factory.identifier(src, decl.name, decl.type);
    }

    private getInternalId(name: string, src: ir.BaseSrc) {
        const def = this.defMap.get(name);
        assert(def !== undefined, `Missing {0} def`, name);
        return this.factory.identifier(src, name, def.type);
    }

    this(src: ir.BaseSrc): ir.Identifier {
        return this.getInternalId("this", src);
    }

    msgPtr(src: ir.BaseSrc): ir.Identifier {
        return this.getInternalId("msg", src);
    }

    blockPtr(src: ir.BaseSrc): ir.Identifier {
        return this.getInternalId("block", src);
    }

    zeroValue(typ: ir.Type, src: BaseSrc = noSrc): ir.Expression {
        if (typ instanceof ir.IntType) {
            return this.factory.numberLiteral(src, BigInt(0), 10, typ);
        }

        if (typ instanceof ir.BoolType) {
            return this.factory.booleanLiteral(src, false);
        }

        if (typ instanceof ir.PointerType) {
            if (typ.toType instanceof ir.ArrayType) {
                const res = this.getTmpId(typ, src);

                this.allocArray(
                    res,
                    typ.toType.baseType,
                    this.factory.numberLiteral(src, 0n, 10, u256),
                    typ.region,
                    src
                );

                return res;
            }

            if (typ.toType instanceof ir.UserDefinedType) {
                const def = this.globalScope.getTypeDecl(typ.toType);

                if (def instanceof ir.StructDefinition && def.name === "ArrWithLen") {
                    const size = typ.toType.md.has("size")
                        ? (typ.toType.md.get("size") as bigint)
                        : 0n;

                    const res = this.getTmpId(typ, src);
                    this.call(
                        [res],
                        this.factory.funIdentifier("new_array"),
                        typ.toType.memArgs,
                        typ.toType.typeArgs,
                        [this.factory.numberLiteral(src, size, 10, u256)],
                        src
                    );

                    const elT = typ.toType.typeArgs[0];
                    const arrId = this.loadField(res, typ, "arr", src);

                    for (let i = 0n; i < size; i++) {
                        this.storeIndex(
                            arrId,
                            this.factory.numberLiteral(src, i, 10, u256),
                            this.zeroValue(elT, src),
                            src
                        );
                    }

                    return res;
                }

                if (def instanceof ir.StructDefinition) {
                    const res = this.getTmpId(typ, src);
                    this.allocStruct(res, typ.toType, typ.region, src);
                    const subst = makeSubst(typ.toType, this.funScope);
                    const structScope = this.globalScope.scopeOf(def);

                    for (const [fieldName, fieldT] of def.fields) {
                        const concreteFieldT = concretizeType(fieldT, subst, structScope);
                        this.storeField(res, fieldName, this.zeroValue(concreteFieldT, src), src);
                    }

                    return res;
                }
            }
        }

        throw new Error(`NYI zeroValue(${typ.pp()})`);
    }

    public zeroInitLocals(): void {
        const zeroInitBB = this.mkBB("zero_init");
        const oldEntry = this.entry;
        this.entry = zeroInitBB;
        this.curBB = zeroInitBB;

        for (const v of [...this.locals, ...this.returns]) {
            this.assign(
                this.factory.identifier(noSrc, v.name, v.type),
                this.zeroValue(v.type),
                noSrc
            );
        }

        this.jump(oldEntry, noSrc);
    }

    /**
     * Given a user-defined type `userT` with some optional polymorphic mem/type
     * args, used in current function scope, return a list of the field names
     * and their concrete types given the polymorphic mem/type args.
     */
    getConcreteFields(userT: ir.UserDefinedType): Array<[string, ir.Type]> {
        const subst = makeSubst(userT, this.funScope);
        const res: Array<[string, ir.Type]> = [];
        const def = this.globalScope.get(userT.name);

        assert(def instanceof ir.StructDefinition, `Expected a struct not {0}`, def);
        const defScope = this.globalScope.scopeOf(def);

        for (const [fieldName, fieldT] of def.fields) {
            const concreteFieldT = concretizeType(fieldT, subst, defScope);

            res.push([fieldName, concreteFieldT]);
        }

        return res;
    }
}
