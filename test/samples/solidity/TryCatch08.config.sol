pragma solidity ^0.8.4;

contract TryCatch08 {
    uint x;
    
    function throwString(string memory str) external  {
        require(false, str);
    }
    
    function throwAssert() external {
        assert(false);
    }
    
    function throwOverflow() external {
        uint t= 2**255;
        t * 3;
    }
    
    function throwDivByZero() external {
        uint t = 0;
        1234 / t;
    }
    
    enum E {
        A,B,C
    }
    
    function throwEnumCast() external {
        uint t = 3;
        E(t);
    }
    
    uint[] arr;
    
    function throwPopEmpty() external {
        arr.pop();    
    }
    
    function throwIdxOoB1() external {
        arr[1] = 0;
    }

    function throwIdxOoB2() external {
        uint t = arr[1];
    }

    function throwIdxOoB3() external {
        bytes10 a;
        uint t = 10;
        a[t];
    }
    
    function throwAllocTooMuch() external {
        uint[] memory m = new uint[](2**255);
    }
    
    function noCatchAll() external {
        // This should re-throw silently as there is no catch-all
        try this.throwOverflow() {
            x = 1;
        } catch Error(string memory s) {
            x = 2;
        }
    }

    error CustomError(uint8 a, int16 b, address c);

    function throwCustom() external {
        revert CustomError(1, -1, address(0x0));
    }
    
    function main() public {
        x = 0;

        // Throwing a string gets caught by the Error() case regardless of
        // the order
        try this.throwString("abc") {
            assert(false);
        } catch Panic(uint code) {
            assert(false);
        } catch {
            assert(false);
        } catch Error(string memory m) {
            assert(keccak256(bytes(m)) == keccak256(bytes("abc")));
        }
        
        // Throwing a string, in the absence of Error clause gets caught by catch-all.
        // The selector is that for Error
        try this.throwString("abc") {
            assert(false);
        } catch Panic(uint code) {
            assert(false);
        } catch (bytes memory err) {
            assert(err[0] == 0x08 && err[1] == 0xc3 && err[2] == 0x79 && err[3] == 0xa0);
        }

        // Throwing a Panic gets caught by the Panic() case regardless of
        // the order
        try this.throwOverflow() {
            assert(false);
        } catch Error(string memory m) {
            assert(false);
        } catch {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x11);
        }

        
        // Throwing a Panic, in the absence of Panic clause gets caught by catch-all.
        // The selector is that for Panic
        try this.throwOverflow() {
            assert(false);
        } catch Error(string memory s) {
            assert(false);
        } catch (bytes memory err) {
            assert(err[0] == 0x4e && err[1] == 0x48 && err[2] == 0x7b && err[3] == 0x71);
        }

        // A try/catch without a catch-all that doesn't match an exception re-throws
        try this.noCatchAll() {
            assert(false);
        } catch Error(string memory x) {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x11 && x == 0);
        } catch {
            assert(false);
        }

        // Assert results in a Panic(0x1)
        try this.throwAssert() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x1);
        }
        
        // Overflow results in a Panic(0x11)
        try this.noCatchAll() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x11);
        }
        
        // Div by zero results in a Panic(0x12)
        try this.throwDivByZero() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x12);
        }
        
        // Invalid enum cast results in a Panic(0x21)
        try this.throwEnumCast() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x21);
        }
        
        // Pop on empty array results in a Panic(0x31)
        try this.throwPopEmpty() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x31);
        }
        
        // Index out-of-bounds results in a Panic(0x32)
        try this.throwIdxOoB1() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x32);
        }
        
        // Index out-of-bounds results in a Panic(0x32)
        try this.throwIdxOoB2() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x32);
        }
        
        // Index out-of-bounds results in a Panic(0x32)
        try this.throwIdxOoB3() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x32);
        }

        
        try this.throwCustom() {
            assert(false);
        } catch (bytes memory data) {
            bytes memory expected = hex"5eb2ac070000000000000000000000000000000000000000000000000000000000000001ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000";
            assert(keccak256(data) == keccak256(expected));
        }
        // Allocating too-much memory results in a Panic(0x32)
        // TODO (dimo) eventually support this too?
        /**
        try this.throwAllocTooMuch() {
            assert(false);
        } catch Panic(uint code) {
            assert(code == 0x41);
        }
        */
    }
}

contract __IRTest__ {
    function main() public {
        TryCatch08 __this__ = new TryCatch08();
        __testCase617__(__this__);
    }

    function __testCase617__(TryCatch08 __this__) internal {
        __this__.main();
    }
}
