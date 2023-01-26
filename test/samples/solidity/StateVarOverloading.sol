pragma solidity ^0.4.24;

contract Base {
    constructor() public {
        a = 1;
    }
    uint public a;
}

contract Child is Base {
    constructor() public {
        a = 2;
    }
    uint public a;
}

contract StateVarOverloading {
    function main() public returns (uint, uint, uint) {
        Base b = new Base();
        Base c = new Child();
        Child d = new Child();
        
        // Should return (1,2,2)
        return (b.a(), c.a(), d.a());
    }
}
