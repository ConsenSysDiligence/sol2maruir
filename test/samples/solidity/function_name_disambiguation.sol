pragma solidity ^0.4.24;

contract FunctionNameDisambiguation {
    function A() public returns (uint) { 
        return 1;
    }

    function A(uint x) public returns (uint) { 
        return 2;
    }

    function A(int128 x) public returns (uint) { 
        return 3;
    }

    function main() {
        assert(A() == 1);
        assert(A(uint(10)) == 2);
        assert(A(int128(10)) == 3);
    }
}