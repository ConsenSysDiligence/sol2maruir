pragma solidity ^0.6.0;

contract TryCatch {
    uint public x;
    
    function catchHighLevelException() public returns (string memory) {
        try this.requireFail('test') {
            assert(false); // Shouldn't succeed
        } catch Error(string memory m) {
            return m;
        } catch (bytes memory b) {
            assert(false); // Shouldn't throw low-level exceptions.
        }
    }
    
    function requireFail(string memory msg) public {
        require(false, msg);
    }

    function catchLowLevelException() public returns (uint) {
        try this.assertFail() {
            assert(false); // Shouldn't succeed
        } catch Error(string memory m) {
            assert(false); // Shouldn't throw high-level exceptions.
        } catch (bytes memory b) {
            return 42;
        }
    }
    
    function assertFail() public {
        assert(false);
    }

    
    function catchHighLevelExceptionUnnamedArgs() public {
        try this.requireFail('test') {
            assert(false); // Shouldn't succeed
        } catch Error(string memory) {
        } catch (bytes memory b) {
            assert(false); // Shouldn't throw low-level exceptions.
        }
    }

    function echo(uint x) public returns (uint) {
        return x;
    }

    function successUnnamed() public {
        try this.echo(42) returns (uint) {
            //
        } catch Error(string memory m) {
            assert(false);
        } catch (bytes memory b) {
            assert(false);
        }
    }

    function successNamed() public returns (uint) {
        try this.echo(42) returns (uint v) {
            return v+1;
        } catch Error(string memory m) {
            assert(false);
        } catch (bytes memory b) {
            assert(false);
        }
    }

    function reThrowHighLevel() public {
        x = 22;
        try this.requireFail('hi') {
            assert(false); // shouldn't succeed
        } catch Error(string memory m) {
            x = 23;
            // Re-throw the error
            assert(keccak256(abi.encodePacked(m)) == keccak256(abi.encodePacked('hi')));
            require(false, 'hihi');
        } catch (bytes memory b) {
            assert(false); // shouldn't succeed
        }
    }

    function reThrowTest() public returns (string memory, uint) {
        x = 11;
        try this.reThrowHighLevel() {
            assert(false); // shouldn't succeed
        } catch Error(string memory m) {
            return (m, x);
        } catch (bytes memory b) {
            assert(false);
        }
    }
}