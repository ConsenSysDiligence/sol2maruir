pragma solidity ^0.4.13;

contract A {
    int a;

    function A(int v) public {
        a = v;
    }
}

contract B is A(20) {
    uint b = 40;
}

contract C is B {
    int c;

    function C(int v) public {
        c = v;
    }
}

contract D is C(30) {}

contract T is D {
    function test() public {
        assert(a == 20);
        assert(b == 40);
        assert(c == 30);
    }
}
