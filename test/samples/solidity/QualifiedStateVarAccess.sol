pragma solidity ^0.5.0;

contract A {
    uint public val;

    constructor(uint v) public {
        val = v;
    }
}

contract B is A(1) {
    uint public val;

    constructor() public {
        val = 2;
    }

    function verify() public {
        assert(A.val == 1);
        assert(B.val == 2);
    }
}
