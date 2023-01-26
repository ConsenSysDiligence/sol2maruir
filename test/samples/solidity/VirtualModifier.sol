pragma solidity 0.6.10;
contract Base {
    uint x;
    modifier A virtual {
        x = 0;
        _;
    }
    
    function foo() public A returns (uint) {
        return x;
    }
}

contract Child is Base {
    modifier A virtual override {
        x = 1;
        _;
    }
}

contract Child2 is Child {
    modifier A override {
        x = 2;
        _;
    }
}

contract Test {
    function main() public {
        Base b1 = new Base();
        Base b2 = new Child();
        Base b3 = new Child2();
        
        assert (b1.foo() == 0);
        assert (b2.foo() == 1);
        assert (b3.foo() == 2);
    }
}