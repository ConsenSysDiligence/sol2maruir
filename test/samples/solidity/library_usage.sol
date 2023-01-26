pragma solidity ^0.4.24;

import './library_v04.sol';

contract LibraryUsage {
    using SafeMath for uint256;

    function libraryUsing(uint a) public returns (uint) {
        uint x = a.mul(2);

        return (x.div(2));
    }

    function libraryCall(uint a) public returns (uint) {
        uint x = SafeMath.mul(a, 2);

        return (SafeMath.div(x, 2));
    }
}
