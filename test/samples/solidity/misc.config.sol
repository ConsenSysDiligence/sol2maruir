pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

contract Misc {
    enum TestEnum { A, B, C }

    struct TestStructA {
        string memberX;
        int memberY;
        TestEnum memberZ;
    }

    uint[] internal data = [1, 2, 3];
    string public someString = "123";
    uint public sum = 15;

    function sqrt(int32 x) public pure returns (int32 y) {
        int32 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = ((x / z) + z) / 2;
        }
    }

    function types() public {
        uint16 a = 1;
        int8 b = 2;
        address c = address(0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        bool d = true;
        bytes4 e = bytes4(0xff000000);
        bytes memory f = "0xaa";
        string memory g = "ab";
        assert(a == 1);
        assert(b == 2);
        assert(c == 0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        assert(d == true);
        assert(e[0] == 0xff);
        assert(e[1] == 0x00);
        assert(e[2] == 0x00);
        assert(e[3] == 0x00);
        assert(f[0] == 0x30);
        assert(f[1] == 0x78);
        assert(f[2] == 0x61);
        assert(f[3] == 0x61);
        assert(bytes(g)[0] == 0x61);
        assert(bytes(g)[1] == 0x62);
    }

    function divisionBy(uint z) public returns (uint) {
        uint x = 6 / z;
        return x;
    }

    function modBy(uint z) public returns (uint) {
        uint x = 7 % z;
        return x;
    }

    function expressionNoAssignment() public {
        1 + sqrt(1);
        1 + 1;
        1;
    }

    function storageLocations(string a, TestStructA b, uint[] c) public {
        uint[] e;
        e.push(2);
        data = e;
        string f = someString;
        TestStructA memory g;
        g = TestStructA("123", 123, TestEnum.A);
        TestStructA h;
        bytes i;
    }

    function deleteFunc() public {
        assert(sum == 15);
        uint x = sum;
        assert(x == sum);
        delete x;
        assert(x == 0);
        assert(sum == 15);
        assert(x != sum);
        x = 10;
        delete sum;
        assert(x == 10);
        assert(sum == 0);
        assert(x != sum);
        assert(data[0] == 1);
        assert(data[1] == 2);
        assert(data[2] == 3);
        uint[] storage y = data;
        assert(y[0] == data[0]);
        assert(y[1] == data[1]);
        assert(y[2] == data[2]);
        assert(y.length == data.length);
        delete data;
        assert(data.length == 0);
        assert(y.length == 0);
        data = [1, 2, 3];
        delete data[1];
        assert(data[1] == 0);
        delete data[2];
        assert(data.length == 3);
        assert(data[2] == 0);
    }

    function expAssoc(uint a, uint b, uint c) public returns (uint) {
        return (a ** b) ** c;
    }
}

contract __IRTest__ {
    function main() public {
        Misc __this__ = new Misc();
        __testCase531__(__this__);
        __testCase545__(__this__);
        __testCase562__(__this__);
        __testCase594__(__this__);
        __testCase626__(__this__);
        __testCase655__(__this__);
        __testCase678__(__this__);
    }

    function __testCase531__(Misc __this__) internal {
        __this__.types();
    }

    function __testCase545__(Misc __this__) internal {
        __this__.types();
    }

    function __testCase562__(Misc __this__) internal {
        uint256 expect_562_0 = (uint256(6));
        uint256 ret_562_0 = __this__.divisionBy(uint256(1));
        assert(ret_562_0 == expect_562_0);
    }

    function __testCase594__(Misc __this__) internal {
        uint256 expect_594_0 = (uint256(1));
        uint256 ret_594_0 = __this__.divisionBy(uint256(5));
        assert(ret_594_0 == expect_594_0);
    }

    function __testCase626__(Misc __this__) internal {
        uint256 expect_626_0 = (uint256(1));
        uint256 ret_626_0 = __this__.modBy(uint256(3));
        assert(ret_626_0 == expect_626_0);
    }

    function __testCase655__(Misc __this__) internal {
        __this__.expressionNoAssignment();
    }

    function __testCase678__(Misc __this__) internal {
        uint256 expect_678_0 = (uint256(64));
        uint256 ret_678_0 = __this__.expAssoc(uint256(2), uint256(3), uint256(2));
        assert(ret_678_0 == expect_678_0);
    }
}
