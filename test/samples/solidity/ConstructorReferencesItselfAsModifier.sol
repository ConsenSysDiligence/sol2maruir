pragma solidity ^0.5.0;

contract Test {
    uint public a = 0;

    constructor() Test() public {
        a++;
    }

    function verify() public {
        assert(a == 1);
    }
}
