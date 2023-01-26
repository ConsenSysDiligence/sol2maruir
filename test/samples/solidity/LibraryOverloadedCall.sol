library Some {
    function add(uint a, uint b) internal returns (uint) {
        return a + b;
    }

    function add(uint a, uint b, uint c) internal returns (uint) {
        return a + b + c;
    }
}

contract Test {
    function verify() public {
        assert(Some.add(1, 2) == 3);
        assert(Some.add(1, 2, 3) == 6);
    }
}
