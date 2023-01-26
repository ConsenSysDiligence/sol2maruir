contract CalldataArgPassing {    
    function callee(string calldata s) external {
        assert(keccak256(abi.encodePacked(s)) == keccak256(abi.encodePacked('abcd')));
    }
    
    function main() public {
        string memory arg = 'abcd';
        this.callee(arg);
    }
}