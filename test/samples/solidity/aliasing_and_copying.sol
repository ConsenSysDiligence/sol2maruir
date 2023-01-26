pragma solidity ^0.4.24;

contract AliasingAndCopying {
    struct A { uint a; }
    struct B { uint b; A a; }

    struct TestStructC {
        string memberX;
        int memberY;
        int[1] memberZ;
    }

    uint[3] a1;
    uint[3] a2;

    B b1 = B(1, A(2));
    B b2 = B(3, A(4));

    TestStructC e;

    // array storage to memory is a copy
    function arrayStorageToMemory() public returns (uint[3], uint[3]) {
        a1 = [1,2,3];
        uint[3] memory b;
        b = a1;
        b[0] = 4;

        return (a1,b);
    }

    // array memory to storage is a copy
    function arrayMemoryToStorage() public returns (uint[3], uint[3]) {
        uint256[3] memory b = [uint(1),2,3];
        a1 = b;
        a1[0] = 4;

        return (a1,b);
    }

    // array memory to memory is a reference
    function arrayMemoryToMemory() public returns (uint[3], uint[3]) {
        uint256[3] memory b = [uint(1),2,3];
        uint256[3] memory c;
        c = b;
        c[0] = 4;

        return (b,c);
    }

    // array storage to storage is a copy
    function arrayStorageToStorage() public returns (uint[3], uint[3]) {
        a1 = [1,2,3];

        a2 = a1;
        a2[0] = 4;

        return (a1,a2);
    }

    function twoDimArrayMemoryToMemory() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] memory b;
        b[0] = [uint(1),1,1];
        b[1] = [uint(2),2,2];
        b[2] = [uint(3),3,3];

        uint[3] memory c;
        c = [uint(4),4,4];

        b[0] = c;
        b[0][0] = 42;

        // If b[0] = c is a copy, then should return [42,4,4], [4,4,4]
        // If b[0] = c is a alias, then should return [42,4,4], [42,4,4]
        // It returns the second so its a alias.
        return (b[0],c);
    }

    uint[3][3] store_b;
    uint[3] store_c;

    function twoDimArrayStorageToStorage() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] storage b = store_b;

        b[0] = [uint(1),1,1];
        b[1] = [uint(2),2,2];
        b[2] = [uint(3),3,3];

        uint[3] storage c = store_c;

        c[0] = 4;
        c[1] = 4;
        c[2] = 4;

        b[0] = c;
        b[0][0] = 42;

        // If b[0] = c is a copy, then should return [42,4,4], [4,4,4]
        // If b[0] = c is a alias, then should return [42,4,4], [42,4,4]
        // It returns the first so its a copy.
        return (b[0],c);
    }

    // struct storage to storage is a reference
    function structStorageToStorage() public returns (uint, uint) {
        B storage b3 = b1;
        b3.b = 5;

        return (b3.b, b1.b);
    }

    // struct storage to memory is a copy
    function structStorageToMemory() public returns (uint, uint) {
        b1.b = 1;
        B memory b3 = b1;
        b3.b = 5;

        return (b3.b, b1.b);
    }

    // struct memory to storage is a copy
    function structMemoryToStorage() public returns (uint, uint) {
        B memory b3 = B(1,A(2));
        b1 = b3;
        b1.b = 5;

        return (b1.b, b3.b);
    }

    // struct memory to memory is a reference
    function structMemoryToMemory() public returns (uint, uint) {
        B memory b3 = B(1,A(2));
        B memory b4;

        b4 = b3;

        b4.b = 5;

        return (b4.b, b3.b);
    }

    function copyNestedStruct() public returns (uint, uint) {
        b1.a = b2.a;
        b1.a.a = 6;

        return (b1.a.a,  b2.a.a);
    }

    function structOperations() public returns (int, int) {
        int[1] memory y;

        y[0] = 1;

        // TestStructC contains memory reference to z
        TestStructC memory z = TestStructC("x", 2, y);

        // copy memory struct to storage struct
        e = z;

        // change value in y and z but not in e since it's a copy
        z.memberZ[0] = 2;

        return  (e.memberZ[0], z.memberZ[0]);
    }
}
