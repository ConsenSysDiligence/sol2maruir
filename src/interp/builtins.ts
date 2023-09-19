import * as ir from "maru-ir2";
import { eq, getTypeRange, noSrc, Resolving, StructValue } from "maru-ir2";
import * as sol from "solc-typed-ast";
import { assert } from "solc-typed-ast";
import {
    bigIntToHex,
    decodeParameters,
    encodePacked,
    encodeParameters,
    encodeWithSelector,
    encodeWithSignature,
    fixTupleType,
    hexStringToBytes,
    keccak256
} from "../utils";

export type ContractRegistry = Map<bigint, [ir.Type, ir.PrimitiveValue]>;

const RX_ARRAY = /\[(\d+)?\]$/;

/**
 * @todo Restore as `/^tuple\((.+)?\)$/` after https://github.com/web3/web3.js/issues/6307 is fixed in upstream.
 */
const RX_TUPLE = /^(tuple)?\((.+)?\)$/;

function abiTypeStringToTypeNode(t: string): sol.TypeNode {
    let m = t.match(RX_ARRAY);

    if (m) {
        const baseT = abiTypeStringToTypeNode(t.slice(0, m.index));
        const size = m[1] === null || m[1] === undefined ? undefined : BigInt(m[1]);

        return new sol.ArrayType(baseT, size);
    }

    m = t.match(RX_TUPLE);

    if (m) {
        const elements = m[2] === null ? [] : m[2].split(",");
        const elementTs = elements.map(abiTypeStringToTypeNode);

        return new sol.TupleType(elementTs);
    }

    const elementaryT = sol.InferType.elementaryTypeNameStringToTypeNode(t);

    sol.assert(elementaryT !== undefined, "Expected elementary type, got {0}", t);

    return elementaryT;
}

export function packedArrPtrToBuf(s: ir.State, ptr: ir.PointerVal): Buffer {
    const val = s.deref(ptr);

    assert(
        val instanceof StructValue && val.has("arr"),
        `Expected array struct for packed array decoding, not {0}`,
        val
    );

    const arrPtr = val.get("arr") as ir.PointerVal;
    const arrVal = s.deref(arrPtr);

    assert(arrVal instanceof Array, `Expected array for packed array decoding, not {0}`, arrVal);

    return Buffer.from(arrVal.map((v) => Number(v)));
}

export function decodeBytes(s: ir.State, ptr: ir.PointerVal): string {
    return packedArrPtrToBuf(s, ptr).toString("hex");
}

export function decodeString(s: ir.State, ptr: ir.PointerVal): string {
    return packedArrPtrToBuf(s, ptr).toString("utf-8");
}

export function defineArrStruct(
    s: ir.State,
    inMem: string,
    values: ir.PrimitiveValue[]
): ir.PointerVal {
    const arrPtr = s.define(values, inMem);

    const struct = new StructValue({
        arr: arrPtr,
        len: BigInt(values.length),
        capacity: BigInt(values.length)
    });

    const res = s.define(struct, inMem);
    return res;
}

export function defineString(s: ir.State, str: string, inMem: string): ir.PointerVal {
    const bigIntArr: bigint[] = [];

    for (let i = 0; i < str.length; i++) {
        bigIntArr.push(BigInt(str.charCodeAt(i)));
    }

    return defineArrStruct(s, inMem, bigIntArr);
}

export function defineBytes(s: ir.State, bytes: Buffer, inMem: string): ir.PointerVal {
    const bigIntArr = Array.from(bytes).map(BigInt);

    return defineArrStruct(s, inMem, bigIntArr);
}

/**
 * Converts IR value to Web3-compatible value.
 *
 * @see https://web3js.readthedocs.io/en/v1.2.6/web3-eth-abi.html#encodeparameters
 * @see https://github.com/web3/web3.js/blob/5807398c7647a9c31a61bc8a114722779c8d1848/packages/web3-eth-abi/src/index.js#L100
 * @see https://github.com/ethers-io/ethers.js/blob/0bf53d7804109f5c0322d8c9a0c10d73abc84136/src.ts/abi/abi-coder.ts#L126
 */
export function toWeb3Value(val: any, abiType: string | sol.TypeNode, s: ir.State): any {
    const type = abiType instanceof sol.TypeNode ? abiType : abiTypeStringToTypeNode(abiType);

    if (type instanceof sol.BoolType) {
        assert(
            typeof val === "boolean",
            `Expected boolean value for ABI type "{0}", got {1} of type "{2}"`,
            abiType,
            val,
            typeof val
        );

        return val;
    }

    if (type instanceof sol.IntType) {
        assert(
            typeof val === "bigint",
            `Expected bigint value for ABI type "{0}", got {1} of type "{2}"`,
            abiType,
            val,
            typeof val
        );

        return val;
    }

    if (type instanceof sol.AddressType || type instanceof sol.FixedBytesType) {
        assert(
            typeof val === "bigint",
            `Expected bigint value for ABI type "{0}", got {1} of type "{2}"`,
            abiType,
            val,
            typeof val
        );

        const width = type instanceof sol.AddressType ? 40 : type.size * 2;

        return "0x" + bigIntToHex(val).padStart(width, "0");
    }

    if (type instanceof sol.StringType) {
        return decodeString(s, val);
    }

    if (type instanceof sol.BytesType) {
        return "0x" + decodeBytes(s, val);
    }

    if (type instanceof sol.ArrayType) {
        const struct = s.deref(val);

        assert(
            struct instanceof StructValue && struct.has("arr"),
            "Expected struct pointer for array type, got {0}",
            val
        );

        const arrPtr = struct.get("arr");

        assert(
            arrPtr instanceof Array,
            "Expected nested array pointer for array type, got {0}",
            struct
        );

        const arrVal = s.deref(arrPtr);

        assert(arrVal instanceof Array, "Expeced array value, got {0}", arrVal);

        const t = type.elementT;

        return arrVal.map((v) => toWeb3Value(v, t, s));
    }

    if (type instanceof sol.TupleType) {
        const struct = s.deref(val);

        assert(struct instanceof ir.StructValue, `Expected a struct not {0} of type`, struct);

        let vals: ir.PrimitiveValue[];

        if (struct.has("arr") && struct.has("capacity") && struct.has("len")) {
            // Fixed size array converted to tuple
            vals = s.deref(struct.get("arr") as ir.PointerVal) as ir.PrimitiveValue[];
        } else {
            // Normal struct
            vals = [...struct.values()];
        }

        const res = [];

        for (let i = 0; i < type.elements.length; i++) {
            const t = type.elements[i];

            /**
             * @todo NYI avoid mappings.
             * This means that type and value may not follow "one-to-one" rule here.
             * Current implementation is very fragile.
             */
            const v = vals[i];

            assert(t !== null, `Unexpected null tuple element in toWeb3Value`);

            res.push(toWeb3Value(v, t, s));
        }

        return res;
    }

    throw new Error(`NYI toWeb3Value of ABI type ${abiType}`);
}

/**
 * Converts a Web3-compatible value to an IR value
 */
export function fromWeb3Value(
    val: any,
    abiType: string | sol.TypeNode,
    irType: ir.Type,
    state: ir.State,
    scope: ir.Scope
): ir.PrimitiveValue {
    const type = abiType instanceof sol.TypeNode ? abiType : abiTypeStringToTypeNode(abiType);

    if (type instanceof sol.BoolType) {
        assert(
            typeof val === "boolean",
            'Expected boolean value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        return val;
    }

    if (type instanceof sol.IntType) {
        assert(
            typeof val === "string" || typeof val === "bigint",
            'Expected string/bigint value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        return BigInt(val);
    }

    if (type instanceof sol.AddressType || type instanceof sol.FixedBytesType) {
        assert(
            typeof val === "string" || typeof val === "bigint",
            'Expected string/bigint value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        return BigInt(val);
    }

    if (type instanceof sol.StringType) {
        assert(
            typeof val === "string",
            'Expected string value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        return defineString(state, val, "memory");
    }

    if (type instanceof sol.BytesType) {
        assert(
            typeof val === "string",
            `Expected string igint value for ABI type "${abiType}", got ${val} of type "${typeof val}"`
        );

        return defineBytes(state, Buffer.from(val.slice(2), "hex"), "memory");
    }

    if (type instanceof sol.ArrayType) {
        assert(
            val instanceof Array,
            'Expected array value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        assert(
            irType instanceof ir.PointerType &&
                irType.toType instanceof ir.UserDefinedType &&
                irType.toType.name === "ArrWithLen" &&
                irType.toType.typeArgs.length == 1,
            "Expected ir type to ArrWithLen not {0}",
            irType
        );

        const irVals = val.map((v) =>
            fromWeb3Value(
                v,
                type.elementT,
                (irType.toType as ir.UserDefinedType).typeArgs[0],
                state,
                scope
            )
        );

        const irValsPtr = state.define(irVals, "memory");

        const arrWithLenM = new StructValue({
            arr: irValsPtr,
            len: BigInt(irVals.length),
            capacity: BigInt(irVals.length)
        });

        return state.define(arrWithLenM, "memory");
    }

    if (type instanceof sol.TupleType) {
        assert(
            val instanceof Array && val.length === type.elements.length,
            'Expected array value for ABI type "{0}", got {1} of type "{2}"',
            abiType,
            val,
            typeof val
        );

        assert(
            irType instanceof ir.PointerType && irType.toType instanceof ir.UserDefinedType,
            "Expected ir type to be a pointer to user-defined type not {0}",
            irType
        );

        const irStruct = scope.get(irType.toType.name);

        assert(
            irStruct instanceof ir.StructDefinition,
            "Expected ir type to be a struct not {0}",
            irStruct
        );

        const entries: { [field: string]: ir.PrimitiveValue } = {};

        for (let i = 0; i < type.elements.length; i++) {
            const [irFieldName, irFieldT] = irStruct.fields[i];
            const irEl = fromWeb3Value(
                val[i],
                type.elements[i] as sol.TypeNode,
                irFieldT,
                state,
                scope
            );

            entries[irFieldName] = irEl;
        }

        return state.define(new ir.StructValue(entries), "memory");
    }

    throw new Error(`NYI toWeb3Value of ABI type ${abiType}`);
}

export function builtin_register_contact(
    registry: ContractRegistry,
    type: ir.Type,
    ptr: ir.PrimitiveValue
): bigint {
    const newAddr = BigInt(registry.size);

    registry.set(newAddr, [type, ptr]);

    return newAddr;
}

export function builtin_is_contract_at(
    registry: ContractRegistry,
    addr: bigint,
    type: ir.Type
): boolean {
    const typAndPtr = registry.get(addr);

    if (typAndPtr) {
        return eq(typAndPtr[0], type);
    }

    return false;
}

export function builtin_get_contract_at(
    registry: ContractRegistry,
    s: ir.State,
    addr: bigint,
    type: ir.Type
): ir.PrimitiveValue {
    const typAndPtr = registry.get(addr);

    if (!typAndPtr || !eq(typAndPtr[0], type)) {
        throw new ir.InterpError(
            noSrc,
            `No contract at ${addr} or contract not of type ${type.pp()}`,
            s
        );
    }

    return typAndPtr[1];
}

export function builtin_bin_op_overflows(frame: ir.BuiltinFrame, op: string): boolean {
    if (op === "**") {
        assert(frame.typeArgs.length === 2, `Expected two type arg to builtin_<{0}>_overflows`, op);
    } else {
        assert(frame.typeArgs.length === 1, `Expected one type arg to builtin_<{0}>_overflows`, op);
    }

    const typ = frame.typeArgs[0];

    assert(typ instanceof ir.IntType, `Expected an int type not ${typ.pp()}`);

    const x = frame.args[0][1];
    const y = frame.args[1][1];

    const [min, max] = getTypeRange(typ.nbits, typ.signed);

    assert(typeof x === "bigint" && typeof y === "bigint", ``);

    let res: bigint;

    if (op === "+") {
        res = x + y;
    } else if (op === "-") {
        res = x - y;
    } else if (op === "*") {
        res = x * y;
    } else if (op === "/") {
        res = x / y;
    } else if (op === "**") {
        res = x ** y;
    } else {
        throw new Error(`NYI op ${op}`);
    }

    const inRange = min <= res && res <= max;

    return !inRange;
}

export function builtin_un_op_overflows(frame: ir.BuiltinFrame, op: string): boolean {
    assert(frame.typeArgs.length === 1, `Expected one type arg to builtin_un_overflows`);

    const typ = frame.typeArgs[0];

    assert(typ instanceof ir.IntType, `Expected an int type not ${typ.pp()}`);

    const x = frame.args[0][1];

    const [min, max] = getTypeRange(typ.nbits, typ.signed);

    assert(typeof x === "bigint", ``);

    const res: bigint = -x;

    assert(op === "-", "NYI unary op overflow for {0}", op);

    const inRange = min <= res && res <= max;

    return !inRange;
}

export function builtin_encodeWithSignature(s: ir.State, frame: ir.BuiltinFrame): ir.PointerVal {
    assert(
        frame.args.length === 2 * frame.typeArgs.length + 1,
        `Unexpected number of type args ({0}) and actual args ({1}) in builtin_encodeWithSignature`,
        frame.typeArgs.length,
        frame.args.length
    );

    const sigPtr = frame.args[0][1];

    const argVals: ir.PrimitiveValue[] = [];
    const abiTypes: string[] = [];

    for (let i = 0; i < frame.typeArgs.length; i++) {
        const typePtr = frame.args[i * 2 + 1][1];
        const value = frame.args[i * 2 + 2][1];

        assert(typePtr instanceof Array, ``);

        const abiT = fixTupleType(decodeString(s, typePtr));
        const web3V = toWeb3Value(value, abiT, s);

        abiTypes.push(abiT);
        argVals.push(web3V);
    }

    assert(sigPtr instanceof Array, ``);

    const signature = decodeString(s, sigPtr);

    // console.error(`Signature: ${signature} abi types: ${ir.pp(abiTypes)} arg: ${ir.pp(argVals)}`);
    const result = encodeWithSignature(signature, abiTypes, ...argVals);
    // console.error(result.toString("hex"));

    return defineBytes(s, result, "memory");
}

export function builtin_encodeWithSelector(s: ir.State, frame: ir.BuiltinFrame): ir.PointerVal {
    assert(
        frame.args.length === 2 * frame.typeArgs.length + 1,
        `Unexpected number of type args ({0}) and actual args ({1}) in builtin_encodeWithSelector`,
        frame.typeArgs.length,
        frame.args.length
    );

    const selector = frame.args[0][1];

    const argVals: ir.PrimitiveValue[] = [];
    const abiTypes: string[] = [];

    for (let i = 0; i < frame.typeArgs.length; i++) {
        const typePtr = frame.args[i * 2 + 1][1];
        const value = frame.args[i * 2 + 2][1];

        assert(typePtr instanceof Array, ``);

        const abiT = fixTupleType(decodeString(s, typePtr));
        const web3V = toWeb3Value(value, abiT, s);

        abiTypes.push(abiT);
        argVals.push(web3V);
    }

    assert(typeof selector === "bigint", `Expected bigint for selector not {0}`, selector);

    // console.error(`Selector : ${selector} abi types: ${ir.pp(abiTypes)} arg: ${ir.pp(argVals)}`);
    const result = encodeWithSelector(selector.toString(16), abiTypes, ...argVals);
    // console.error(result.toString("hex"));

    return defineBytes(s, result, "memory");
}

export function getLastSolidityFun(s: ir.State): ir.FunctionDefinition {
    for (let i = s.stack.length; i >= 0; i--) {
        const frame = s.stack[i];

        if (frame instanceof ir.Frame) {
            return frame.fun;
        }
    }

    throw new Error(`No Solidity function in stack`);
}

export function builtin_decode(
    resolving: Resolving,
    s: ir.State,
    frame: ir.BuiltinFrame,
    byteOff: number
): ir.PrimitiveValue[] | undefined {
    assert(
        frame.args.length == frame.typeArgs.length + 1,
        "Bad number of args {0}",
        frame.args.length
    );

    const dataPtr = frame.args[0][1];

    assert(dataPtr instanceof Array, "Expected pointer, got {0}", dataPtr);

    let data = decodeBytes(s, dataPtr);

    if (byteOff !== 0) {
        data = data.slice(byteOff * 2);
    }

    const abiTypeNames: string[] = [];

    for (let i = 1; i < frame.args.length; i++) {
        const typePtr = frame.args[i][1];

        assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

        const abiT = fixTupleType(decodeString(s, typePtr));

        abiTypeNames.push(abiT);
    }

    let web3Vals: any[];

    // console.error(`Decode data: ${data} abiTypeNames: ${abiTypeNames}`);
    try {
        web3Vals = decodeParameters(abiTypeNames, data) as any[];
    } catch (e) {
        console.error(`Error decoding ${data} to (${abiTypeNames.join(", ")})`);
        return undefined;
    }

    // console.error("Decode vals:", web3Vals);
    const lastFun = getLastSolidityFun(s);

    const scope = resolving.getScope(lastFun);

    const res: ir.PrimitiveValue[] = [];

    for (let i = 0; i < abiTypeNames.length; i++) {
        res.push(fromWeb3Value(web3Vals[i], abiTypeNames[i], frame.typeArgs[i], s, scope));
    }

    return res;
}

export function builtin_encode(s: ir.State, frame: ir.BuiltinFrame): ir.PointerVal {
    if (frame.args.length === 0) {
        return defineBytes(s, Buffer.from(""), "memory");
    }

    assert(
        frame.args.length % 2 === 0,
        "Expected even count of args for builtin_encode, got {0}",
        frame.args.length
    );

    const abiTs: string[] = [];
    const abiVs: any[] = [];

    for (let i = 1; i < frame.args.length; i += 2) {
        const typePtr = frame.args[i - 1][1];
        const value = frame.args[i][1];

        assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

        const abiT = fixTupleType(decodeString(s, typePtr));
        const abiV = toWeb3Value(value, abiT, s);

        abiTs.push(abiT);
        abiVs.push(abiV);
    }

    const bytes = encodeParameters(abiTs, ...abiVs);

    // console.error(bytes.toString("hex"), abiTs, abiVs);

    const ptr = defineBytes(s, bytes, "memory");

    // console.error(ptr);

    return ptr;
}

export function builtin_encodePacked(s: ir.State, frame: ir.BuiltinFrame): ir.PointerVal {
    if (frame.args.length === 0) {
        return defineBytes(s, Buffer.from(""), "memory");
    }

    assert(
        frame.args.length % 2 === 0,
        "Expected even count of args for builtin_encodePacked, got {0}",
        frame.args.length
    );

    const abiArgs: Array<{ type: string; value: any }> = [];

    for (let i = 1; i < frame.args.length; i += 2) {
        const typePtr = frame.args[i - 1][1];
        const value = frame.args[i][1];

        assert(typePtr instanceof Array, "Expected pointer, got {0}", typePtr);

        const abiT = fixTupleType(decodeString(s, typePtr));
        const abiV = toWeb3Value(value, abiT, s);

        abiArgs.push({ type: abiT, value: abiV });
    }

    const bytes = encodePacked(...abiArgs);

    // console.error(bytes.toString("hex"), abiArgs);

    const ptr = defineBytes(s, bytes, "memory");

    // console.error(ptr);

    return ptr;
}

export function builtin_keccak256_05(s: ir.State, frame: ir.BuiltinFrame): ir.PrimitiveValue {
    const [[, bytesPtr]] = frame.args;

    assert(bytesPtr instanceof Array, ``);

    const bytes = decodeBytes(s, bytesPtr);

    // console.error(`builtin_keccak256_05: input "${bytes}"`);

    /**
     * Edge cases:
     * - Upstream library returns `null` for empty bytes. So, we compensate.
     * - Solc 0.4 returns empty hash when no arguments provided.
     *
     * @see https://github.com/ethereum/web3.js/blob/2.x/packages/web3-utils/src/Utils.js#L497-L511
     */
    const result =
        bytes.length === 0
            ? hexStringToBytes("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
            : keccak256(bytes);

    const hash = "0x" + result.toString("hex");

    // console.error(`builtin_keccak256_05: result "${hash}"`);

    return BigInt(hash);
}
