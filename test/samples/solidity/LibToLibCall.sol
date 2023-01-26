pragma solidity ^0.4.24;

library Test {
    function a() pure public returns (uint) {
        return 1;
    }
    
    function b() pure public returns (uint) {
        return 1 + a();
    }
}

contract LibToLibCall {
    function main() public {
        assert(Test.b() == 2);
    }
}
