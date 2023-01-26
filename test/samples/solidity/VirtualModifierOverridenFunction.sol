contract Base {
    uint x = 0;
    modifier M virtual {
        x += 1;
        _;
    }
    function foo() virtual M public returns (uint) {
        return x;
    }
}

contract Child is Base {
    modifier M override {
        x += 2;
        _;
    }
    
    function foo() virtual override public returns (uint) {
        return super.foo() + 1;
    }
}

contract Test {
    function main() public {
        Base b = new Base();
        Base bc = new Child();
        Child c = new Child();

        assert(b.foo() == 1);
        assert(bc.foo() == 3);
        assert(c.foo() == 3);
    }
}