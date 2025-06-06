contract Base {
    uint x = 0;
    modifier A virtual {
        x = 42;
        _;
    }

    function foo() public virtual A returns (uint) {
        return x;
    }
}

contract Child1 is Base {
    function foo() public virtual override returns (uint) {
        return x;
    }
}

contract Child2 is Child1 {
    modifier A override {
        x = 2;
        _;
    }
}

contract Test {
    function main() public {
        Base b = new Base();
        Child1 c1 = new Child1();
        Child2 c2 = new Child2();
        assert(c2.foo() == 0);
        assert(c1.foo() == 0);
        assert(b.foo() == 42);
    }
}