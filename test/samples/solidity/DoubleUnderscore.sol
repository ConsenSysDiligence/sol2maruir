pragma solidity ^0.5.10;

contract DoubleUnderscore {
    bool locked;    
    uint x;

    modifier branch(bool flag) {
        uint a;
        if (flag) {
            a = x + 1;
	        x = a;
            _;
        } else {
            a = x + 2;
	        x = a;
            _;
        }
    }

    modifier branch2(bool flag) {
        uint a;
        if (flag) {
            a = x * 3;
	        x = a;
            _;
        } else {
            a = x * 5;
	        x = a;
            _;
        }
    }

    function reset() public {
        x = 0;
    }

    function singleMod(bool flag) branch(flag) public returns (uint) {
        uint a = x;
	    return a;
    }    

    function doubleMod(bool flag) branch(flag) branch(flag) public returns (uint) {
        uint a = x;
	    return a;
    }

    function twoMods(bool flag) branch(flag) branch2(flag) public returns (uint) {
        uint a = x;
	    return a;
    }
}
