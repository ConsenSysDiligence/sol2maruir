pragma solidity ^0.7.6;

contract Calldata {
    function stringArgCopy(string calldata s) external returns (string memory) {
        string memory mS = s;
        return mS;
    }

    function byteArg(byte[] calldata s) external returns (byte) {
        return s[0];
    }

    function byteArgCopy(byte[] calldata s) external returns (byte) {
        byte[] memory mS = s;
        mS[0] = 0x42;
        return mS[0];
    }
}

contract __IRTest__ {
    function main() public {
        Calldata __this__ = new Calldata();
        __testCase69__(__this__);
        __testCase116__(__this__);
        __testCase155__(__this__);
    }

    function __testCase69__(Calldata __this__) internal {
        string memory expect_69_0 = ("abcd");
        string memory ret_69_0 = __this__.stringArgCopy("abcd");
        assert(keccak256(abi.encodePacked(ret_69_0)) == keccak256(abi.encodePacked(expect_69_0)));
    }

    function __testCase116__(Calldata __this__) internal {
        byte expect_116_0 = (byte(0x2b));
        
        byte[] memory input = new byte[](3);

        input[0] = byte(0x2b);
        input[1] = byte(0x02);
        input[2] = byte(0x03);

        byte ret_116_0 = __this__.byteArg(input);
        assert(ret_116_0 == expect_116_0);
    }

    function __testCase155__(Calldata __this__) internal {
        byte expect_155_0 = (byte(0x42));

        byte[] memory input = new byte[](3);

        input[0] = byte(0x2b);
        input[1] = byte(0x02);
        input[2] = byte(0x03);

        byte ret_155_0 = __this__.byteArgCopy(input);
        assert(ret_155_0 == expect_155_0);
    }
}
