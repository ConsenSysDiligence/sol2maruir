pragma solidity 0.8.4;

contract CantReceiveOnCreate {}

contract CanReceiveOnCreate {
    constructor() public payable {}
}

contract ReceiveThroughMethod {
    function m() external payable {}
}

contract Test {
    constructor() payable {}

    function main() public payable {
        // Doens't compile
        //CantReceiveOnCreate ctrc = (new CantReceiveOnCreate){value: 1}();
        uint myBal = address(this).balance;
        CanReceiveOnCreate crc = (new CanReceiveOnCreate){value: 1}();
        assert(address(crc).balance == 1 && myBal - 1 == address(this).balance);
        
        myBal = address(this).balance;
        ReceiveThroughMethod rtm = new ReceiveThroughMethod();
        assert(address(rtm).balance == 0 && myBal == address(this).balance);
        
        myBal = address(this).balance;
        rtm.m{value: 1}();
        assert(address(rtm).balance == 1 && myBal - 1 == address(this).balance);
        
    }
}


contract __IRTest__ {
    function main() public payable {
        Test __this__ = new Test();
        __testCase148__(__this__);
    }

    function __testCase148__(Test __this__) internal {
        __this__.main{value: msg.value}();
    }
}
