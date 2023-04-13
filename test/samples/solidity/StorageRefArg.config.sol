contract StorageRefArg {
    uint[] internal a;
    uint[] internal b;

    function setFirst(uint[] storage t, uint v) internal {
        t = b;
        t[0] = v;
    }

    function main() public returns (uint[] memory, uint[] memory) {
        a = [1, 2, 3];
        b = [4, 5, 6];
        setFirst(a, 42);
        assert(a[0] == 1);
        assert(b[0] == 42);
        return (a, b);
    }
}

contract __IRTest__ {
    function main() public {
        StorageRefArg __this__ = new StorageRefArg();
        __testCase89__(__this__);
    }

    function __testCase89__(StorageRefArg __this__) internal {
        uint256[] memory expect_89_0 = new uint256[](3);

        expect_89_0[0] = uint256(1);
        expect_89_0[1] = uint256(2);
        expect_89_0[2] = uint256(3);

        uint256[] memory expect_89_1 = new uint256[](3);

        expect_89_1[0] = uint256(42);
        expect_89_1[1] = uint256(5);
        expect_89_1[2] = uint256(6);

        (uint256[] memory ret_89_0, uint256[] memory ret_89_1) = __this__.main();

        assert(keccak256(abi.encodePacked(ret_89_0)) == keccak256(abi.encodePacked(expect_89_0)));
        assert(keccak256(abi.encodePacked(ret_89_1)) == keccak256(abi.encodePacked(expect_89_1)));
    }
}
