pragma solidity "0.8.17";

contract A {
	uint x;

	constructor(uint a) {
		x = a;
	}

	function inc() public returns (uint) {
		x = x + 1;
		return x;
	}
}
