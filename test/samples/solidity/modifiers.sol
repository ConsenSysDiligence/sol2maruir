pragma solidity ^0.4.24;

contract Modifiers {
    uint256 b;
    uint public sum = 0;

    modifier checkBefore(uint x, uint y) {
        require(x != y);

        _;
        // x and y are actually affected by changes
        //    require(x > y);
    }

    modifier checkAfter(uint x, uint y){
        _;

        require(x > y);
    }

    modifier increaseSum(){
        _;

        require(sum > 0);

        sum += 1;
    }

    modifier greaterThanStateVar(uint c) {
        uint a; // modifiers can define local variables

        a = c;

        require(a > b); // modifiers can refer to state variables

        _;
    }

    // The same modifier can be applied twice to a function
    function modifierRepeated(uint x, uint y) public greaterThanStateVar(x) greaterThanStateVar(y) returns (uint) {
        return x + y;
    }

    function modifierBefore(uint x, uint y) public checkBefore(x, y) returns (uint) {
        return x + y;
    }

    function modifierReturn(uint x, uint y) public increaseSum() returns (uint){
        sum = 1;
        // returns 1 and sum is 2 if x = 1 and y = 0

        return sum;
    }

    function modifierAfter(uint x, uint y) public checkAfter(x, y) returns (uint){
        x += 1;

        return x + y;
    }

    function modifierTwo(uint x, uint y) public checkAfter(x, y) checkBefore(x, y) returns (uint) {
        return x + y;
    }

    modifier alterMemoryBefore(uint[3] memory x) {
        x[0] = 1;

        _;
    }

    function modifierChangeMemoryArrBefore(uint[3] memory a) public alterMemoryBefore(a) returns (uint[3] memory) {
        // This returns [1, _, _] as alterMemoryBefore changes memory.
        return a;
    }

    modifier alterMemoryAfter(uint[3] memory x) {
        _;

        x[0] = 1;
    }

    function modifierChangeMemoryArrAfter1(uint[3] memory a) public alterMemoryAfter(a) returns (uint[3] memory) {
        // This returns [1, _, _] as even though alterMemoryAfter runs after the body of the function, it runs before the caller
        // so if you call modifierChangeMemoryArrAfter1([5,5,5]) you would get [1,5,5]
        return a;
    }

    function modifierChangeMemoryArrAfter2(uint[3] memory a) public alterMemoryAfter(a) returns (uint) {
        // This returns whatever the caller passed in in a[0] instead of one, since the mutation happens after the fun body
        // So if you call modifierChangeMemoryArrAfter2([5,5,5]) you would get 5 instead of 1
        uint res = a[0];

        return res;
    }
}
