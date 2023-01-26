pragma solidity ^0.4.24;

contract A {
    int a;

    constructor (int _a) public {
        a = _a;
    }

}

contract B is A {
    int b;

    constructor (int _a, int _b) A(_a) public {
        b = _b;
    }
}

contract UnknownVar is B {
    int c;

    constructor (int _a, int _b, int _c) B(_a + _b, _b) public {
        c = _c;
    }
    
    function getA() public returns (int) {
        return a;
    }
}

/*
contract OtherCase {
    function test() view public {
        require(addr != 0x0);

        address addr = msg.sender;
    }
}
*/