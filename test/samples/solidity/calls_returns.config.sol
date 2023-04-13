pragma solidity ^0.4.24;

import "./contract_v04.sol";

contract Calls {
    event Operand(uint256 value);

    event Sum(uint256 value);

    uint[3] internal a1;
    uint[3] internal a2;

    function sqrt(int32 x) public returns (int32 y) {
        int32 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = ((x / z) + z) / 2;
        }
        assert((y * y) <= x);
        assert(((y + 1) * (y + 1)) >= x);
    }

    function complexExpressionsNesting() public {
        int8 a = 1;
        int8 b = 5;
        int16 c = 2;
        int32 d = 2 + 9;
        assert(d == 11);
        int h = 144;
        int x = (((3 + (a * b)) * (c + d)) * d) / (a + h);
        assert(x == 7);
    }

    function functionCallInExpression() public {
        int32 a = 5;
        int32 b = 8;
        int32 c = 15 + (sqrt((a * a) + (b * b)) / 2);
        assert(c == 19);
    }

    function functionCallPublicGetter(OwnedToken o) public returns (address) {
        return o.owner();
    }

    function requireCall(uint x, uint y) public returns (uint) {
        require((x + y) > x);
        uint z = x + y;
        require((z > 0) && (x > 0), "z and x should be greater than 0");
        z += 1;
        return z;
    }

    function assertCall(uint x, uint y) public returns (uint) {
        assert((x + y) > x);
        uint z = x + y;
        assert((z > 0) && (x > 0));
        z += 1;
        return z;
    }

    function revertCall(uint x, uint y) public returns (uint) {
        if (!((x + y) > x)) {
            revert();
        }
        uint z = x + y;
        if ((z > 0) && (x > 0)) {
            z += 1;
        } else {
            revert("z and x should be greater than 0");
        }
        return z;
    }

    function multipleReturn() public returns (uint) {
        uint8 a = 1;
        uint8 b = 0;
        if ((a + 1) >= 2) {
            return a;
        } else {
            if (b > 0) {
                return b;
            } else {
                b++;
            }
        }
    }

    function sort2(uint x, uint y) public returns (uint, uint) {
        if (x > y) {
            return (y, x);
        } else {
            return (x, y);
        }
    }

    function returnNoExplicitReturn() public returns (uint x) {
        x = 1;
    }

    function returnMixedNamedUnamed(bool b) public returns (uint, uint a) {
        if (b) {
            a = 10;
            return (2, 3);
        } else {
            a = 11;
        }
    }

    function returnOverwrite() public returns (uint x) {
        uint y = 1;
        return y;
    }

    function returnAssignBeforeBreak1() public returns (uint) {
        uint x = 0;
        do {
            break;
        } while((x = 1) > 0);
        return x;
    }

    function returnAssignBeforeBreak2() public returns (uint, uint) {
        uint x = 0;
        uint y = 0;
        for (uint i = 5; (x = i) >= 0; (y = i++)) {
            break;
        }
        return (x, y);
    }

    function returnBreakBeforeAssign() public returns (uint) {
        uint x = 0;
        while ((x = 1) > 0) {
            break;
        }
        return x;
    }

    function returnTuplesFromFunction() public {
        uint[3] memory x1;
        uint[3] memory x2;
        (x1, x2) = arrayStorageToStorage();
        (x1, ) = arrayStorageToStorage();
        (, x2) = arrayStorageToStorage();
    }

    function returnTuplesFromFunctionCall() public returns (uint[3], uint[3]) {
        return arrayStorageToStorage();
    }

    function emitFunction() public {
        uint x = 1;
        uint y = 2;
        uint sum = x + y;
    }

    function arrayStorageToStorage() public returns (uint[3], uint[3]) {
        a1 = [1, 2, 3];
        assert(((a1[0] == 1) && (a1[1] == 2)) && (a1[2] == 3));
        a2 = a1;
        assert(((a1[0] == 1) && (a1[1] == 2)) && (a1[2] == 3));
        assert(((a2[0] == 1) && (a2[1] == 2)) && (a2[2] == 3));
        a2[0] = 4;
        assert(((a1[0] == 1) && (a1[1] == 2)) && (a1[2] == 3));
        assert(((a2[0] == 4) && (a2[1] == 2)) && (a2[2] == 3));
        return (a1, a2);
    }
}

contract __IRTest__ {
    function main() public {
        Calls __this__ = new Calls();
        __testCase840__(__this__);
        __testCase875__(__this__);
        __testCase923__(__this__);
        __testCase965__(__this__);
        __testCase995__(__this__);
        __testCase1038__(__this__);
        __testCase1080__(__this__);
        __testCase1109__(__this__);
        __testCase1138__(__this__);
        __testCase1180__(__this__);
        __testCase1209__(__this__);
        __testCase1223__(__this__);
    }

    function __testCase840__(Calls __this__) internal {
        uint256 expect_840_0 = (uint256(1));
        uint256 ret_840_0 = __this__.multipleReturn();
        assert(ret_840_0 == expect_840_0);
    }

    function __testCase875__(Calls __this__) internal {
        (uint256 expect_875_0, uint256 expect_875_1) = (uint256(42), uint256(43));
        (uint256 ret_875_0, uint256 ret_875_1) = __this__.sort2(uint256(42), uint256(43));
        assert(ret_875_0 == expect_875_0);
        assert(ret_875_1 == expect_875_1);
    }

    function __testCase923__(Calls __this__) internal {
        (uint256 expect_923_0, uint256 expect_923_1) = (uint256(42), uint256(43));
        (uint256 ret_923_0, uint256 ret_923_1) = __this__.sort2(uint256(43), uint256(42));
        assert(ret_923_0 == expect_923_0);
        assert(ret_923_1 == expect_923_1);
    }

    function __testCase965__(Calls __this__) internal {
        uint256 expect_965_0 = (uint256(1));
        uint256 ret_965_0 = __this__.returnNoExplicitReturn();
        assert(ret_965_0 == expect_965_0);
    }

    function __testCase995__(Calls __this__) internal {
        (uint256 expect_995_0, uint256 expect_995_1) = (uint256(2), uint256(3));
        (uint256 ret_995_0, uint256 ret_995_1) = __this__.returnMixedNamedUnamed(true);
        assert(ret_995_0 == expect_995_0);
        assert(ret_995_1 == expect_995_1);
    }

    function __testCase1038__(Calls __this__) internal {
        (uint256 expect_1038_0, uint256 expect_1038_1) = (uint256(0), uint256(11));
        (uint256 ret_1038_0, uint256 ret_1038_1) = __this__.returnMixedNamedUnamed(false);
        assert(ret_1038_0 == expect_1038_0);
        assert(ret_1038_1 == expect_1038_1);
    }

    function __testCase1080__(Calls __this__) internal {
        uint256 expect_1080_0 = (uint256(1));
        uint256 ret_1080_0 = __this__.returnOverwrite();
        assert(ret_1080_0 == expect_1080_0);
    }

    function __testCase1109__(Calls __this__) internal {
        uint256 expect_1109_0 = (uint256(0));
        uint256 ret_1109_0 = __this__.returnAssignBeforeBreak1();
        assert(ret_1109_0 == expect_1109_0);
    }

    function __testCase1138__(Calls __this__) internal {
        (uint256 expect_1138_0, uint256 expect_1138_1) = (uint256(5), uint256(0));
        (uint256 ret_1138_0, uint256 ret_1138_1) = __this__.returnAssignBeforeBreak2();
        assert(ret_1138_0 == expect_1138_0);
        assert(ret_1138_1 == expect_1138_1);
    }

    function __testCase1180__(Calls __this__) internal {
        uint256 expect_1180_0 = (uint256(1));
        uint256 ret_1180_0 = __this__.returnBreakBeforeAssign();
        assert(ret_1180_0 == expect_1180_0);
    }

    function __testCase1209__(Calls __this__) internal {
        __this__.returnTuplesFromFunction();
    }

    function __testCase1223__(Calls __this__) internal {
        (uint256[3] memory expect_1223_0, uint256[3] memory expect_1223_1) = ([uint256(1), uint256(2), uint256(3)], [uint256(4), uint256(2), uint256(3)]);
        (uint256[3] memory ret_1223_0, uint256[3] memory ret_1223_1) = __this__.returnTuplesFromFunctionCall();
        assert(keccak256(abi.encodePacked(ret_1223_0)) == keccak256(abi.encodePacked(expect_1223_0)));
        assert(keccak256(abi.encodePacked(ret_1223_1)) == keccak256(abi.encodePacked(expect_1223_1)));
    }
}