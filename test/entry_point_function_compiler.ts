import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { UIDGenerator } from "../src";
import { BaseFunctionCompiler } from "../src/building/base_function_compiler";
import { ExpressionCompiler } from "../src/building/expression_compiler";
import { IRFactory } from "../src/building/factory";
import { blockPtrT, blockT, msgPtrT, noType, u160Addr, u256 } from "../src/building/typing";

export class EntryPointFunctionCompiler extends BaseFunctionCompiler {
    readonly exprCompiler: ExpressionCompiler;

    readonly mainContract: ir.StructDefinition;
    readonly mainContractCtr: ir.FunctionDefinition;
    readonly mainFunc: ir.FunctionDefinition;

    constructor(
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        factory: IRFactory,
        globalUid: UIDGenerator,
        globalScope: ir.Scope,
        mainUnit: sol.SourceUnit,
        mainContract: ir.StructDefinition,
        mainContractCtr: ir.FunctionDefinition,
        mainFunc: ir.FunctionDefinition
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);

        this.mainContract = mainContract;
        this.mainContractCtr = mainContractCtr;
        this.mainFunc = mainFunc;

        this.exprCompiler = new ExpressionCompiler(this.cfgBuilder, abiVersion, mainUnit);
    }

    compile(): ir.FunctionDefinition {
        const builder = this.cfgBuilder;
        const factory = builder.factory;

        /**
         * Declare and initialize global structs
         */
        builder.addIRLocal("block", blockPtrT, ir.noSrc);
        builder.addIRLocal("msg", msgPtrT, ir.noSrc);

        builder.allocStruct(
            factory.identifier(ir.noSrc, "block", blockPtrT),
            blockT,
            factory.memConstant(ir.noSrc, "memory"),
            ir.noSrc
        );

        builder.storeField(
            factory.identifier(ir.noSrc, "block", blockPtrT),
            "number",
            factory.numberLiteral(ir.noSrc, 1n, 10, u256),
            ir.noSrc
        );

        /**
         * Call main contract constructor and assign to __test__ variable
         */
        const thisT = factory.pointerType(
            ir.noSrc,
            factory.userDefinedType(ir.noSrc, this.mainContract.name, [], []),
            factory.memConstant(ir.noSrc, "storage")
        );

        builder.addIRLocal("__test__", thisT, ir.noSrc);

        builder.transCall(
            [factory.identifier(ir.noSrc, "__test__", thisT), builder.getTmpId(ir.boolT, ir.noSrc)],
            factory.identifier(ir.noSrc, this.mainContractCtr.name, noType),
            [],
            [],
            [
                factory.identifier(ir.noSrc, "block", blockPtrT),
                factory.identifier(ir.noSrc, "msg", msgPtrT)
            ],
            ir.noSrc
        );

        /**
         * Call test case main function of contract
         */
        builder.transCall(
            [builder.getTmpId(ir.boolT, ir.noSrc)],
            factory.identifier(ir.noSrc, this.mainFunc.name, noType),
            [],
            [],
            [
                this.exprCompiler.mustImplicitlyCastTo(
                    factory.identifier(ir.noSrc, "__test__", thisT),
                    u160Addr,
                    ir.noSrc
                ),
                factory.identifier(ir.noSrc, "block", blockPtrT),
                factory.identifier(ir.noSrc, "msg", msgPtrT)
            ],
            ir.noSrc
        );

        builder.return([], ir.noSrc);

        return this.finishCompile(ir.noSrc, "__entry__", []);
    }
}
