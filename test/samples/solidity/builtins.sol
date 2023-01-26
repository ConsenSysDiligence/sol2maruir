pragma solidity ^0.4.24;

contract Builtins {
    function addOne(uint a) public returns (uint) {
        return a+1;
    }

    function builtins() public payable {
        bytes32 a = block.blockhash(1+1);
        uint b = msg.gas;
        address myAddress = this;
        uint myBalance = this.balance;
        suicide(someAddress);

        bytes32 c = sha256("foo");
        bytes32 d = sha3("foo");

        address someAddress = 0xCf5609B003B2776699eEA1233F7C82D5695cC9AA;
        bool r1 = someAddress.call(abi.encode("calculate(uint, uint)", 1, 2));
        r1 = someAddress.delegatecall(abi.encode("calculate(uint, uint)", 1, 2));
        r1 = someAddress.callcode(abi.encode("calculate(uint, uint)", 1, 2));

        r1 = someAddress.call.value(55)();
        r1 = someAddress.call.gas(100)(bytes4(sha3("deposit()")));
        r1 = someAddress.call.value(100).gas(44)(bytes4(sha3("deposit()")));
        r1 = someAddress.call.gas(44).value(100)(bytes4(sha3("deposit()")));
        r1 = someAddress.call.gas(44).gas(45).value(100).value(101)(bytes4(sha3("deposit()")));

        address someOtherAddress = 0xDEADBEEF;
        bool flag;

        r1 = (flag ? someAddress : someOtherAddress).call.value(100).gas(1123)(bytes4(sha3("deposit()")));

        bytes4 h = this.addOne.selector;
    }
}
