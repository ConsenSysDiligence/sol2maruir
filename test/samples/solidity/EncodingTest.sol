import "./utils.sol";

contract EncodingTest {
    function test() public {
        assert(
            BytesLib.isSame(
                abi.encode(true, false),
                hex"00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encode(bytes1(0x01)),
                hex"0100000000000000000000000000000000000000000000000000000000000000"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encode(
                    bytes32(0x0102030405060708091011121314151617181920212223242526272829303132)
                ),
                hex"0102030405060708091011121314151617181920212223242526272829303132"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encode(-123, 123),
                hex"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff85000000000000000000000000000000000000000000000000000000000000007b"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encode([uint256(1), 2, 3]),
                hex"000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encode(address(0xc03c4bF79eB0a0fD5fB75C35AddA741BC90Cf6b4)),
                hex"000000000000000000000000c03c4bf79eb0a0fd5fb75c35adda741bc90cf6b4"
            )
        );
    }
}
