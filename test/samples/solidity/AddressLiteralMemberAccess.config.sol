pragma solidity 0.7.6;

contract AddressLiteralMemberAccess {
    function verify() public {
        uint b = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.balance;
        bool sendSuccess = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.send(1 wei);
        0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.transfer(1 wei);
        (bool callSuccess, bytes memory callResult) = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.call("");
        (bool sCallSuccess, bytes memory sCallResult) = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.staticcall("");
    }
}

contract __IRTest__ {
    function main() public {
        AddressLiteralMemberAccess __this__ = new AddressLiteralMemberAccess();
        __testCase55__(__this__);
    }

    function __testCase55__(AddressLiteralMemberAccess __this__) internal {
        try __this__.verify() {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}