pragma solidity ^0.6.0;

contract CalldataSlices {
    function first(uint x, uint y) public returns (uint) {
        return abi.decode(msg.data[4:36], (uint));
    }
    
    function second(uint x, uint y) public returns (uint) {
        return abi.decode(msg.data[36:], (uint));
    }
}