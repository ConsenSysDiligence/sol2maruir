pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

contract Test {
    struct Arg {
        uint val;
    }

    function encode() public returns (bytes memory) {
        Arg[] memory args = new Arg[](3);

        args[0].val = 1;
        args[1].val = 2;
        args[2].val = 3;

        return abi.encode(args);
    }

    function structInArgs(Arg memory a) public pure returns (Arg memory) {
        return a;
    }

    function verify() public {
        // bytes memory encoded = hex"00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003";
        bytes memory encoded = encode();

        Arg[] memory args = abi.decode(encoded, (Arg[]));

        assert(args.length == 3);
        assert(args[0].val == 1);
        assert(args[1].val == 2);
        assert(args[2].val == 3);

        assert(structInArgs(args[1]).val == 2);
    }
}
