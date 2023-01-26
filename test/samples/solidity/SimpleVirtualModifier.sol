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
    
    function goo() public returns (uint) {
        return this.foo();
    }
}

contract Test {
    function main() public {
        Child c = new Child();
        
        assert (c.goo() == 1);
    }
}