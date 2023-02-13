import { ComplexValue, PointerVal, State } from "maru-ir2";
import * as sol from "solc-typed-ast";
import { assert, InferType, LatestCompilerVersion } from "solc-typed-ast";

const Utils = require("web3-utils");
const ethAbi = require("web3-eth-abi");

/**
 * Converts HEX string to an array of bytes, represented by `NumberValue`s.
 */
export function hexStringToBytes(hexStr: string): Buffer {
    if (hexStr.startsWith("0x")) {
        hexStr = hexStr.slice(2);
    }

    return Buffer.from(hexStr, "hex");
}

export function keccak256(value: any): Buffer {
    return hexStringToBytes(Utils.keccak256(value));
}

export function encodeParameters(types: any[], ...params: any): Buffer {
    return hexStringToBytes(ethAbi.encodeParameters(types, params));
}

export function bigIntToHex(value: bigint): string {
    const hex = value.toString(16);

    return hex.length % 2 !== 0 ? "0" + hex : hex;
}

export function encodeWithSelector(
    selector: Buffer | string,
    types: any[],
    ...params: any
): Buffer {
    if (typeof selector === "string") {
        selector = Buffer.from(selector, "hex");
    }

    return Buffer.concat([selector, encodeParameters(types, ...params)]);
}

export function encodeWithSignature(sig: string, types: any[], ...params: any): Buffer {
    const selector = keccak256(sig).slice(0, 4);

    return encodeWithSelector(selector, types, ...params);
}

export function decodeParameters(types: any[], data: string): any {
    return ethAbi.decodeParameters(types, data);
}

/**
 * @todo This is a hack. Fixgure out better way.
 */
const infer = new InferType(LatestCompilerVersion);
const RX_ARRAY = /\[(\d+)?\]$/;
const RX_TUPLE = /^tuple\((.+)?\)$/;

function abiTypeStringToTypeNode(t: string): sol.TypeNode {
    let m = t.match(RX_ARRAY);

    if (m) {
        const baseT = abiTypeStringToTypeNode(t.slice(0, m.index));
        const size = m[1] === null ? undefined : BigInt(m[1]);

        return new sol.ArrayType(baseT, size);
    }

    m = t.match(RX_TUPLE);

    if (m) {
        const elements = m[1] === null ? [] : m[1].split(",");
        const elementTs = elements.map(abiTypeStringToTypeNode);

        return new sol.TupleType(elementTs);
    }

    const elementaryT = infer.elementaryTypeNameStringToTypeNode(t);

    assert(elementaryT !== undefined, "Expected elementary type, got {0}", t);

    return elementaryT;
}

export function deref(state: State, ptr: PointerVal): ComplexValue {
    const mem = state.memories.get(ptr[0]);

    assert(mem !== undefined, `Memory {0} not found.`, ptr[0]);

    const val = mem.get(ptr[1]);

    assert(val !== undefined, `Pointer ${ptr[1]} in ${ptr[0]} is undefined`);

    return val;
}

/**
 * Converts IR value to Web3-compatible value.
 *
 * @see https://web3js.readthedocs.io/en/v1.2.6/web3-eth-abi.html#encodeparameters
 * @see https://github.com/web3/web3.js/blob/5807398c7647a9c31a61bc8a114722779c8d1848/packages/web3-eth-abi/src/index.js#L100
 * @see https://github.com/ethers-io/ethers.js/blob/0bf53d7804109f5c0322d8c9a0c10d73abc84136/src.ts/abi/abi-coder.ts#L126
 *
 * @todo Fix this in case when values has nested pointers.
 * This would probably require recursive dereferencing, also avoiding map values somehow.
 */
export function toWeb3Value(arg: any, abiType: string, s: State): any {
    const type = abiTypeStringToTypeNode(abiType);

    if (type instanceof sol.BoolType) {
        assert(
            typeof arg === "boolean",
            `Expected boolean value for ABI type "${abiType}", got ${arg} of type "${typeof arg}"`
        );

        return arg;
    }

    if (type instanceof sol.IntType) {
        assert(
            typeof arg === "bigint",
            `Expected bigint value for ABI type "${abiType}", got ${arg} of type "${typeof arg}"`
        );

        return arg;
    }

    if (type instanceof sol.AddressType || type instanceof sol.FixedBytesType) {
        assert(
            typeof arg === "bigint",
            `Expected bigint value for ABI type "${abiType}", got ${arg} of type "${typeof arg}"`
        );

        return "0x" + bigIntToHex(arg);
    }

    if (type instanceof sol.ArrayType) {
        const struct = deref(s, arg);

        assert(struct instanceof Map, "Expected struct pointer for array type, got {0}", arg);

        // const len = arr.get("len");

        const arrPtr = struct.get("arr");

        assert(
            arrPtr !== undefined,
            "Expected nested array pointer for array type, got {0}",
            struct
        );

        const arrVal = deref(s, arrPtr as PointerVal);

        // console.error(arrVal);

        return arrVal;
    }

    if (type instanceof sol.TupleType) {
        const struct = deref(s, arg);

        // console.error(struct);

        return [...struct.values()];
    }

    throw new Error(`NYI toWeb3Value of ABI type ${abiType}`);
}
