pragma solidity ^0.4.13;

contract IntByteCasts {
    function main() public {
        bytes16 a = 0;
        bytes32 b = 10;
        
        uint8 c = uint8(a);
        int16 d = int16(b);
    }
}
