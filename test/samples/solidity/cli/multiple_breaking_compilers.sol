pragma solidity >0.7.0;

// ^0.7.0 - Unsafe math with overflows/underflows
// >0.8.0 - Safe math with reverts on overflow/underflow

contract Test {
    function main(uint a, uint b) public pure returns (uint c) {
        c = a + b;
    }
}
