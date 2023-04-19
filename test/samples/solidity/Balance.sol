pragma solidity 0.4.26;
contract BalanceFunc {
    // If there is an existing function 'balance' on the contract it takes precedence
    function balance() public returns (uint) {
        return 42;
    }
    
    function getBalance() public returns (uint) {
        return this.balance();
    }
}

contract Balance {
    constructor() payable {}
    
    // Otherwise just return the balance.
    function getBalance() public returns (uint) {
        return this.balance;
    }
}