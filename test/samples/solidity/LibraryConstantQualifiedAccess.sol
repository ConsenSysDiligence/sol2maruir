pragma solidity 0.8.4;

library $ {
    uint constant ABC = 100;
    uint constant DEF = 1000;

    string constant strConst = "foo";
    bytes constant bytesConst = hex"abcd";
}

contract Test {
    function verify() public {
        assert($.ABC == 100);
        assert($.DEF == 1000);

        string memory str = $.strConst;

        assert(bytes(str)[0] == "f");
        assert(bytes(str)[1] == "o");
        assert(bytes(str)[2] == "o");
        assert(bytes(str).length == 3);

        bytes memory b = $.bytesConst;

        assert(b[0] == hex"ab");
        assert(b[1] == hex"cd");
        assert(b.length == 2);
    }
}
