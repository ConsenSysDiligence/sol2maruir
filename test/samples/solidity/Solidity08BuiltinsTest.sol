pragma solidity ^0.8.0;

contract Solidity08BuiltinsTest {
    function addrCodeAndCodeHash() view public returns (uint, bytes memory, bytes32) {
        // deployed bytecode as bytes memory
        bytes memory code = address(this).code;
        // keccak256 of deployed bytecode
        bytes32 codeHash = address(this).codehash;
        bytes32 customHash = keccak256(code);

        assert(codeHash == customHash);

        return (code.length, code, codeHash);
    }
    
    function blockChainId() view public returns (uint) {
        return block.chainid;
    }
}
