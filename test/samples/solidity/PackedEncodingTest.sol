pragma solidity ^0.4.24;

import "./utils.sol";

contract PackedEncodingTest {
    enum Y {
        A, B, C
    }

    function usesEncodePacked() public {
        assert(BytesLib.isSame(abi.encodePacked(), hex''));
        assert(BytesLib.isSame(abi.encodePacked(true, false), hex'0100'));
        assert(BytesLib.isSame(abi.encodePacked(Y.A, Y.B, Y.C), hex'000102'));
        assert(BytesLib.isSame(abi.encodePacked(1, -256), hex'01ff00'));
        assert(BytesLib.isSame(abi.encodePacked(int8(1), int16(-256)), hex'01ff00'));
        assert(BytesLib.isSame(abi.encodePacked(int8(1), int8(2), int8(3)), hex'010203'));
        assert(BytesLib.isSame(abi.encodePacked(int8(-1), int8(-2), int8(-3)), hex'fffefd'));
        assert(BytesLib.isSame(abi.encodePacked("test"), hex'74657374'));
        assert(BytesLib.isSame(abi.encodePacked("abc", int8(5), int8(-5)), hex'61626305fb'));
        assert(BytesLib.isSame(abi.encodePacked(bytes4(0x506070FF)), hex"506070FF"));
        assert(BytesLib.isSame(abi.encodePacked(hex'00010203FF'), hex'00010203FF'));
        assert(BytesLib.isSame(abi.encodePacked(address(0xc03c4bF79eB0a0fD5fB75C35AddA741BC90Cf6b4)), hex"c03c4bf79eb0a0fd5fb75c35adda741bc90cf6b4"));
        assert(BytesLib.isSame(abi.encodePacked(bytes2(0xddFF), true, false), hex'ddff0100'));
    }

    function usesEncodePackedNestedArray() public {
        assert(
            BytesLib.isSame(
                abi.encodePacked([true, false]),
                hex'00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000'
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodePacked([uint16(0x00ff), 0xffff]),
                hex'00000000000000000000000000000000000000000000000000000000000000ff000000000000000000000000000000000000000000000000000000000000ffff'
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodePacked([Y.B, Y.C]),
                hex'00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002'
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodePacked([address(0xc03c4bF79eB0a0fD5fB75C35AddA741BC90Cf6b4)]),
                hex'000000000000000000000000c03c4bf79eb0a0fd5fb75c35adda741bc90cf6b4'
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodePacked([byte(0xcc), 0xff]),
                hex'cc00000000000000000000000000000000000000000000000000000000000000ff00000000000000000000000000000000000000000000000000000000000000'
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodePacked([[[int8(5), int8(6)]]]),
                hex'00000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000006'
            )
        );
    }
}
