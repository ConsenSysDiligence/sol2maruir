import * as web3Utils from "web3-utils";
import * as web3EthAbi from "web3-eth-abi";

/**
 * Handles https://github.com/web3/web3.js/issues/6307 while it is not fixed in upsteam.
 * @todo Remove on when it is fixed.
 */
export function fixTupleType(type: string): string {
    const RX_TUPLE = /tuple\((.+)\)/g;

    let res = type;

    while (RX_TUPLE.test(res)) {
        res = res.replace(RX_TUPLE, "($1)");
    }

    return res;
}

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
    return hexStringToBytes(web3Utils.keccak256(value));
}

export function encodeParameters(types: any[], ...params: any[]): Buffer {
    return hexStringToBytes(web3EthAbi.encodeParameters(types, params));
}

export function encodePacked(...args: Array<{ type: string; value: any }>): Buffer {
    return hexStringToBytes(web3Utils.encodePacked(...args));
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
    return web3EthAbi.decodeParameters(types, data);
}
