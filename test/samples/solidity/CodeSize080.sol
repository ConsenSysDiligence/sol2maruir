pragma solidity 0.8.0;

contract CodeSize {
	function f() public returns (uint) {
		return address(this).code.length;
	}	
}
