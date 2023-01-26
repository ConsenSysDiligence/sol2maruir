pragma solidity ^0.6.9;
pragma experimental ABIEncoderV2;
pragma experimental SMTChecker;

contract Test {
    /// Stored values
    uint[] public values;

    function addValues(uint[] calldata row) public returns(uint[] calldata) {
        uint256[] calldata local = row;

        return pushToValues(local);
    }

    function pushToValues(uint[] calldata row) private returns(uint[] calldata) {
        for (uint i = 0; i < row.length; i++) {
            values.push(row[i]);
        }

        return row;
    }
}
