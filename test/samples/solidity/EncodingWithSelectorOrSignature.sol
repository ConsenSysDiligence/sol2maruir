import "./utils.sol";
pragma solidity ^0.6.9;

contract Test {
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;

    function testEncodeWithSelector() public {
        assert(
            BytesLib.isSame(
                abi.encodeWithSelector(TRANSFER_SELECTOR, uint256(1), uint256(2)),
                hex"a9059cbb00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodeWithSelector(bytes4(keccak256("dummyStringArg(string memory)")), "test"),
                hex"070fd91b000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000047465737400000000000000000000000000000000000000000000000000000000"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodeWithSelector(bytes4(keccak256("dummyNoArgs()"))),
                hex"b8829e34"
            )
        );
    }

    function testEncodeWithSignature() public {
        assert(
            BytesLib.isSame(
                abi.encodeWithSignature("execute(uint256,int16)", uint256(1), int16(2)),
                hex"1ee3aff300000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002"
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodeWithSignature("dummyStringArg(string memory)", "test"),
                abi.encodeWithSelector(bytes4(keccak256("dummyStringArg(string memory)")), "test")
            )
        );

        assert(
            BytesLib.isSame(
                abi.encodeWithSignature("dummyNoArgs()"),
                abi.encodeWithSelector(bytes4(keccak256("dummyNoArgs()")))
            )
        );
    }
}
