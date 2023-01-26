contract Test {
    function verify() public {
        uint8[3] memory a = [uint8(1), 2, 3];
        uint8[3] memory b = uint8[3](a);

        a[1] = 10;

        assert(a[0] == 1);
        assert(a[1] == 10);
        assert(a[2] == 3);

        assert(b[0] == 1);
        assert(b[1] == 10);
        assert(b[2] == 3);
    }
}
