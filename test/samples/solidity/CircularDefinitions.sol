pragma solidity ^0.4.24;

contract A {
    B b;
    function setB(address addr) public {
        b = B(addr);
    }
}

contract B {
    A a;
    function setA(address addr) public {
        a = A(addr);
    }
}

contract CircularDefinitions {
    function main() public {
        A a = new A();
        B b = new B();

        a.setB(b);
        b.setA(a);
    }
}
