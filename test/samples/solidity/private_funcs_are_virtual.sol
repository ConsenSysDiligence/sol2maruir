pragma solidity ^0.4.24;

contract Base {
    function boo() public returns (uint) {
        // Proof that private functions can be overriden too.
	return foo();
    }
    function foo() private returns (uint) { return 1; }
}

contract Child is Base {
    function foo() private returns (uint) { return 2; }
}

contract PrivateFuncsAreVirtual {
    function main() {
	Base b = new Child();
	Base b1 = new Base();

	assert(b.boo() == 2);
	assert(b1.boo() == 1);
    }
}
