import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { boolT, concretizeType, makeSubst, noSrc } from "maru-ir2";
import { IRFactory } from "./factory";
import { noType, u256 } from "./typing";

export class CopyFunCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        globalScope: ir.Scope,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly type: ir.Type
    ) {
        super(factory, globalScope, solVersion, abiVersion);
    }

    templateType(t: ir.Type, memVar: ir.MemVariableDeclaration): ir.Type {
        const factory = this.cfgBuilder.factory;

        if (t instanceof ir.PointerType) {
            return factory.pointerType(
                t.src,
                this.templateType(t.toType, memVar),
                factory.memIdentifier(noSrc, memVar.name)
            );
        }

        if (t instanceof ir.ArrayType) {
            return factory.arrayType(t.src, this.templateType(t.baseType, memVar));
        }

        if (t instanceof ir.UserDefinedType) {
            sol.assert(t.memArgs.length === 1, `Can't template type {0} with multiple mem args`, t);

            return factory.userDefinedType(
                t.src,
                t.name,
                [factory.memIdentifier(noSrc, memVar.name)],
                t.typeArgs.map((tArg) => this.templateType(tArg, memVar))
            );
        }

        return t;
    }

    private compileCopy(
        src: ir.Expression,
        srcT: ir.Type,
        dst: ir.Identifier,
        dstT: ir.Type
    ): void {
        const factory = this.cfgBuilder.factory;

        if (
            (srcT instanceof ir.IntType && dstT instanceof ir.IntType) ||
            (srcT instanceof ir.BoolType && dstT instanceof ir.BoolType)
        ) {
            this.cfgBuilder.assign(dst, src, noSrc);
            return;
        }

        const existingCopyFun = this.globalScope.get(CopyFunCompiler.getCopyName(srcT));

        if (existingCopyFun instanceof ir.FunctionDefinition) {
            this.cfgBuilder.call(
                [dst],
                factory.identifier(noSrc, existingCopyFun.name, noType),
                [factory.memIdentifier(noSrc, "srcM"), factory.memIdentifier(noSrc, "dstM")],
                [],
                [src],
                noSrc
            );
            return;
        }

        if (
            srcT instanceof ir.PointerType &&
            dstT instanceof ir.PointerType &&
            srcT.toType instanceof ir.UserDefinedType &&
            dstT.toType instanceof ir.UserDefinedType &&
            srcT.toType.name === dstT.toType.name
        ) {
            const def = this.globalScope.getTypeDecl(srcT.toType);

            sol.assert(def instanceof ir.StructDefinition, ``);

            if (def.name === "ArrWithLen") {
                const srcArrBaseT = srcT.toType.typeArgs[0];
                const dstArrBaseT = dstT.toType.typeArgs[0];

                const srcArrPtrT = factory.pointerType(
                    noSrc,
                    factory.arrayType(noSrc, srcArrBaseT),
                    factory.memIdentifier(noSrc, "srcM")
                );
                const dstArrPtrT = factory.pointerType(
                    noSrc,
                    factory.arrayType(noSrc, dstArrBaseT),
                    factory.memIdentifier(noSrc, "dstM")
                );

                const newArrPtr = this.cfgBuilder.getTmpId(dstArrPtrT);

                const len = this.cfgBuilder.loadField(src, srcT, "len", noSrc);
                this.cfgBuilder.allocArray(
                    newArrPtr,
                    dstArrBaseT,
                    len,
                    factory.memIdentifier(noSrc, "dstM"),
                    noSrc
                );
                this.cfgBuilder.allocStruct(
                    dst,
                    dstT.toType,
                    factory.memIdentifier(noSrc, "dstM"),
                    noSrc
                );
                this.cfgBuilder.storeField(dst, "len", len, noSrc);
                this.cfgBuilder.storeField(dst, "arr", newArrPtr, noSrc);

                const srcArr = this.cfgBuilder.loadField(src, srcT, "arr", noSrc);

                const header = this.cfgBuilder.mkBB();
                const body = this.cfgBuilder.mkBB();
                const exit = this.cfgBuilder.mkBB();

                this.cfgBuilder.jump(header, noSrc);

                this.cfgBuilder.curBB = header;
                const ctr = this.cfgBuilder.getTmpId(u256, noSrc);
                this.cfgBuilder.branch(
                    factory.binaryOperation(noSrc, ctr, "<", len, boolT),
                    body,
                    exit,
                    noSrc
                );

                this.cfgBuilder.curBB = body;
                const dstElCopy = this.cfgBuilder.getTmpId(dstArrBaseT);
                const srcEl = this.cfgBuilder.loadIndex(srcArr, srcArrPtrT, ctr, noSrc);

                this.compileCopy(srcEl, srcArrBaseT, dstElCopy, dstArrBaseT);

                this.cfgBuilder.storeIndex(newArrPtr, ctr, dstElCopy, noSrc);
                this.cfgBuilder.assign(
                    ctr,
                    factory.binaryOperation(
                        noSrc,
                        ctr,
                        "+",
                        factory.numberLiteral(noSrc, 0n, 10, u256),
                        u256
                    ),
                    noSrc
                );
                this.cfgBuilder.jump(header, noSrc);

                this.cfgBuilder.curBB = exit;
                return;
            }

            const srcSubst = makeSubst(srcT.toType, this.globalScope);
            const dstSubst = makeSubst(dstT.toType, this.globalScope);

            for (const [fieldName, fieldT] of def.fields) {
                const srcFieldT = concretizeType(fieldT, srcSubst, this.globalScope.scopeOf(def));
                const dstFieldT = concretizeType(fieldT, dstSubst, this.globalScope.scopeOf(def));

                const srcField = this.cfgBuilder.loadField(src, srcT, fieldName, noSrc);
                const dstFieldTmp = this.cfgBuilder.getTmpId(dstFieldT, noSrc);

                this.compileCopy(srcField, srcFieldT, dstFieldTmp, dstFieldT);

                this.cfgBuilder.storeField(dst, fieldName, dstFieldTmp, noSrc);
            }

            return;
        }

        throw new Error(`NYI copy from ${srcT.pp()} to ${dstT.pp()}`);
    }

    /**
     * Compile the copy function for type `type` from memory region S to T
     */
    compile(): ir.FunctionDefinition {
        const factory = this.cfgBuilder.factory;
        const srcM = factory.memVariableDeclaration(noSrc, "srcM");
        const dstM = factory.memVariableDeclaration(noSrc, "dstM");

        // Add this argument

        const srcT = this.templateType(this.type, srcM);
        const dstT = this.templateType(this.type, dstM);

        this.cfgBuilder.addIRArg("src", srcT, noSrc);
        this.cfgBuilder.addIRRet("res", dstT, noSrc);

        const srcId = factory.identifier(noSrc, "src", srcM);
        const dstId = factory.identifier(noSrc, "res", dstM);

        this.compileCopy(srcId, srcT, dstId, dstT);

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);

        const name = CopyFunCompiler.getCopyName(this.type);

        return this.finishCompile(noSrc, name, [srcM, dstM]);
    }

    /**
     * Get a string descriptor for a type ignoring memory locations.  This way
     * we get a unique copy function for every type, agnostic of memory
     * locations
     */
    private static getTypeDesc(t: ir.Type): string {
        if (t instanceof ir.BoolType || t instanceof ir.IntType) {
            return t.pp();
        }

        if (t instanceof ir.PointerType) {
            return `ptr_${CopyFunCompiler.getTypeDesc(t.toType)}`;
        }

        if (t instanceof ir.UserDefinedType) {
            return `usr_${t.name}_${t.typeArgs
                .map((tArg) => CopyFunCompiler.getTypeDesc(tArg))
                .join("_")}`;
        }

        throw new Error(`NYI getTypeDesc(${t.pp()})`);
    }

    public static getCopyName(t: ir.Type): string {
        return `copy_${CopyFunCompiler.getTypeDesc(t)}`;
    }

    public static canCopy(srcT: ir.Type, dstT: ir.Type): boolean {
        if (
            (srcT instanceof ir.IntType && dstT instanceof ir.IntType) ||
            (srcT instanceof ir.BoolType && dstT instanceof ir.BoolType)
        ) {
            return true;
        }

        if (
            srcT instanceof ir.PointerType &&
            dstT instanceof ir.PointerType &&
            srcT.toType instanceof ir.UserDefinedType &&
            dstT.toType instanceof ir.UserDefinedType &&
            srcT.toType.name === dstT.toType.name
        ) {
            return true;
        }

        return false;
    }
}
