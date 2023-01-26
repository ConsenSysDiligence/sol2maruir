pragma solidity ^0.7.5;

uint constant SOME_CONST = 100;
uint constant SOME_OTHER = 15;
uint constant SOME_ELSE = SOME_CONST + SOME_OTHER;

string constant FOO = "abcd";
bytes constant BOO = bytes("abcd");

contract Test {
    uint constant STATE_CONST = 20;

    function verifyNumConsts() public {
        assert(SOME_CONST == 100);
        assert(SOME_OTHER == 15);
        assert(SOME_ELSE == 115);
        assert(STATE_CONST == 20);

        uint a = SOME_CONST + SOME_OTHER + SOME_ELSE + STATE_CONST;

        assert(a == 250);
    }

    function verifyByteConsts() public {
        assert(keccak256(bytes("abcd")) == keccak256(bytes(FOO)));
        assert(keccak256(BOO) == keccak256(bytes(FOO)));
    }

    function verify() public {
        verifyNumConsts();
        verifyByteConsts();
    }
}
