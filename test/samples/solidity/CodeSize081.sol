pragma solidity 0.8.1;

contract CodeSize {
	function f() public returns (uint) {
		return address(this).code.length;
	}	
}
