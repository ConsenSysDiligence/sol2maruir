pragma solidity ^0.4.24;

contract Ternary {
    uint private x = 1;
    uint internal y = 1;

    function sqrt(int32 x) public pure returns (int32 y) {
        int32 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = ((x / z) + z) / 2;
        }
    }

    function ternaryInExpressionStatement(uint a) public returns (uint) {
        require(a > 0);
        (a == 1) ? a += 1 : a += 2;
        return a;
    }

    function ternaryNested(uint a) public returns (uint) {
        if ((a == 1) ? ((a <= 1) ? true : false) : false) {
            a += 1;
        } else if ((a <= 1) ? true : ((false == (a <= 2)) ? true : false)) {
            a += 1;
        }
        return a;
    }

    function ternaryNestedFunctionCallArgument(bool b) public returns (int64) {
        int16 x = 1337;
        return sqrt((b ? x = 2 : x = 8));
    }

    function ternaryReturn(uint a) public returns (uint) {
        require(a > 0);
        return ((a == 1) ? a += 1 : a += 2);
    }

    function ternaryReturnMultiple(bool b) public returns (uint, uint) {
        return ((b ? x = 1 : x = 2), (b ? y = 1 : y = 2));
    }

    function ternaryCommonType(bool b) public returns (address) {
        address a = 0xdeadbeef;
        return (b ? a : 0);
    }
}

contract __IRTest__ {
    function main() public {
        Ternary __this__ = new Ternary();
        __testCase238__(__this__);
        __testCase270__(__this__);
        __testCase302__(__this__);
        __testCase334__(__this__);
        __testCase366__(__this__);
        __testCase396__(__this__);
        __testCase426__(__this__);
        __testCase456__(__this__);
        __testCase499__(__this__);
        __testCase544__(__this__);
        __testCase576__(__this__);
        __testCase606__(__this__);
    }

    function __testCase238__(Ternary __this__) internal {
        uint256 expect_238_0 = (uint256(2));
        uint256 ret_238_0 = __this__.ternaryInExpressionStatement(uint256(1));
        assert(ret_238_0 == expect_238_0);
    }

    function __testCase270__(Ternary __this__) internal {
        uint256 expect_270_0 = (uint256(5));
        uint256 ret_270_0 = __this__.ternaryInExpressionStatement(uint256(3));
        assert(ret_270_0 == expect_270_0);
    }

    function __testCase302__(Ternary __this__) internal {
        uint256 expect_302_0 = (uint256(1));
        uint256 ret_302_0 = __this__.ternaryNested(uint256(0));
        assert(ret_302_0 == expect_302_0);
    }

    function __testCase334__(Ternary __this__) internal {
        uint256 expect_334_0 = (uint256(2));
        uint256 ret_334_0 = __this__.ternaryNested(uint256(1));
        assert(ret_334_0 == expect_334_0);
    }

    function __testCase366__(Ternary __this__) internal {
        uint256 expect_366_0 = (uint256(2));
        uint256 ret_366_0 = __this__.ternaryNested(uint256(2));
        assert(ret_366_0 == expect_366_0);
    }

    function __testCase396__(Ternary __this__) internal {
        int64 expect_396_0 = (int64(1));
        int64 ret_396_0 = __this__.ternaryNestedFunctionCallArgument(true);
        assert(ret_396_0 == expect_396_0);
    }

    function __testCase426__(Ternary __this__) internal {
        int64 expect_426_0 = (int64(2));
        int64 ret_426_0 = __this__.ternaryNestedFunctionCallArgument(false);
        assert(ret_426_0 == expect_426_0);
    }

    function __testCase456__(Ternary __this__) internal {
        (uint256 expect_456_0, uint256 expect_456_1) = (uint256(1), uint256(1));
        (uint256 ret_456_0, uint256 ret_456_1) = __this__.ternaryReturnMultiple(true);
        assert(ret_456_0 == expect_456_0);
        assert(ret_456_1 == expect_456_1);
    }

    function __testCase499__(Ternary __this__) internal {
        (uint256 expect_499_0, uint256 expect_499_1) = (uint256(2), uint256(2));
        (uint256 ret_499_0, uint256 ret_499_1) = __this__.ternaryReturnMultiple(false);
        assert(ret_499_0 == expect_499_0);
        assert(ret_499_1 == expect_499_1);
    }

    function __testCase544__(Ternary __this__) internal {
        uint256 expect_544_0 = (uint256(2));
        uint256 ret_544_0 = __this__.ternaryReturn(uint256(1));
        assert(ret_544_0 == expect_544_0);
    }

    function __testCase576__(Ternary __this__) internal {
        uint256 expect_576_0 = (uint256(7));
        uint256 ret_576_0 = __this__.ternaryReturn(uint256(5));
        assert(ret_576_0 == expect_576_0);
    }

    function __testCase606__(Ternary __this__) internal {
        address expect_606_0 = (address(0x0));
        address ret_606_0 = __this__.ternaryCommonType(false);
        assert(ret_606_0 == expect_606_0);
    }
}