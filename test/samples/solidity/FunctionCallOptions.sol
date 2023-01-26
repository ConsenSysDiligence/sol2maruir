pragma solidity ^0.6.2;

contract Foo {
    constructor() payable public {}
    function buy(uint amount) external payable returns (bool success) {
        
    }
}

contract FunctionCallOptions {    
    function main() public {
        Foo f = new Foo{
            value: 0.0 ether + 0 szabo,
            salt: 0x0
        }();

        f.buy{gas: 2000, value: 0 szabo}(1000);
    }
}