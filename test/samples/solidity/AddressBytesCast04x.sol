pragma solidity ^0.4.0;


contract AddressBytesCast04x {
    function main() public {
        bytes21 a = 0x01000000000000000000000000000000000000000f;
        address b = address(a);
        bytes21 c = bytes21(b);
        assert(b == address(0xf));
        assert(c == 0xf);
    }
}
