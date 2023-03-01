import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { boolT, noSrc } from "maru-ir2";
import { IRFactory } from "./factory";
import { noType, u256 } from "./typing";
import { UIDGenerator } from "../utils";

export class CopyFunCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly fromT: ir.Type,
        private readonly toT: ir.Type
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
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

    // @todo This duplicates logic in ExpressionCompiler.castTo. Fix this
    private castTo(expr: ir.Expression, fromT: ir.IntType, toT: ir.IntType): ir.Expression {
        const factory = this.cfgBuilder.factory;

        if (ir.eq(fromT, toT)) {
            return expr;
        }

        /**
         * Integer types with same sign can be implicitly converted fromSolT lower to higher bit-width
         */
        if (
            fromT instanceof ir.IntType &&
            toT instanceof ir.IntType &&
            fromT.signed === toT.signed &&
            fromT.nbits <= toT.nbits
        ) {
            return factory.cast(expr.src, toT, expr);
        }

        /**
         * Integer types can implicitly change their sign
         * ONLY fromSolT unsigned -> signed, and ONLY to STRICTLY larger bit-widths
         */
        if (
            fromT instanceof ir.IntType &&
            toT instanceof ir.IntType &&
            fromT.signed !== toT.signed &&
            fromT.nbits < toT.nbits
        ) {
            return factory.cast(expr.src, toT, expr);
        }

        throw new Error(`Can't cast ${expr.pp()} of type ${fromT.pp()} to ${toT.pp()}`);
    }

    private compileCopy(
        src: ir.Expression,
        srcT: ir.Type,
        dst: ir.Identifier,
        dstT: ir.Type
    ): void {
        const factory = this.cfgBuilder.factory;

        if (srcT instanceof ir.BoolType && dstT instanceof ir.BoolType) {
            this.cfgBuilder.assign(dst, src, noSrc);
            return;
        }

        // We allow a little bit of casting between int types when copying arrays to
        // support assigning to storage arrays (up-casts are allowed there)
        if (srcT instanceof ir.IntType && dstT instanceof ir.IntType) {
            this.cfgBuilder.assign(dst, this.castTo(src, srcT, dstT), noSrc);
            return;
        }

        const existingCopyFun = this.globalScope.get(CopyFunCompiler.getCopyName(srcT, dstT));

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
                        factory.numberLiteral(noSrc, 1n, 10, u256),
                        u256
                    ),
                    noSrc
                );
                this.cfgBuilder.jump(header, noSrc);

                this.cfgBuilder.curBB = exit;
                return;
            }

            const srcFields = this.cfgBuilder.getConcreteFields(srcT.toType);
            const dstFields = this.cfgBuilder.getConcreteFields(dstT.toType);

            sol.assert(srcFields.length === dstFields.length, ``);
            for (let i = 0; i < srcFields.length; i++) {
                const [srcFieldName, srcFieldT] = srcFields[i];
                const [dstFieldName, dstFieldT] = dstFields[i];

                sol.assert(srcFieldName === dstFieldName, ``);

                const srcField = this.cfgBuilder.loadField(src, srcT, srcFieldName, noSrc);
                const dstFieldTmp = this.cfgBuilder.getTmpId(dstFieldT, noSrc);

                this.compileCopy(srcField, srcFieldT, dstFieldTmp, dstFieldT);

                this.cfgBuilder.storeField(dst, dstFieldName, dstFieldTmp, noSrc);
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

        const srcT = this.templateType(this.fromT, srcM);
        const dstT = this.templateType(this.toT, dstM);

        this.cfgBuilder.addIRArg("src", srcT, noSrc);
        this.cfgBuilder.addIRRet("res", dstT, noSrc);

        const srcId = factory.identifier(noSrc, "src", srcM);
        const dstId = factory.identifier(noSrc, "res", dstM);

        this.compileCopy(srcId, srcT, dstId, dstT);

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);

        const name = CopyFunCompiler.getCopyName(this.fromT, this.toT);

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

    public static getCopyName(fromT: ir.Type, toT: ir.Type): string {
        return `copy_from_${CopyFunCompiler.getTypeDesc(fromT)}_to_${CopyFunCompiler.getTypeDesc(
            toT
        )}`;
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
