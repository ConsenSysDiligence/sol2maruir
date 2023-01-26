pragma solidity ^0.5.0;

contract CastInBraces {
    function main() public {
        int8 a = (int8)(128 + 129);
	    assert(a == 1);
    }
}
