pragma solidity ^0.4.24;

contract Ternary {
    uint private x = 1;
    uint internal y = 1;

    function sqrt(int32 x) public pure returns (int32 y) {
        int32 z = (x + 1) / 2;

        y = x;

        while (z < y) {
            y = z;

            z = (x / z + z) / 2;
        }
    }

    function ternaryInExpressionStatement(uint a) public returns (uint) {
        require(a > 0);

        a == 1 ? a += 1 : a += 2;

        return a;
    }

    function ternaryNested(uint a) public returns (uint) {
        if (a == 1 ? (a <= 1 ? true : false) : false) {
            a += 1;
        } else if (a <= 1 ? true : false == a <= 2 ? true : false) {
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

        return (a == 1 ? a += 1 : a += 2) ;
    }

    function ternaryReturnMultiple(bool b) public returns (uint, uint) {
        return ((b ? x = 1 : x = 2), (b ? y = 1 : y = 2));
    }


    function ternaryCommonType(bool b) public returns(address) {
        address a = 0xdeadbeef;
        return (b ? a : 0);
    }
}
