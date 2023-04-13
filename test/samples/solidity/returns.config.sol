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

contract __IRTest__ {
    function main() public {
        Returns __this__ = new Returns();
        __testCase211__(__this__);
        __testCase256__(__this__);
        __testCase298__(__this__);
        __testCase351__(__this__);
        __testCase386__(__this__);
        __testCase431__(__this__);
        __testCase460__(__this__);
        __testCase502__(__this__);
        __testCase544__(__this__);
        __testCase586__(__this__);
        __testCase644__(__this__);
    }

    function __testCase211__(Returns __this__) internal {
        (uint256 expect_211_0, uint256 expect_211_1) = (uint256(1), uint256(2));
        (uint256 ret_211_0, uint256 ret_211_1) = __this__.mixedReturn1(uint256(777));
        assert(ret_211_0 == expect_211_0);
        assert(ret_211_1 == expect_211_1);
    }

    function __testCase256__(Returns __this__) internal {
        (uint256 expect_256_0, uint256 expect_256_1) = (uint256(0), uint256(10));
        (uint256 ret_256_0, uint256 ret_256_1) = __this__.mixedReturn2(uint256(777));
        assert(ret_256_0 == expect_256_0);
        assert(ret_256_1 == expect_256_1);
    }

    function __testCase298__(Returns __this__) internal {
        uint256[3] memory expect_298_0 = ([uint256(0), uint256(0), uint256(0)]);
        uint256[3] memory ret_298_0 = __this__.returnImplicitCopy();
        assert(keccak256(abi.encodePacked(ret_298_0)) == keccak256(abi.encodePacked(expect_298_0)));
    }

    function __testCase351__(Returns __this__) internal {
        uint256 expect_351_0 = (uint256(9));
        uint256 ret_351_0 = __this__.addOne(uint256(8));
        assert(ret_351_0 == expect_351_0);
    }

    function __testCase386__(Returns __this__) internal {
        (uint256 expect_386_0, uint256 expect_386_1) = (uint256(6), uint256(10));
        (uint256 ret_386_0, uint256 ret_386_1) = __this__.addOneTwice(uint256(5), uint256(9));
        assert(ret_386_0 == expect_386_0);
        assert(ret_386_1 == expect_386_1);
    }

    function __testCase431__(Returns __this__) internal {
        uint256 expect_431_0 = (uint256(100));
        uint256 ret_431_0 = __this__.deadCodeAfterReturn(uint256(100));
        assert(ret_431_0 == expect_431_0);
    }

    function __testCase460__(Returns __this__) internal {
        (uint256 expect_460_0, uint256 expect_460_1) = (uint256(2), uint256(1));
        (uint256 ret_460_0, uint256 ret_460_1) = __this__.paramReturnSwap();
        assert(ret_460_0 == expect_460_0);
        assert(ret_460_1 == expect_460_1);
    }

    function __testCase502__(Returns __this__) internal {
        (uint256 expect_502_0, uint256 expect_502_1) = (uint256(1), uint256(2));
        (uint256 ret_502_0, uint256 ret_502_1) = __this__.noArgReturn();
        assert(ret_502_0 == expect_502_0);
        assert(ret_502_1 == expect_502_1);
    }

    function __testCase544__(Returns __this__) internal {
        (uint256 expect_544_0, int16 expect_544_1) = (uint256(0), int16(0));
        (uint256 ret_544_0, int16 ret_544_1) = __this__.noArgReturnDefaults();
        assert(ret_544_0 == expect_544_0);
        assert(ret_544_1 == expect_544_1);
    }

    function __testCase586__(Returns __this__) internal {
        (uint256 expect_586_0, uint256 expect_586_1, uint256 expect_586_2) = (uint256(2), uint256(1), uint256(2));
        (uint256 ret_586_0, uint256 ret_586_1, uint256 ret_586_2) = __this__.paramReturnSwap2();
        assert(ret_586_0 == expect_586_0);
        assert(ret_586_1 == expect_586_1);
        assert(ret_586_2 == expect_586_2);
    }

    function __testCase644__(Returns __this__) internal {
        (uint256 expect_644_0, uint256 expect_644_1) = (uint256(1), uint256(2));
        (uint256 ret_644_0, uint256 ret_644_1) = __this__.paramReturnAssignments(uint256(100));
        assert(ret_644_0 == expect_644_0);
        assert(ret_644_1 == expect_644_1);
    }
}