pragma solidity ^0.7.0;

contract Test {
    uint public x = 5;

    function some(uint a) public view returns (uint) {
        require(a > 10);

        return a + x + 10;
    }
}
