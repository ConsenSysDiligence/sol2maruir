contract GetMoney {
    constructor() public payable {
        assert(address(this).balance == msg.value);
    }
}

contract Test {
    constructor() payable {}
    function testCreationWithValue() internal {
        uint a = 42;
        GetMoney g1 = new GetMoney{value: a}();
        assert (address(g1).balance == 42);
    }

    function main() public {
        testCreationWithValue();
    }
}
