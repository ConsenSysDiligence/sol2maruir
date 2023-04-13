pragma solidity >=0.5.0<0.6.0;

contract Arrays {
    uint[] internal data;

    function addOne(uint a) public returns (uint) {
        return a + 1;
    }

    function addOneTwice(uint a, uint b) public returns (uint, uint) {
        return (addOne(a), addOne(b));
    }

    function arrays() public returns (uint[] memory) {
        uint[] storage a = data;
        uint b;
        a.push(1);
        a.push(2);
        a.push(3);
        assert(((a[0] == 1) && (a[1] == 2)) && (a[2] == 3));
        a.length = 2;
        assert(((a[0] == 1) && (a[1] == 2)) && (a.length == 2));
        b = a.push(1) + 1;
        assert((((a[0] == 1) && (a[1] == 2)) && (a[2] == 1)) && (a.length == 3));
        assert(b == 4);
        a.pop();
        assert(((a[0] == 1) && (a[1] == 2)) && (a.length == 2));
        uint c = a.length;
        return a;
    }

    function tupleInlineArrayAssignment() public {
        uint[3] memory a;
        uint[3] memory b;
        (a, b) = ([uint(1), 2, 3], [uint(4), 5, 6]);
    }

    function arrayLenModifiers() public {
        uint[] storage a = data;
        uint b;
        a.length = 1;
        (a.length, b) = (3, 4);
        b = (a.length = 1) + 1;
        a.length = addOne(1);
        (b, a.length) = addOneTwice(1, 2);
        a.length += 1;
        a.length *= 2;
        a.length >>= 2;
    }
}

contract __IRTest__ {
    function main() public {
        Arrays __this__ = new Arrays();
        __testCase310__(__this__);
        __testCase355__(__this__);
        __testCase369__(__this__);
    }

    function __testCase310__(Arrays __this__) internal {
        uint256[] memory expect_310_0 = new uint[](2);

        expect_310_0[0] = uint256(1);
        expect_310_0[1] = uint256(2);

        uint256[] memory ret_310_0 = __this__.arrays();

        assert(keccak256(abi.encodePacked(ret_310_0)) == keccak256(abi.encodePacked(expect_310_0)));
    }

    function __testCase355__(Arrays __this__) internal {
        __this__.tupleInlineArrayAssignment();
    }

    function __testCase369__(Arrays __this__) internal {
        __this__.arrayLenModifiers();
    }
}
