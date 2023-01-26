contract Base {
    function foo() virtual internal returns (uint) {
        return 1;
    }
    
    function moo() public returns (uint) {
        return foo();
    }
}

contract Child is Base {
    function foo() override internal returns (uint) {
        return 2;
    }
}

contract Test {
    function main() public  returns (uint, uint, uint) {
        Base b = new Base();
        Child c = new Child();
        Base b1 = new Child();
        
        return (b.moo(), c.moo(), b1.moo());
    }
}