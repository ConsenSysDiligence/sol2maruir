pragma solidity 0.7.6;

contract ImplicitStringLiteralFixedByteCasts {
    function main() public {
        bytes memory b = new bytes(1);
        b[0] = bytes1(0x61); // 'a'
        bytes2 b1 = hex"6162"; // 'ab';
        bytes3 b2 = hex"610000"; // 'a\x00\x00'
        bytes3 b3 = hex"616200"; // 'a\x00\x00'

        assert(b[0] == "a");
        assert(b1 == "ab");
        assert(b2 == "a");
        assert(b3 == "ab");
    }
}

contract __IRTest__ {
    function main() public {
        ImplicitStringLiteralFixedByteCasts __this__ = new ImplicitStringLiteralFixedByteCasts();
        __testCase73__(__this__);
    }

    function __testCase73__(ImplicitStringLiteralFixedByteCasts __this__) internal {
        __this__.main();
    }
}
