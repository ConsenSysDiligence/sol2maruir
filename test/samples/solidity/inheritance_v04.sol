pragma solidity ^0.4.24;

contract A {
    function add(uint x, uint y) public returns (uint) {
        return x+y;
    }
    
    function callAdd() public returns (uint) {
        return this.add(1,2);
    }
}

contract B is A {
    function add(uint x, uint y) public returns (uint) {
        // BAD ADD - Actually a subtract
        return x-y;
    }
}

contract C is B {
    function main(){
        uint x = this.callAdd();
    }
    
}
