contract Base {
    uint public x = 0;
    modifier M {
        x *= 2;
        _;
    }
    
    constructor() {
        x = 1;
    }
}

contract Child is Base {
    
    constructor() M {}
}

contract Test {
    function main() public {
        Base b = new Child();
        assert(b.x() == 2);
    }
}
