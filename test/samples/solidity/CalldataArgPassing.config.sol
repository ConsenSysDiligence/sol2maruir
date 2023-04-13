contract CalldataArgPassing {
    function callee(string calldata s) external {
        assert(keccak256(abi.encodePacked(s)) == keccak256(abi.encodePacked("abcd")));
    }

    function main() public {
        string memory arg = "abcd";
        this.callee(arg);
    }
}

contract __IRTest__ {
    function main() public {
        CalldataArgPassing __this__ = new CalldataArgPassing();
        __testCase51__(__this__);
    }

    function __testCase51__(CalldataArgPassing __this__) internal {
        __this__.main();
    }
}