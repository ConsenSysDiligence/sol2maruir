pragma solidity ^0.6.0;

struct A {
    uint a;
    string b;
}

struct B {
    uint a;
    byte b;
}

contract Foo {
    struct A {
        int x;
        int y;
    }
    
    function foo() public returns (int) {
        A memory a = A(10, 20);
        return a.x;
    }
    
    function boo() public returns (byte) {
        B memory b = B(1000, 0x42);
        return b.b;
    }
}
