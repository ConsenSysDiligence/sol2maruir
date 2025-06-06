import * as ir from "maru-ir2";
import * as sol from "solc-typed-ast";
import { UIDGenerator } from "../src";
import { BaseFunctionCompiler } from "../src/building/base_function_compiler";
import { ExpressionCompiler } from "../src/building/expression_compiler";
import { IRFactory } from "../src/building/factory";
import { blockPtrT, blockT, msgPtrT, msgT, noType, u160, u256 } from "../src/building/typing";

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

        builder.allocStruct(
            factory.identifier(ir.noSrc, "msg", msgPtrT),
            msgT,
            factory.memConstant(ir.noSrc, "memory"),
            ir.noSrc
        );

        builder.storeField(
            factory.identifier(ir.noSrc, "msg", msgPtrT),
            "sender",
            factory.numberLiteral(ir.noSrc, 0n, 16, u160),
            ir.noSrc
        );
        builder.storeField(
            factory.identifier(ir.noSrc, "msg", msgPtrT),
            "value",
            factory.numberLiteral(ir.noSrc, 1000000n, 10, u256),
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
        const failed = builder.getTmpId(ir.boolT, ir.noSrc);

        builder.transCall(
            [failed],
            factory.identifier(ir.noSrc, this.mainFunc.name, noType),
            [],
            [],
            [
                factory.identifier(ir.noSrc, "__test__", thisT),
                factory.identifier(ir.noSrc, "block", blockPtrT),
                factory.identifier(ir.noSrc, "msg", msgPtrT)
            ],
            ir.noSrc
        );

        builder.assert(factory.unaryOperation(ir.noSrc, "!", failed, ir.boolT), ir.noSrc);

        /**
         * Compose return values and perform finalization actions
         */
        builder.return([], ir.noSrc);

        return this.finishCompile(ir.noSrc, "__entry__", []);
    }
}
