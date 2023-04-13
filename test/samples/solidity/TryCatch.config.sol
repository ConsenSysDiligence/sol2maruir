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

contract __IRTest__ {
    function main() public {
        TryCatch __this__ = new TryCatch();
        __testCase309__(__this__);
        __testCase346__(__this__);
        __testCase375__(__this__);
        __testCase389__(__this__);
        __testCase403__(__this__);
        __testCase432__(__this__);
    }

    function __testCase309__(TryCatch __this__) internal {
        string memory expect_309_0 = ("test");
        string memory ret_309_0 = __this__.catchHighLevelException();
        assert(keccak256(abi.encodePacked(ret_309_0)) == keccak256(abi.encodePacked(expect_309_0)));
    }

    function __testCase346__(TryCatch __this__) internal {
        uint256 expect_346_0 = (uint256(42));
        uint256 ret_346_0 = __this__.catchLowLevelException();
        assert(ret_346_0 == expect_346_0);
    }

    function __testCase375__(TryCatch __this__) internal {
        __this__.catchHighLevelExceptionUnnamedArgs();
    }

    function __testCase389__(TryCatch __this__) internal {
        __this__.successUnnamed();
    }

    function __testCase403__(TryCatch __this__) internal {
        uint256 expect_403_0 = (uint256(43));
        uint256 ret_403_0 = __this__.successNamed();
        assert(ret_403_0 == expect_403_0);
    }

    function __testCase432__(TryCatch __this__) internal {
        (string memory expect_432_0, uint256 expect_432_1) = ("hihi", uint256(11));
        (string memory ret_432_0, uint256 ret_432_1) = __this__.reThrowTest();
        assert(keccak256(abi.encodePacked(ret_432_0)) == keccak256(abi.encodePacked(expect_432_0)));
        assert(ret_432_1 == expect_432_1);
    }
}
