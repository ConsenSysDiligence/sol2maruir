import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { noSrc, StructDefinition } from "maru-ir2";
import { blockPtrT, msgPtrT, transpileType } from "./typing";
import { ASTSource } from "../ir/source";
import { getDesugaredGetterName } from "./resolving";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { IRFactory } from "./factory";
import { UIDGenerator } from "../utils";
import { ExpressionCompiler } from "./expression_compiler";

export class GetterCompiler extends BaseFunctionCompiler {
    exprCompiler: ExpressionCompiler;

    constructor(
        factory: IRFactory,
        private readonly def: sol.VariableDeclaration,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly scope: sol.ContractDefinition,
        contractStruct: ir.StructDefinition
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion, contractStruct);

        this.exprCompiler = new ExpressionCompiler(this.cfgBuilder, this.abiVersion, this.scope);
    }

    /**
     * Compile the current solidity function to a low-level IR function and return it.
     */
    compile(): ir.FunctionDefinition {
        const src = new ASTSource(this.def);
        const name: string = getDesugaredGetterName(this.def, this.scope, this.cfgBuilder.infer);
        const factory = this.cfgBuilder.factory;

        const [argTs, retT] = this.cfgBuilder.infer.getterArgsAndReturn(this.def);

        const thisT = factory.pointerType(
            ir.noSrc,
            factory.userDefinedType(
                ir.noSrc,
                (this.contractStruct as StructDefinition).name,
                [],
                []
            ),
            factory.memConstant(ir.noSrc, "storage")
        );

        this.cfgBuilder.addIRArg("this", thisT, ir.noSrc);
        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);

        const retTs = retT instanceof sol.TupleType ? retT.elements : [retT];

        retTs.forEach((retElT, i) =>
            this.cfgBuilder.addIRRet(
                `RET_${i}`,
                transpileType(retElT as sol.TypeNode, this.cfgBuilder.factory),
                noSrc
            )
        );

        let fieldRef = this.cfgBuilder.loadField(
            this.cfgBuilder.this(ir.noSrc),
            thisT,
            this.def.name,
            ir.noSrc
        );
        let fieldT = (this.contractStruct as ir.StructDefinition).getFieldType(
            this.def.name
        ) as ir.Type;

        for (let i = 0; i < argTs.length; i++) {
            const argT = transpileType(argTs[i], factory);
            const argName = `ARG_${i}`;
            this.cfgBuilder.addIRArg(argName, argT, ir.noSrc);
            const argId = factory.identifier(ir.noSrc, argName, argT);

            if (fieldT instanceof ir.PointerType && fieldT.toType instanceof ir.UserDefinedType) {
                const decl = this.cfgBuilder.resolve(fieldT.toType.name);

                if (!(decl instanceof ir.StructDefinition && decl.name === "ArrWithLen")) {
                    throw new Error(`Unexpected struct ${decl.pp()} in getter`);
                }

                fieldRef = this.exprCompiler.solArrRead(fieldRef, argId, ir.noSrc);

                fieldT = fieldT.toType.typeArgs[0];
            } else if (fieldT instanceof ir.PointerType && fieldT.toType instanceof ir.MapType) {
                fieldRef = this.exprCompiler.makeMapLoadIndex(fieldRef, argId, ir.noSrc);
                fieldT = fieldT.toType.valueType;
            } else {
                throw new Error(`Unexpected arg for field type ${fieldT.pp()}`);
            }
        }

        if (this.cfgBuilder.returns.length === 1) {
            const ret0 = this.cfgBuilder.returns[0];
            this.cfgBuilder.assign(
                factory.identifier(noSrc, ret0.name, ret0.type),
                this.exprCompiler.copyToMem(fieldRef, fieldT, factory.memConstant(noSrc, "memory")),
                noSrc
            );
        } else {
            sol.assert(
                fieldT instanceof ir.PointerType && fieldT.toType instanceof ir.UserDefinedType,
                ``
            );

            const decl = this.cfgBuilder.resolve(fieldT.toType.name);
            sol.assert(decl instanceof ir.StructDefinition, ``);

            sol.assert(
                decl.fields.length === this.cfgBuilder.returns.length,
                `Mismatch in return struct fields ${decl.pp()} and expected number of returns ${
                    this.cfgBuilder.returns.length
                } for getter ${this.def.name}`
            );

            decl.fields.forEach(([name], i) => {
                const retV = this.cfgBuilder.returns[i];

                const fieldV = this.cfgBuilder.loadField(fieldRef, fieldT, name, noSrc);

                this.cfgBuilder.assign(
                    factory.identifier(noSrc, retV.name, retV.type),
                    this.exprCompiler.copyToMem(
                        fieldV,
                        factory.typeOf(fieldV),
                        factory.memConstant(noSrc, "memory")
                    ),
                    noSrc
                );
            });
        }

        this.cfgBuilder.jump(this.cfgBuilder.returnBB, noSrc);

        return this.finishCompile(src, name);
    }
}
