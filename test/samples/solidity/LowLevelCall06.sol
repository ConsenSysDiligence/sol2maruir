pragma solidity ^0.6.3;

contract FailCallee {
    uint public x;

    constructor () public {
        x = 1;
    }
    
    function highLevelFail(uint a) public payable {
        x = 42;
        revert('foo');
    }
    
    function lowLevelFail(uint b) public payable {
        x = 43;
        assert(false);
    }
    
    function success(uint a) public payable {
        x = a;
    }
}

contract Caller {
    function main() public {
        FailCallee f = new FailCallee();
        address payable fAddr = address(uint160(address(f)));
        
        uint a = 11;
        bytes memory arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 1);
        (bool success, bytes memory returnData) = fAddr.call(arg);
        assert(success);
        assert(f.x() == 11);
    
        arg = abi.encodeWithSignature("highLevelFail(uint256)", a);
        assert(f.x() == 11);
        (success, returnData) = fAddr.call(arg);
        assert(!success);
        assert(f.x() == 11);
        arg = abi.encodeWithSignature("lowLevelFail(uint256)", a);
        (success, returnData) = fAddr.call(arg);
        assert(!success);
        assert(f.x() == 11);
    }

    function main2() public {
        FailCallee f = new FailCallee();
        address payable fAddr = address(uint160(address(f)));

        uint a = 11;
        bytes memory arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 1);
        (bool success, bytes memory returnData) = fAddr.call(arg);
        assert(success);
        assert(f.x() == 11);

        a = 12;
        arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 11);
        (success, returnData) = fAddr.call.gas(10000)(arg);
        assert(success);
        assert(f.x() == 12);

        a = 13;
        arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 12);
        (success, returnData) = fAddr.call.value(0)(arg);
        assert(success);
        assert(f.x() == 13);

        a = 14;
        arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 13);
        (success, returnData) = fAddr.call.value(0).gas(10000)(arg);
        assert(success);
        assert(f.x() == 14);

        a = 15;
        arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 14);
        (success, returnData) = fAddr.call{gas:10001}(arg);
        assert(success);
        assert(f.x() == 15);

        a = 16;
        arg = abi.encodeWithSignature("success(uint256)", a);
        assert(f.x() == 15);
        (success, returnData) = fAddr.call{gas:10001}.value(0).gas(10000)(arg);
        assert(success);
        assert(f.x() == 16);
    }
}
