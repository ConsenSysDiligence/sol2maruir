pragma solidity ^0.4.24;

contract Base {
    constructor() public {
        a = 1;
    }
    uint public a;
}

contract Child is Base {
    constructor() public {
        a = "hi";
    }
    string public a;
}

contract InvalidStateVarOverloading {
    function main() public returns (uint, uint, string memory) {
        Base b = new Base();
        Base c = new Child();
        Child d = new Child();
        
        return (b.a(), c.a(), d.a());
    }
}
