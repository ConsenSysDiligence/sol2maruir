pragma solidity 0.8.19;

contract GetMoney {
    constructor() payable {
        assert(address(this).balance == msg.value);
    }
}

contract Test {
    constructor() payable {}

    function testCreationWithValue() internal {
        uint a = 42;
        GetMoney g1 = new GetMoney{value: a}();
        assert(address(g1).balance == 42);
    }

    function main() public payable {
        testCreationWithValue();
    }
}

contract __IRTest__ {
    function main() public payable {
        Test __this__ = new Test{value: msg.value}();
        __testCase67__(__this__);
    }

    function __testCase67__(Test __this__) internal {
        __this__.main();
    }
}
