contract AddressLiteralMemberAccess {
    function verify() public {
        uint b = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.balance;

        bool sendSuccess = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.send(1 wei);

        0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.transfer(1 wei);

        (bool callSuccess, bytes memory callResult) = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.call("");
        (bool dCallSuccess, bytes memory dCallResult) = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.delegatecall("");
        (bool sCallSuccess, bytes memory sCallResult) = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF.staticcall("");
    }
}
