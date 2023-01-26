contract Calldata {    
    function stringArgCopy(string calldata s) external returns (string memory) {
        string memory mS = s;
        return mS;
    }
    
    function byteArg(byte[] calldata s) external returns (byte) {
        return s[0];
    }
    
    function byteArgCopy(byte[] calldata s) external returns (byte) {
        byte[] memory mS = s;
        mS[0] = 0x42;
        return mS[0];
    }
}
