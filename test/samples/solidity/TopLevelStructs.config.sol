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

contract __IRTest__ {
    function main() public {
        Foo __this__ = new Foo();
        __testCase63__(__this__);
        __testCase92__(__this__);
    }

    function __testCase63__(Foo __this__) internal {
        int256 expect_63_0 = (int256(10));
        int256 ret_63_0 = __this__.foo();
        assert(ret_63_0 == expect_63_0);
    }

    function __testCase92__(Foo __this__) internal {
        byte expect_92_0 = (byte(0x42));
        byte ret_92_0 = __this__.boo();
        assert(ret_92_0 == expect_92_0);
    }
}
