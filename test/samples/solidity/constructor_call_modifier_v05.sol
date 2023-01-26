pragma solidity ^0.5.7;

contract A {
    bool on = false;
    
    constructor(bool s) public {
        on = s;
    }
    
    function lol() public{}
}


contract B{
    
}

contract D {
    uint someVar;
    constructor(uint v) public {
        someVar =v;
    }
}

contract C is A,B,D {
    constructor() public D(1+1) B() A(true){
        uint x =1;
    }
}