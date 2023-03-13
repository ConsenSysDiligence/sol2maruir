import expect from "expect";
import * as fse from "fs-extra";
import { Definition } from "maru-ir2";
import { assert, ASTReader, compileSol } from "solc-typed-ast";
import { UnitCompiler } from "../src";
import { SolMaruirInterp } from "../src/interp";
import { buildMaps, JSONConfigTranspiler } from "./json_config_transpiler";

/*
const files = [
    "test/samples/solidity/ABIEncoderV2_Structs.config.json",
    "test/samples/solidity/AbstractVirtualModifier.config.json",
    "test/samples/solidity/AddressArrayLiteral.config.json",
    "test/samples/solidity/AddressBytesCast04x.config.json",
    "test/samples/solidity/AddressLiteralMemberAccess.config.json",
    "test/samples/solidity/AddressMembersOfContract04.config.json",
    "test/samples/solidity/aliasing_and_copying.config.json",
    "test/samples/solidity/AmbiguousFunctions.config.json",
    "test/samples/solidity/ArrayLengthUnaryOp.config.json",
    "test/samples/solidity/ArrayLiteralWithConstantFolding.config.json",
    "test/samples/solidity/arrays.config.json",
    "test/samples/solidity/ArrayTypesDesugaring.config.json",
    "test/samples/solidity/assignments.config.json",
    "test/samples/solidity/Balance.config.json",
    "test/samples/solidity/BitwiseShiftsVersioning05.config.json",
    "test/samples/solidity/boolean_v04.config.json",
    "test/samples/solidity/Calldata08.config.json",
    "test/samples/solidity/CalldataArgPassing.config.json",
    "test/samples/solidity/Calldata.config.json",
    "test/samples/solidity/CalldataSlices.config.json",
    "test/samples/solidity/CalldataVars069.config.json",
    "test/samples/solidity/calls_assert_require_revert.config.json",
    "test/samples/solidity/calls.config.json",
    "test/samples/solidity/calls_general.config.json",
    "test/samples/solidity/calls_returns.config.json",
    "test/samples/solidity/CastInBraces.config.json",
    "test/samples/solidity/casting.config.json",
    "test/samples/solidity/casts.config.json",
    "test/samples/solidity/CircularDefinitions.config.json",
    "test/samples/solidity/CodeSize080.config.json",
    "test/samples/solidity/CodeSize081.config.json",
    "test/samples/solidity/ComparisonOnContractTypes.config.json",
    "test/samples/solidity/CompoundTypeNames.config.json",
    "test/samples/solidity/ConditionalTuples2.config.json",
    "test/samples/solidity/ConditionalTuples.config.json",
    "test/samples/solidity/ConstantFolding.config.json",
    "test/samples/solidity/ConstantFoldingInConstructors.config.json",
    "test/samples/solidity/ConstructorLinearization.config.json",
    "test/samples/solidity/ConstructorModifiers_0421.config.json",
    "test/samples/solidity/ConstructorModifiers.config.json",
    "test/samples/solidity/ConstructorReferencesItselfAsModifier.config.json",
    "test/samples/solidity/ContractEnumKeys06.config.json",
    "test/samples/solidity/ContractToContractCasts04.config.json",
    "test/samples/solidity/create_contract.config.json",
    "test/samples/solidity/DecodingTest.config.json",
    "test/samples/solidity/DoubleUnderscore.config.json",
    "test/samples/solidity/EffectfulAssignmentExpression.config.json",
    "test/samples/solidity/EmptyArgNames.config.json",
    "test/samples/solidity/EncodingTest.config.json",
    "test/samples/solidity/EncodingWithSelectorOrSignature.config.json",
    "test/samples/solidity/EnumTypeInArgs.config.json",
    "test/samples/solidity/ExpressionStatement.config.json",
    "test/samples/solidity/external_call_modifiers.config.json",
    "test/samples/solidity/Fallback08.config.json",
    "test/samples/solidity/FileLevelConstants075.config.json",
    "test/samples/solidity/fors_v04.config.json",
    "test/samples/solidity/FreeFunctions.config.json",
    "test/samples/solidity/FunctionCallOptions.config.json",
    "test/samples/solidity/function_name_disambiguation.config.json",
    "test/samples/solidity/GettersWithContractType.config.json",
    "test/samples/solidity/HashingTest_v0424.config.json",
    "test/samples/solidity/HexLiterals.config.json",
    "test/samples/solidity/ifs_v04.config.json",
    "test/samples/solidity/ImplicitConstructor04.config.json",
    "test/samples/solidity/ImplicitConstructor05.config.json",
    "test/samples/solidity/ImplicitMemoryStorageCasts.config.json",
    "test/samples/solidity/implicit_parent_constructors.config.json",
    "test/samples/solidity/ImplicitStringLiteralFixedByteCasts.config.json",
    "test/samples/solidity/inheritance_ex1.config.json",
    "test/samples/solidity/inheritance_ex2.config.json",
    "test/samples/solidity/InheritanceFunctionResolving.config.json",
    "test/samples/solidity/InMemoryStructWithMapping.config.json",
    "test/samples/solidity/IntByteCasts.config.json",
    "test/samples/solidity/LengthTest.config.json",
    "test/samples/solidity/LibraryConstantQualifiedAccess.config.json",
    "test/samples/solidity/LibraryOverloadedCall.config.json",
    "test/samples/solidity/LibraryThis.config.json",
    "test/samples/solidity/LibraryTypeNames.config.json",
    "test/samples/solidity/library_usage.config.json",
    "test/samples/solidity/LibToLibCall.config.json",
    "test/samples/solidity/LibUsingOverloading.config.json",
    "test/samples/solidity/literals.config.json",
    "test/samples/solidity/lowlevel_calls_04.config.json",
    "test/samples/solidity/lowlevel_calls_08.config.json",
    "test/samples/solidity/mappings.config.json",
    "test/samples/solidity/MapWithStringKeys.config.json",
    "test/samples/solidity/MemoryAliasing.config.json",
    "test/samples/solidity/MemoryArraysCasting.config.json",
    "test/samples/solidity/MemroyInitialization.config.json",
    "test/samples/solidity/misc08.config.json",
    "test/samples/solidity/misc.config.json",
    "test/samples/solidity/modifiers.config.json",
    "test/samples/solidity/ModifiersVsBaseConstructors.config.json",
    "test/samples/solidity/MultipleInheritanceVirtualModifier.config.json",
    "test/samples/solidity/NoArgPush.config.json",
    "test/samples/solidity/OldStyleEventEmit.config.json",
    "test/samples/solidity/operators_binary.config.json",
    "test/samples/solidity/operators_unary.config.json",
    "test/samples/solidity/overflow_08.config.json",
    "test/samples/solidity/overflow_and_underflow.config.json",
    "test/samples/solidity/Overriding.config.json",
    "test/samples/solidity/PackedEncodingTest.config.json",
    "test/samples/solidity/private_funcs_are_virtual.config.json",
    "test/samples/solidity/PublicGetterOverridesInterface.config.json",
    "test/samples/solidity/public_getters.config.json",
    "test/samples/solidity/PublicGetterSelectorAccess.config.json",
    "test/samples/solidity/QualifiedMethodCall.config.json",
    "test/samples/solidity/QualifiedStateVarAccess.config.json",
    "test/samples/solidity/RationalTest.config.json",
    "test/samples/solidity/Rerun20210612.config.json",
    "test/samples/solidity/ReturnContracts.config.json",
    "test/samples/solidity/ReturnInlineArrayTuple.config.json",
    "test/samples/solidity/returns.config.json",
    "test/samples/solidity/ReturnSingleTupleCollapsing.config.json",
    "test/samples/solidity/ReturnStorageRef.config.json",
    "test/samples/solidity/SelectorTest062.config.json",
    "test/samples/solidity/sending_values.config.json",
    "test/samples/solidity/Shadowing.config.json",
    "test/samples/solidity/ShadowingStateVar.config.json",
    "test/samples/solidity/simple.config.json",
    "test/samples/solidity/simple_dyn_dispatch.config.json",
    "test/samples/solidity/SimpleVirtualModifier.config.json",
    "test/samples/solidity/Solidity06AddressCast.config.json",
    "test/samples/solidity/Solidity06Features.config.json",
    "test/samples/solidity/Solidity08BuiltinsTest.config.json",
    "test/samples/solidity/SpecialFunsDesugaring.config.json",
    "test/samples/solidity/StateVarArrayWithCustomSize.config.json",
    "test/samples/solidity/StateVarInitializers.config.json",
    "test/samples/solidity/StateVarMultiShadow2.config.json",
    "test/samples/solidity/StateVarMultiShadow.config.json",
    "test/samples/solidity/StateVarOverloading.config.json",
    "test/samples/solidity/StorageAliasing.config.json",
    "test/samples/solidity/StorageRefArg.config.json",
    "test/samples/solidity/StructConstructorCall_05.config.json",
    "test/samples/solidity/StructConstructorCall.config.json",
    "test/samples/solidity/StructWithContractTypeField.config.json",
    "test/samples/solidity/SuperKeyword.config.json",
    "test/samples/solidity/ternary.config.json",
    "test/samples/solidity/Throw.config.json",
    "test/samples/solidity/TopLevelEnums.config.json",
    "test/samples/solidity/TopLevelStructs.config.json",
    "test/samples/solidity/TryCatch08.config.json",
    "test/samples/solidity/TryCatch.config.json",
    "test/samples/solidity/TryCatchMisc.config.json",
    "test/samples/solidity/TryCatchShadowing.config.json",
    "test/samples/solidity/TryCatchState.config.json",
    "test/samples/solidity/TryCatchStateNested.config.json",
    "test/samples/solidity/tuple_v04.config.json",
    "test/samples/solidity/TypeBuiltin.config.json",
    "test/samples/solidity/TypeInterfaceId.config.json",
    "test/samples/solidity/TypeMinMax.config.json",
    "test/samples/solidity/UnknownVar.config.json",
    "test/samples/solidity/UntypedVars.config.json",
    "test/samples/solidity/UntypedVarsStorageInference.config.json",
    "test/samples/solidity/VirtualModifier.config.json",
    "test/samples/solidity/VirtualModifierConstructors.config.json",
    "test/samples/solidity/VirtualModifiersVsOverriding.config.json",
    "test/samples/solidity/while_v04.config.json"
];
*/

describe("Interpreter tests", () => {
    const files = [
        //"test/samples/solidity/EncodingTest.config.json",
        //"test/samples/solidity/ABIEncoderV2_Structs.config.json"
        //"test/samples/solidity/public_getters.config.json",
        "test/samples/solidity/AddressLiteralMemberAccess.config.json",
        "test/samples/solidity/CalldataArgPassing.config.json",
        "test/samples/solidity/public_getters.config.json"
    ];

    for (const jsonFile of files) {
        it(jsonFile, async () => {
            const config = await fse.readJson(jsonFile);
            const file = config.file;

            const result = await compileSol(file, "auto");
            const reader = new ASTReader();
            const units = reader.read(result.data);

            assert(result.compilerVersion !== undefined, "Unable to detect compiler version");

            const compiler = new UnitCompiler(result.compilerVersion);

            const jsonCompiler = new JSONConfigTranspiler(
                result.compilerVersion as string,
                compiler.factory,
                compiler.globalUid
            );

            let transpiledDefs: Definition[];
            try {
                transpiledDefs = [...compiler.compile(units)];
            } catch (e) {
                console.error(`Failed transpiling ${jsonFile}`);
                throw e;
            }
            const [methodMap, contractMap] = buildMaps(
                transpiledDefs,
                result.compilerVersion as string
            );

            const mainDefs = [...jsonCompiler.compileConfig(config, methodMap, contractMap)];
            const defs = [...transpiledDefs, ...mainDefs];

            // Uncomment below lines to see compiled maruir file
            // const contents = defs.map((def) => def.pp()).join("\n");
            // const maruirFile = jsonFile.replace(".config.json", ".maruir");

            // fse.writeFileSync(maruirFile, contents, {
            //     encoding: "utf8"
            // });

            const interp = new SolMaruirInterp(defs, true);

            interp.run();

            if (interp.state.failure) {
                console.log(JSON.stringify(interp.state.dump(), undefined, 4));

                throw interp.state.failure;
            }

            if (interp.state.failed) {
                console.error(`Failed interpreting ${jsonFile}`);
            }
            expect(interp.state.failed).not.toBeTruthy();
            console.error(`Success: ${jsonFile}`);
        });
    }
});
