pragma solidity ^0.4.24;

contract AliasingAndCopying {
    struct A {
        uint a;
    }

    struct B {
        uint b;
        A a;
    }

    struct TestStructC {
        string memberX;
        int memberY;
        int[1] memberZ;
    }

    uint[3] internal a1;
    uint[3] internal a2;
    B internal b1 = B(1, A(2));
    B internal b2 = B(3, A(4));
    TestStructC internal e;
    uint[3][3] internal store_b;
    uint[3] internal store_c;

    function arrayStorageToMemory() public returns (uint[3], uint[3]) {
        a1 = [1, 2, 3];
        uint[3] memory b;
        b = a1;
        b[0] = 4;
        return (a1, b);
    }

    function arrayMemoryToStorage() public returns (uint[3], uint[3]) {
        uint256[3] memory b = [uint(1), 2, 3];
        a1 = b;
        a1[0] = 4;
        return (a1, b);
    }

    function arrayMemoryToMemory() public returns (uint[3], uint[3]) {
        uint256[3] memory b = [uint(1), 2, 3];
        uint256[3] memory c;
        c = b;
        c[0] = 4;
        return (b, c);
    }

    function arrayStorageToStorage() public returns (uint[3], uint[3]) {
        a1 = [1, 2, 3];
        a2 = a1;
        a2[0] = 4;
        return (a1, a2);
    }

    function twoDimArrayMemoryToMemory() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] memory b;
        b[0] = [uint(1), 1, 1];
        b[1] = [uint(2), 2, 2];
        b[2] = [uint(3), 3, 3];
        uint[3] memory c;
        c = [uint(4), 4, 4];
        b[0] = c;
        b[0][0] = 42;
        return (b[0], c);
    }

    function twoDimArrayStorageToStorage() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] storage b = store_b;
        b[0] = [uint(1), 1, 1];
        b[1] = [uint(2), 2, 2];
        b[2] = [uint(3), 3, 3];
        uint[3] storage c = store_c;
        c[0] = 4;
        c[1] = 4;
        c[2] = 4;
        b[0] = c;
        b[0][0] = 42;
        return (b[0], c);
    }

    function structStorageToStorage() public returns (uint, uint) {
        B storage b3 = b1;
        b3.b = 5;
        return (b3.b, b1.b);
    }

    function structStorageToMemory() public returns (uint, uint) {
        b1.b = 1;
        B memory b3 = b1;
        b3.b = 5;
        return (b3.b, b1.b);
    }

    function structMemoryToStorage() public returns (uint, uint) {
        B memory b3 = B(1, A(2));
        b1 = b3;
        b1.b = 5;
        return (b1.b, b3.b);
    }

    function structMemoryToMemory() public returns (uint, uint) {
        B memory b3 = B(1, A(2));
        B memory b4;
        b4 = b3;
        b4.b = 5;
        return (b4.b, b3.b);
    }

    function copyNestedStruct() public returns (uint, uint) {
        b1.a = b2.a;
        b1.a.a = 6;
        return (b1.a.a, b2.a.a);
    }

    function structOperations() public returns (int, int) {
        int[1] memory y;
        y[0] = 1;
        TestStructC memory z = TestStructC("x", 2, y);
        e = z;
        z.memberZ[0] = 2;
        return (e.memberZ[0], z.memberZ[0]);
    }
}

contract __IRTest__ {
    function main() public {
        AliasingAndCopying __this__ = new AliasingAndCopying();
        __testCase614__(__this__);
        __testCase698__(__this__);
        __testCase782__(__this__);
        __testCase866__(__this__);
        __testCase950__(__this__);
        __testCase1034__(__this__);
        __testCase1118__(__this__);
        __testCase1160__(__this__);
        __testCase1202__(__this__);
        __testCase1244__(__this__);
        __testCase1286__(__this__);
        __testCase1328__(__this__);
    }

    function __testCase614__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_614_0, uint256[3] memory expect_614_1) = ([uint256(1), uint256(2), uint256(3)], [uint256(4), uint256(2), uint256(3)]);
        (uint256[3] memory ret_614_0, uint256[3] memory ret_614_1) = __this__.arrayStorageToMemory();
        assert(keccak256(abi.encodePacked(ret_614_0)) == keccak256(abi.encodePacked(expect_614_0)));
        assert(keccak256(abi.encodePacked(ret_614_1)) == keccak256(abi.encodePacked(expect_614_1)));
    }

    function __testCase698__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_698_0, uint256[3] memory expect_698_1) = ([uint256(4), uint256(2), uint256(3)], [uint256(1), uint256(2), uint256(3)]);
        (uint256[3] memory ret_698_0, uint256[3] memory ret_698_1) = __this__.arrayMemoryToStorage();
        assert(keccak256(abi.encodePacked(ret_698_0)) == keccak256(abi.encodePacked(expect_698_0)));
        assert(keccak256(abi.encodePacked(ret_698_1)) == keccak256(abi.encodePacked(expect_698_1)));
    }

    function __testCase782__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_782_0, uint256[3] memory expect_782_1) = ([uint256(4), uint256(2), uint256(3)], [uint256(4), uint256(2), uint256(3)]);
        (uint256[3] memory ret_782_0, uint256[3] memory ret_782_1) = __this__.arrayMemoryToMemory();
        assert(keccak256(abi.encodePacked(ret_782_0)) == keccak256(abi.encodePacked(expect_782_0)));
        assert(keccak256(abi.encodePacked(ret_782_1)) == keccak256(abi.encodePacked(expect_782_1)));
    }

    function __testCase866__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_866_0, uint256[3] memory expect_866_1) = ([uint256(1), uint256(2), uint256(3)], [uint256(4), uint256(2), uint256(3)]);
        (uint256[3] memory ret_866_0, uint256[3] memory ret_866_1) = __this__.arrayStorageToStorage();
        assert(keccak256(abi.encodePacked(ret_866_0)) == keccak256(abi.encodePacked(expect_866_0)));
        assert(keccak256(abi.encodePacked(ret_866_1)) == keccak256(abi.encodePacked(expect_866_1)));
    }

    function __testCase950__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_950_0, uint256[3] memory expect_950_1) = ([uint256(42), uint256(4), uint256(4)], [uint256(42), uint256(4), uint256(4)]);
        (uint256[3] memory ret_950_0, uint256[3] memory ret_950_1) = __this__.twoDimArrayMemoryToMemory();
        assert(keccak256(abi.encodePacked(ret_950_0)) == keccak256(abi.encodePacked(expect_950_0)));
        assert(keccak256(abi.encodePacked(ret_950_1)) == keccak256(abi.encodePacked(expect_950_1)));
    }

    function __testCase1034__(AliasingAndCopying __this__) internal {
        (uint256[3] memory expect_1034_0, uint256[3] memory expect_1034_1) = ([uint256(42), uint256(4), uint256(4)], [uint256(4), uint256(4), uint256(4)]);
        (uint256[3] memory ret_1034_0, uint256[3] memory ret_1034_1) = __this__.twoDimArrayStorageToStorage();
        assert(keccak256(abi.encodePacked(ret_1034_0)) == keccak256(abi.encodePacked(expect_1034_0)));
        assert(keccak256(abi.encodePacked(ret_1034_1)) == keccak256(abi.encodePacked(expect_1034_1)));
    }

    function __testCase1118__(AliasingAndCopying __this__) internal {
        (uint256 expect_1118_0, uint256 expect_1118_1) = (uint256(5), uint256(5));
        (uint256 ret_1118_0, uint256 ret_1118_1) = __this__.structStorageToStorage();
        assert(ret_1118_0 == expect_1118_0);
        assert(ret_1118_1 == expect_1118_1);
    }

    function __testCase1160__(AliasingAndCopying __this__) internal {
        (uint256 expect_1160_0, uint256 expect_1160_1) = (uint256(5), uint256(1));
        (uint256 ret_1160_0, uint256 ret_1160_1) = __this__.structStorageToMemory();
        assert(ret_1160_0 == expect_1160_0);
        assert(ret_1160_1 == expect_1160_1);
    }

    function __testCase1202__(AliasingAndCopying __this__) internal {
        (uint256 expect_1202_0, uint256 expect_1202_1) = (uint256(5), uint256(1));
        (uint256 ret_1202_0, uint256 ret_1202_1) = __this__.structMemoryToStorage();
        assert(ret_1202_0 == expect_1202_0);
        assert(ret_1202_1 == expect_1202_1);
    }

    function __testCase1244__(AliasingAndCopying __this__) internal {
        (uint256 expect_1244_0, uint256 expect_1244_1) = (uint256(5), uint256(5));
        (uint256 ret_1244_0, uint256 ret_1244_1) = __this__.structMemoryToMemory();
        assert(ret_1244_0 == expect_1244_0);
        assert(ret_1244_1 == expect_1244_1);
    }

    function __testCase1286__(AliasingAndCopying __this__) internal {
        (uint256 expect_1286_0, uint256 expect_1286_1) = (uint256(6), uint256(4));
        (uint256 ret_1286_0, uint256 ret_1286_1) = __this__.copyNestedStruct();
        assert(ret_1286_0 == expect_1286_0);
        assert(ret_1286_1 == expect_1286_1);
    }

    function __testCase1328__(AliasingAndCopying __this__) internal {
        (int256 expect_1328_0, int256 expect_1328_1) = (int256(1), int256(2));
        (int256 ret_1328_0, int256 ret_1328_1) = __this__.structOperations();
        assert(ret_1328_0 == expect_1328_0);
        assert(ret_1328_1 == expect_1328_1);
    }
}