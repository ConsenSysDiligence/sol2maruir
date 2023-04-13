pragma solidity ^0.5.10;

contract DoubleUnderscore {
    bool internal locked;
    uint internal x;

    modifier branch(bool flag) {
        uint a;
        if (flag) {
            a = x + 1;
            x = a;
            _;
        } else {
            a = x + 2;
            x = a;
            _;
        }
    }

    modifier branch2(bool flag) {
        uint a;
        if (flag) {
            a = x * 3;
            x = a;
            _;
        } else {
            a = x * 5;
            x = a;
            _;
        }
    }

    function reset() public {
        x = 0;
    }

    function singleMod(bool flag) public branch(flag) returns (uint) {
        uint a = x;
        return a;
    }

    function doubleMod(bool flag) public branch(flag) branch(flag) returns (uint) {
        uint a = x;
        return a;
    }

    function twoMods(bool flag) public branch(flag) branch2(flag) returns (uint) {
        uint a = x;
        return a;
    }
}

contract __IRTest__ {
    function main() public {
        DoubleUnderscore __this__ = new DoubleUnderscore();
        __testCase154__(__this__);
        __testCase183__(__this__);
        __testCase198__(__this__);
        __testCase227__(__this__);
        __testCase242__(__this__);
        __testCase271__(__this__);
        __testCase286__(__this__);
        __testCase315__(__this__);
        __testCase330__(__this__);
    }

    function __testCase154__(DoubleUnderscore __this__) internal {
        uint256 expect_154_0 = (uint256(1));
        uint256 ret_154_0 = __this__.singleMod(true);
        assert(ret_154_0 == expect_154_0);
    }

    function __testCase183__(DoubleUnderscore __this__) internal {
        __this__.reset();
    }

    function __testCase198__(DoubleUnderscore __this__) internal {
        uint256 expect_198_0 = (uint256(2));
        uint256 ret_198_0 = __this__.singleMod(false);
        assert(ret_198_0 == expect_198_0);
    }

    function __testCase227__(DoubleUnderscore __this__) internal {
        __this__.reset();
    }

    function __testCase242__(DoubleUnderscore __this__) internal {
        uint256 expect_242_0 = (uint256(2));
        uint256 ret_242_0 = __this__.doubleMod(true);
        assert(ret_242_0 == expect_242_0);
    }

    function __testCase271__(DoubleUnderscore __this__) internal {
        __this__.reset();
    }

    function __testCase286__(DoubleUnderscore __this__) internal {
        uint256 expect_286_0 = (uint256(4));
        uint256 ret_286_0 = __this__.doubleMod(false);
        assert(ret_286_0 == expect_286_0);
    }

    function __testCase315__(DoubleUnderscore __this__) internal {
        __this__.reset();
    }

    function __testCase330__(DoubleUnderscore __this__) internal {
        uint256 expect_330_0 = (uint256(10));
        uint256 ret_330_0 = __this__.twoMods(false);
        assert(ret_330_0 == expect_330_0);
    }
}