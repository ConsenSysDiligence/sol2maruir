pragma solidity ^0.6.0;

contract CalldataSlices {
    function first(uint x, uint y) public returns (uint) {
        return abi.decode(msg.data[4:36], (uint));
    }

    function second(uint x, uint y) public returns (uint) {
        return abi.decode(msg.data[36:], (uint));
    }
}

contract __IRTest__ {
    function main() public {
        CalldataSlices __this__ = new CalldataSlices();
        __testCase65__(__this__);
        __testCase100__(__this__);
    }

    function __testCase65__(CalldataSlices __this__) internal {
        uint256 expect_65_0 = (uint256(42));
        uint256 ret_65_0 = __this__.first(uint256(42), uint256(13));
        assert(ret_65_0 == expect_65_0);
    }

    function __testCase100__(CalldataSlices __this__) internal {
        uint256 expect_100_0 = (uint256(13));
        uint256 ret_100_0 = __this__.second(uint256(42), uint256(13));
        assert(ret_100_0 == expect_100_0);
    }
}