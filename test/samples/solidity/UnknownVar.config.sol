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

contract OtherCase {
    function test() view public {
        require(addr != 0x0);

        address addr = msg.sender;
    }
}

contract __IRTest__ {
    function main() public {
        UnknownVar __this__ = new UnknownVar(int256(3), int256(4), int256(7));
        __testCase90__(__this__);
    }

    function __testCase90__(UnknownVar __this__) internal {
        int256 expect_90_0 = (int256(7));
        int256 ret_90_0 = __this__.getA();
        assert(ret_90_0 == expect_90_0);
    }
}
