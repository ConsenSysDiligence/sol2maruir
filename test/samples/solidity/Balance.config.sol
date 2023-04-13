pragma solidity 0.4.26;

contract BalanceFunc {
    function balance() public returns (uint) {
        return 42;
    }

    function getBalance() public returns (uint) {
        return this.balance();
    }
}

contract Balance {
    function getBalance() public returns (uint) {
        return this.balance;
    }
}

contract __IRTest__ {
    function main() public {
        Balance __this__ = new Balance();
        __testCase44__(__this__);
        BalanceFunc __this1__ = new BalanceFunc();
        __testCase78__(__this__, __this1__);
    }

    function __testCase44__(Balance __this__) internal {
        uint256 expect_44_0 = (uint256(0));
        uint256 ret_44_0 = __this__.getBalance();
        assert(ret_44_0 == expect_44_0);
    }

    function __testCase78__(Balance __this__, BalanceFunc __this1__) internal {
        uint256 expect_78_0 = (uint256(42));
        uint256 ret_78_0 = __this1__.getBalance();
        assert(ret_78_0 == expect_78_0);
    }
}