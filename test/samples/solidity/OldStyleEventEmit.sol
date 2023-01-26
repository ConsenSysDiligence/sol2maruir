pragma solidity ^0.4.25;

contract OldStyleEventEmit {
    event E(uint x);
    
    function main() public {
        E(10);
    }
}