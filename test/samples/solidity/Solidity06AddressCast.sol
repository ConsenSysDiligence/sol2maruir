pragma solidity ^0.6.0;

contract Foo {        
        function main() public returns (address) {
                address x;
                address payable b = payable(x);
                return b;
        }
}
