pragma solidity ^0.4.24;

contract Mappings {
    enum TestEnum {
        A,
        B,
        C
    }

    struct TestStructA {
        string memberX;
        int memberY;
        TestEnum memberZ;
    }

    struct TestStructB {
        TestStructA memberA;
        string memberB;
        int8 memberC;
        address memberD;
    }

    mapping (uint => uint) uintMap;
    mapping (uint => uint[]) uintArrMap;
    mapping (uint => TestStructB) uintStructMap;

    function mappings() public {
        // Simple storage map indexing and aliasing
        mapping (uint => uint) m = uintMap;

        uint a = uintMap[1];
        uintMap[1] = 10;

        uint b = m[1];

        assert(b == 10);
        // Storage map containg arrays - indexing and aliasing
        mapping (uint => uint[]) m1 = uintArrMap;

        m1[0] = [1,2,3];
        assert(uintArrMap[0][2] == 3);
        // Storage map containg structs - indexing and aliasing
        mapping (uint => TestStructB) m3 = uintStructMap;
        m3[1] = TestStructB(TestStructA("sup", 42, TestEnum.C), "dawg", 127, address(0x43));

        assert(uintStructMap[1].memberA.memberY == 42);
        assert(uintStructMap[1].memberC == 127);
        assert(bytes(uintStructMap[1].memberA.memberX).length == 3);
    }
}
