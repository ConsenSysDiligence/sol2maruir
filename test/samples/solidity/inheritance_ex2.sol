pragma solidity ^0.4.24;

contract Base {
    uint s = 42;

    function foo(uint n) public returns (uint) {
        return s + n;
    }
    
    function bar(uint n) public returns (uint) {
        // External and dynamic dispatch
        return this.foo(n);
    }
    
    function boo(uint n) public returns (uint) {
        // Internal and dynamic dispatch
        return foo(n);
    }
}

contract Child is Base {
    uint s1 = 142;
    function foo(uint n) public returns (uint) {
        return s1+ n;
    }
}

contract DynamicDispatch {
    function main() public {
        Base b = new Base();
        Base cb = new Child();
        Child c = new Child();
        Base bc = Base(c);
        
        // All of the above are dynamically dispatch
        assert(b.foo(1)  == 43);  // Call Base_foo
        assert(cb.foo(1) == 143); // Call Child_foo
        assert(bc.foo(1) == 143); // Call Child_foo
        
        assert(b.bar(1) == 43); // Call Base_bar which calls Base_foo
        assert(cb.bar(1) == 143); // Call Base_bar which calls Child_foo
        assert(bc.bar(1) == 143); // Call Base_bar which calls Child_foo
        
        assert(b.boo(1) == 43); // Call Base_boo which calls Child_foo
        assert(cb.boo(1) == 143); // Call Base_boo which calls Child_foo
        assert(bc.boo(1) == 143); // Call Base_boo which calls Child_foo
    }
}