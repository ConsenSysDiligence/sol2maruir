/**
 * Returns `-2` for 0.4.x and `-3` since 0.5.x
 */
contract Test {
    function main() public returns (int256) {
        int256 a = -5;
        return a >> 1;
    }
}
