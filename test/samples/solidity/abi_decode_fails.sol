contract Test {
    function main() public {
        uint a;
        uint b;

        (a, b) = abi.decode(bytes("0x01"), (uint, uint));
    }
}
