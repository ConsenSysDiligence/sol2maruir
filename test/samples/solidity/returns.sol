pragma solidity ^0.4.24;

contract Returns {
    uint[3] a1;
    uint internal y = 1;

    function mixedReturn1(uint x) public returns (uint, uint a) {
        a = 10;

        return (1, 2);
    }

    function mixedReturn2(uint x) public returns (uint, uint a) {
        a = 10;
    }

    function returnImplicitCopy() public returns (uint[3] memory) {
        return a1;
    }

    function addOne(uint a) public returns (uint) {
        return a + 1;
    }

    function addOneTwice(uint a, uint b) public returns (uint, uint) {
        return (addOne(a), addOne(b));
    }

    function paramReturnAssignments(uint a) public returns (uint b, uint) {
        a = a + 1;
        a = 1;
        b = 2;

        return (a, b); // this returns (1,2)
    }

    function paramReturnSwap() public returns (uint a, uint b) {
        a = 1;
        b = 2;

        return (b, a); // should return 2,1
    }

    function noArgReturn() public returns (uint a, uint b) {
        a = 1;
        b = 2;

        return; // should return 1,2
    }

    function noArgReturnDefaults() public returns (uint a, int16 b) {
        return; // should return 0,0
    }

    function paramReturnSwap2() public returns (uint a, uint b, uint c) {
        a = 1;
        b = 2;

        return (b, a, 2); // should return 2,1,2
    }

    function deadCodeAfterReturn(uint x) public returns (uint) {
        return x;
        y = 2;
    }
}
