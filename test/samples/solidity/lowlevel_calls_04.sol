pragma solidity 0.4.26;

contract NoFB {
    
}

contract FBNoArgs {
    int8 public lastCall = 0;
    
    function() external payable {
        lastCall = 1;
    }
    
    function id(uint x) public returns (uint) {
        lastCall = 2;
        return x;
    }
}

contract AcceptFalback {
    function() external payable {  }
}

contract RejectFallback {
    function() external payable { assert(false); }
}

contract RejectNoFuns {
    
}

contract AcceptFun {
    function id(uint x) public payable returns (uint) {
        return x;
    }
}

contract RejectFun {
    function id(uint x) public payable returns (uint) {
        assert(false);
    }
}

contract Throws {
    function throws(bool shouldFail) public {
        if (shouldFail) {
            revert("foo");
        }
    }
        
    function double(uint x) public returns (uint) {
        return x + x;
    }
}

contract Test {
    uint public x;
    
    function inc() external returns (uint) {
        x++;
        return x;
    }
    
    function incAndThrow() external {
        x++;
        revert("foo");
    }
    
    constructor() payable {}
    
    function getIdData(uint x) internal returns (bytes memory) {
        return abi.encodeWithSignature("id(uint256)", x);
    }
    
    function transfer(address a) public {
        a.transfer(1);
    }
    
    function noContractTests() public returns (bool) {
        // For some stupid reason calls to a non-existent contract succeed in 0.4.x
        address a = address(0x0000000000000000000000111111111111111111);
        
        bool res0 = a.call.gas(23000)("");
        assert(res0);
        
        // no successful normal call
        bool res1 = a.call.gas(23000)(getIdData(1));
        assert(res1);
        
        // no successful callcode call
        // @todo support callcode
        /*
        bool res2 = a.callcode.gas(23000)(getIdData(1));
        assert(res2);
        */

        // no successful delegatecall call
        /*
        bool res3 = a.delegatecall.gas(23000)(getIdData(1));
        assert(res3);
        */

        // no successful send
        /*
        @todo note somewhere we differ from 0.4.x's behavior in this case of send
        bool res4 = a.send(0);
        assert(res4);
        */
    }
    
    function fallbackTests() public returns (bool, int8) {
        FBNoArgs c = new FBNoArgs();
        address a = address(c);
        
        // Normal call doesn't go to the fallback
        bool res0 = a.call.gas(23000)(getIdData(42));
        assert(res0 && c.lastCall() == 2);

        // Call with no bytes will go to fallback
        bool res1 = a.call.gas(23000)(hex"");
        assert(res1&& c.lastCall() == 1);
        
        // Call with <4 bytes will go to fallback
        bool res2 = a.call.gas(23000)(hex"0a0b");
        assert(res2 && c.lastCall() == 1);
        
        // Call with invalid selector will go to fallback
        bool res3 = a.call.gas(23000)(hex"0a0b0c0d000000000000000000000000000000000000000000000000000000000000000000");
        assert(res3 && c.lastCall() == 1);
        
        // FBNoArgs.id.selector is 0x7d3c40c8
        // Call with valid selector but invalid arguments fails
        /*
        @todo Note somewhere we differe from 0.4.x in these cases:

        bool res4 = a.call.gas(23000)(hex"7d3c40c8");
        assert(res4 && c.lastCall() == 2);

        bool res5 = a.call.gas(23000)(hex"7d3c40c8deadbeef");

        assert(res5 &&c.lastCall() == 2);
        */
    }
    
    function noFallbackTest() public {
        NoFB c = new NoFB();
        address a = address(c);
        
        // Normal call fails
        bool res0 = a.call.gas(2300)(getIdData(42));
        assert(!res0);

        // Empty string call fails
        bool res1 = a.call.gas(2300)(hex"");
        assert(!res1);
        
        // Call with <4 bytes fails
        bool res2 = a.call.gas(2300)(hex"0a0b");
        assert(!res2);
    }
    
    /*
    function delegatecallTests(Test other) public {
        assert(address(other) != address(this));
        
        address a = address(other);
        
        // Effects of the callee happen to our own storage
        bytes memory msgData = abi.encodeWithSignature("inc()");
        uint oldX = x;
        uint otherOldX = other.x();
        bool res = a.delegatecall(msgData);
        
        assert(res);
        assert(x == oldX + 1);
        assert(otherOldX == other.x());
        
        // If the callee reverts all of its effects are undone
        bytes memory msgFailData = abi.encodeWithSignature("incAndThrow()");
        oldX = x;
        bool res1 = a.delegatecall(msgFailData);
        assert(!res1);
        assert(x == oldX);
    }
    */
    
    function callTests(Test other) public {
        address a = address(other);

        bytes memory msgData = abi.encodeWithSignature("inc()");
        uint oldX = x;
        uint otherOldX = other.x();
        bool res = a.call(msgData);
        
        assert(res);
        assert(x == oldX);
        assert(otherOldX + 1 == other.x());
        
        // On a successful call with a value balances change
        AcceptFun af = new AcceptFun();
        address afAddr = address(af);
        
        bytes memory msgData2 = abi.encodeWithSignature("id(uint256)", 42);
        uint oldBal = address(this).balance;
        uint oldAfBal = afAddr.balance;
        
        bool res2 = afAddr.call.value(1)(msgData2);
        assert(res2);
        assert(oldBal == address(this).balance + 1);
        assert(oldAfBal == afAddr.balance - 1);
        
        // On a failing call with a value balances dont change
        RejectFun rf = new RejectFun();
        address rfAddr = (address(rf));
        
        oldBal = address(this).balance;
        uint oldRfBal = rfAddr.balance;
        
        bool res3 = rfAddr.call.value(1)(msgData2);
        assert(!res3);
        assert(oldBal == address(this).balance);
        assert(oldRfBal == rfAddr.balance);
    }
    
    function exceptionBytesTests() public {
        Throws c = new Throws();
        address a = address(c);
        
        bytes memory successMsgData = abi.encodeWithSignature("throws(bool)", false);
        bool res0 = a.call.gas(2300)(successMsgData);
        assert(res0);
        
        bytes memory failMsgData = abi.encodeWithSignature("throws(bool)", true);
        bool res1 = a.call.gas(2300)(failMsgData);
        assert(!res1);
    }
    
    function sendTests() public {
        // Another contract accepts payments with fallback
        AcceptFalback af = new AcceptFalback();
        address  afAddr = (address(af));
        
        uint oldBalance = afAddr.balance;
        assert(afAddr.send(1));
        assert(oldBalance + 1 == afAddr.balance);

        // Another contract can reject payments in fallback
        RejectFallback rf = new RejectFallback();
        address  rfAddr = (address(rf));
        
        oldBalance = rfAddr.balance;
        assert(!rfAddr.send(1));
        assert(oldBalance == rfAddr.balance);

        // Contract with no receive and no fallback can't accept normal payments
        RejectNoFuns rnf = new RejectNoFuns();
        address  rnfAddr = (address(rnf));
        
        oldBalance = rnfAddr.balance;
        assert(!rnfAddr.send(1));
        assert(oldBalance == rnfAddr.balance);
    }

    function transferTests() public returns (uint res) {
        // Another contract accepts payments with fallback
        AcceptFalback af = new AcceptFalback();
        address  afAddr = (address(af));
        
        uint oldBalance = afAddr.balance;
        afAddr.transfer(1);
        assert(oldBalance + 1 == afAddr.balance);
    }

    
    function main() public {
        noContractTests();
        noFallbackTest();
        fallbackTests();
        exceptionBytesTests();
        sendTests();
        transferTests();
    }
}
