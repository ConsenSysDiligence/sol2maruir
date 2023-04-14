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
        __testCase74__(__this__, __this1__);
    }

    function __testCase44__(Balance __this__) internal {
        uint256 ret_44_0 = __this__.getBalance();
        assert(ret_44_0 == uint256(43));
    }

    function __testCase74__(Balance __this__, BalanceFunc __this1__) internal {
        uint256 ret_74_0 = __this1__.getBalance();
        assert(ret_74_0 == uint256(42));
    }
}