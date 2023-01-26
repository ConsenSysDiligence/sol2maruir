pragma solidity ^0.4.24;

library L {
    function safeAdd(B b, uint a) public {
        require(a+b.ctr()<10);
        b.add(a);
    }
}

contract B {
    uint public  ctr;
    
    function add(uint a) public {
        ctr += a;
    }
}

contract C {
    using L for B;
    function main(B b) {
        b.safeAdd(1);
    }
}