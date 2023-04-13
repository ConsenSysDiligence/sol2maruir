pragma solidity ^0.6.9;
pragma experimental ABIEncoderV2;
pragma experimental SMTChecker;

contract Test {
    /// Stored values
    uint[] public values;

    function addValues(uint[] calldata row) public returns (uint[] calldata) {
        uint256[] calldata local = row;
        return pushToValues(local);
    }

    function pushToValues(uint[] calldata row) private returns (uint[] calldata) {
        for (uint i = 0; i < row.length; i++) {
            values.push(row[i]);
        }
        return row;
    }
}

contract __IRTest__ {
    function main() public {
        Test __this__ = new Test();
        __testCase86__(__this__);
        __testCase137__(__this__);
        __testCase169__(__this__);
        __testCase201__(__this__);
    }

    /**
     * This func has significant changes
     * due to in Solidity there is no way
     * to allocate local calldata variable
     */
    function __testCase86__(Test __this__) internal {
        uint256[] memory expect_86_0 = new uint256[](3);

        expect_86_0[0] = uint256(1);
        expect_86_0[1] = uint256(2);
        expect_86_0[2] = uint256(3);

        uint256[] memory input = new uint256[](3);

        input[0] = uint256(1);
        input[1] = uint256(2);
        input[2] = uint256(3);

        uint256[] memory ret_86_0 = __this__.addValues(input);
        assert(keccak256(abi.encodePacked(ret_86_0)) == keccak256(abi.encodePacked(expect_86_0)));
    }

    function __testCase137__(Test __this__) internal {
        uint256 expect_137_0 = (uint256(1));
        uint256 ret_137_0 = __this__.values(uint256(0));
        assert(ret_137_0 == expect_137_0);
    }

    function __testCase169__(Test __this__) internal {
        uint256 expect_169_0 = (uint256(2));
        uint256 ret_169_0 = __this__.values(uint256(1));
        assert(ret_169_0 == expect_169_0);
    }

    function __testCase201__(Test __this__) internal {
        uint256 expect_201_0 = (uint256(3));
        uint256 ret_201_0 = __this__.values(uint256(2));
        assert(ret_201_0 == expect_201_0);
    }
}