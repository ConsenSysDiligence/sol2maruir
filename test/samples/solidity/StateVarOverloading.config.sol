pragma solidity ^0.4.24;

contract Base {
    uint public a;

    constructor() public {
        a = 1;
    }
}

contract Child is Base {
    uint public a;

    constructor() public {
        a = 2;
    }
}

contract StateVarOverloading {
    function main() public returns (uint, uint, uint) {
        Base b = new Base();
        Base c = new Child();
        Child d = new Child();
        return (b.a(), c.a(), d.a());
    }
}

contract __IRTest__ {
    function main() public {
        StateVarOverloading __this__ = new StateVarOverloading();
        __testCase79__(__this__);
    }

    function __testCase79__(StateVarOverloading __this__) internal {
        (uint256 expect_79_0, uint256 expect_79_1, uint256 expect_79_2) = (uint256(1), uint256(2), uint256(2));
        (uint256 ret_79_0, uint256 ret_79_1, uint256 ret_79_2) = __this__.main();
        assert(ret_79_0 == expect_79_0);
        assert(ret_79_1 == expect_79_1);
        assert(ret_79_2 == expect_79_2);
    }
}
