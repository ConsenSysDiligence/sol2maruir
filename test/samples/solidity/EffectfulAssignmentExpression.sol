pragma solidity ^0.4.24;

contract EffectfulAssignmentExpression {
    uint x;

    function main() public {
        assert((x=x+1) == 1);
    }
}
