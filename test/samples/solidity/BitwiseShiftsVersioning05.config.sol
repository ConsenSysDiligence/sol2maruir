/// Returns `-2` for 0.4.x and `-3` since 0.5.x
contract Test {
    function main() public returns (int256) {
        int256 a = -5;
        return a >> 1;
    }
}

contract __IRTest__ {
    function main() public {
        Test __this__ = new Test();
        __testCase30__(__this__);
    }

    function __testCase30__(Test __this__) internal {
        int256 expect_30_0 = (int256(-3));
        int256 ret_30_0 = __this__.main();
        assert(ret_30_0 == expect_30_0);
    }
}