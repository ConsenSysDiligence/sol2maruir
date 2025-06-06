pragma solidity ^0.5.12;

contract A {
    int256 public a;
    uint256 internal b;
    bytes1 private c;
    function asetA(int256 x) public {
        a = x;
    }

    function agetA() public returns (int256) {
        return a;
    }

}

contract B {
    int256 public a;
    uint256 internal b;
    bytes1 private c;
    function bsetA(int256 x) public {
        a = x;
    }

    function bgetA() public returns (int256) {
        return a;
    }
}

contract C is A, B {
    int256 public a;
    uint256 internal b;
    bytes1 private c;
    function csetA(int256 x) public {
        a = x;
    }
}

contract Main {
    function main() public returns (int256, int256, int256) {
        C c = new C();

        (A(c)).asetA(10);
        (B(c)).bsetA(20);
        // Note that A, B and C each has its own copy of 'int public a'
        // Calling bsetA() doesn't modify C's view of a.
        assert(c.a() == 0 && A(c).agetA() == 10 && B(c).bgetA() == 20);
        c.csetA(30);
        // And vice-versa - calling c's csetA modifies B or A's view of a.
        assert(c.a() == 30 && A(c).agetA() == 10 && B(c).bgetA() == 20);
        return (c.a(), A(c).agetA(), B(c).bgetA());
    }
}
