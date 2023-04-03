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

export function bigIntToHex(value: bigint): string {
    const hex = value.toString(16);

    return hex.length % 2 !== 0 ? "0" + hex : hex;
}

export function keccak256(value: any): Buffer {
    return hexStringToBytes(Utils.keccak256(value));
}

export function encodeParameters(types: any[], ...params: any[]): Buffer {
    return hexStringToBytes(ethAbi.encodeParameters(types, params));
}

export function encodePacked(...args: Array<{ type: string; value: any }>): Buffer {
    return hexStringToBytes(Utils.encodePacked(...args));
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
