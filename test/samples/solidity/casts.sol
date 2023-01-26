pragma solidity ^0.4.25;

contract Casts {
    function castToChar(byte b) pure returns (byte c) {
        if (b < 10) return byte(uint8(b) + 0x30);
        else return byte(uint8(b) + 0x57);
    }

    function castToString(address a) public pure returns (string memory) {
        bytes memory str = new bytes(40);

        for (uint i = 0; i < 20; i++) {
            byte strb = byte(uint8(uint(a) / (2**(8*(19 - i)))));

            byte hi = byte(uint8(strb) / 16);
            byte lo = byte(uint8(strb) - 16 * uint8(hi));

            str[2*i] = castToChar(hi);
            str[2*i+1] = castToChar(lo);
        }

        return string(str);
    }

    function castToUpper(string memory str) pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bUpper = new bytes(bStr.length);
        for (uint i = 0; i < bStr.length; i++) {
            if ((bStr[i] >= 97) && (bStr[i] <= 122)) {
                bUpper[i] = byte(int(bStr[i]) - 32);
            } else {
                bUpper[i] = bStr[i];
            }
        }
        return string(bUpper);
    }

    function castToUint(string memory self) view returns (uint result) {
        bytes memory b = bytes(self);
        uint i;
        result = 0;
        for (i = 0; i < b.length; i++) {
            uint c = uint(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
    }
}
