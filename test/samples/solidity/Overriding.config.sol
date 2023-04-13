pragma solidity 0.7.6;

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
    function main() public returns (uint, uint, uint) {
        Base b = new Base();
        Child c = new Child();
        Base b1 = new Child();
        return (b.moo(), c.moo(), b1.moo());
    }
}

contract __IRTest__ {
    function main() public {
        Test __this__ = new Test();
        __testCase84__(__this__);
    }

    function __testCase84__(Test __this__) internal {
        (uint256 expect_84_0, uint256 expect_84_1, uint256 expect_84_2) = (uint256(1), uint256(2), uint256(2));
        (uint256 ret_84_0, uint256 ret_84_1, uint256 ret_84_2) = __this__.main();
        assert(ret_84_0 == expect_84_0);
        assert(ret_84_1 == expect_84_1);
        assert(ret_84_2 == expect_84_2);
    }
}
