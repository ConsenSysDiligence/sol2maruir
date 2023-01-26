pragma solidity ^0.6.2;

library TestLibrary {
    function some(uint arg) pure external returns (uint ret) {
        return arg + 100;
    }
}

interface TestInterface {
    function someOther(string calldata arg) pure external returns (bytes memory);
}

contract SelectorTest {
    function verify() public {
        assert(TestLibrary.some.selector == 0x206e0cd6);
        assert(TestInterface.someOther.selector == 0xdda16b9e);
        assert(this.verify.selector == 0xfc735e99);
    }
}
