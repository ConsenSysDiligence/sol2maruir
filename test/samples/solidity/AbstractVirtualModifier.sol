pragma solidity ^0.6.8;
abstract contract Base {
    uint x = 0;
    modifier Moo() virtual;
    function foo() public Moo returns (uint) {
        return x;
    }
}

contract Child is Base{
    modifier Moo() override {
    	x = 42;
        _;
    }
}

contract Test {
    function main() public {
        Base b = new Child();
        assert(b.foo() == 42);
    }
}