pragma solidity ^0.4.25;

contract Casts {
    function castToChar(byte b) public pure returns (byte c) {
        if (b < 10) return byte(uint8(b) + 0x30); else return byte(uint8(b) + 0x57);
    }

    function castToString(address a) public pure returns (string memory) {
        bytes memory str = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            byte strb = byte(uint8(uint(a) / (2 ** (8 * (19 - i)))));
            byte hi = byte(uint8(strb) / 16);
            byte lo = byte(uint8(strb) - (16 * uint8(hi)));
            str[2 * i] = castToChar(hi);
            str[(2 * i) + 1] = castToChar(lo);
        }
        return string(str);
    }

    function castToUpper(string memory str) public pure returns (string memory) {
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

    function castToUint(string memory self) public view returns (uint result) {
        bytes memory b = bytes(self);
        uint i;
        result = 0;
        for (i = 0; i < b.length; i++) {
            uint c = uint(b[i]);
            if ((c >= 48) && (c <= 57)) {
                result = (result * 10) + (c - 48);
            }
        }
    }
}

contract __IRTest__ {
    function main() public {
        Casts __this__ = new Casts();
        __testCase284__(__this__);
        __testCase316__(__this__);
        __testCase348__(__this__);
        __testCase386__(__this__);
        __testCase424__(__this__);
    }

    function __testCase284__(Casts __this__) internal {
        byte expect_284_0 = (byte(0x7c));
        byte ret_284_0 = __this__.castToChar(byte(0x25));
        assert(ret_284_0 == expect_284_0);
    }

    function __testCase316__(Casts __this__) internal {
        byte expect_316_0 = (byte(0x35));
        byte ret_316_0 = __this__.castToChar(byte(0x05));
        assert(ret_316_0 == expect_316_0);
    }

    function __testCase348__(Casts __this__) internal {
        string memory expect_348_0 = ("14723a09acff6d2a60dcdf7aa4aff308fddc160c");
        string memory ret_348_0 = __this__.castToString(address(0x14723a09acff6d2a60dcdf7aa4aff308fddc160c));
        assert(keccak256(abi.encodePacked(ret_348_0)) == keccak256(abi.encodePacked(expect_348_0)));
    }

    function __testCase386__(Casts __this__) internal {
        string memory expect_386_0 = ("AB1C2Y3XYZ");
        string memory ret_386_0 = __this__.castToUpper("ab1c2y3xyz");
        assert(keccak256(abi.encodePacked(ret_386_0)) == keccak256(abi.encodePacked(expect_386_0)));
    }

    function __testCase424__(Casts __this__) internal {
        uint256 expect_424_0 = (uint256(11233));
        uint256 ret_424_0 = __this__.castToUint("te1st123xy3z");
        assert(ret_424_0 == expect_424_0);
    }
}