contract Test {
    function returnsTuple() internal pure returns(uint a, uint b) {
        return (1, 2);
    }

    function callsReturnsTuple() public pure returns(uint a, uint b) {
        return (((((returnsTuple())))));
    }

    function verify() public {
        (uint a1, uint b1) = returnsTuple();

        assert(a1 == 1);
        assert(b1 == 2);

        (uint a2, uint b2) = callsReturnsTuple();

        assert(a2 == 1);
        assert(b2 == 2);
    }
}
