pragma solidity ^0.4.24;

contract Casting {
    function testIntToInt() public {
        int16 a = 300;
        uint8 b = uint8(a);

        assert(b == 44);

        a = -300;
        b = uint8(a);

        assert(b == 212);

        uint8 c = 200;
        int8 d = int8(c);

        assert(d == -56);

        c = 255;
        d = int8(c);

        assert(d == -1);

        int16 e = 32767;
        int8 f = int8(e);

        assert(f == -1);

        e = 31000;
        f = int8(e);

        assert(f == 24);

        e = -31000;
        f = int8(e);

        assert(f == -24);

        e = 128;
        f = int8(e);

        assert(f == -128);
    }

    function testIntToAddress() public {
        uint256 a = 115792089237316195423570985008687907853269984665640564039457584007913129639935;
        address b = address(a);
        address c = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

        assert(b == c);

        int8 d = -1;
        b = address(d);
        c = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;

        assert(b == c);

        d = -100;
        b = address(d);
        c = 0xffFfFFfFffFFffFFfFFfFfffFffFFfFffffFFF9C;

        assert(b == c);

        a = 1000000;
        b = address(a);
        c = 0x00000000000000000000000000000000000F4240;

        assert(b == c);
    }

    function testBytesToAddress() public {
        bytes20 x = bytes20(0x43beAFeA1abC523D465fE7Af45F2c5846f96AD1d);
        address y = address(x);
        bytes20 z = bytes20(y);
    }

    function testBytesToInt() public {
        bytes2 a = 0x011D;
        uint16 b = uint16(a);

        assert(a[0] == 0x01);
        assert(a[1] == 0x1D);
        assert(b == 285);

        b = 65535;
        a = bytes2(b);

        assert(a[0] == 0xFF);
        assert(a[1] == 0xFF);

        byte c = 0xD3;
        uint8 d = uint8(c);

        assert(d == 211);

        d = 156;
        c = byte(d);

        assert(c == 0x9C);

        bytes32 e = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        uint256 f = uint256(e);

        assert(f == 115792089237316195423570985008687907853269984665640564039457584007913129639935);

        f = 115792089237316195423570985008687907853269984665640564039457584007913129639934;
        e = bytes32(f);

        uint8 x = 31;

        assert(e[0] == 0xff);
        assert(e[1] == 0xff);
        assert(e[2] == 0xff);
        assert(e[3] == 0xff);
        assert(e[4] == 0xff);
        assert(e[5] == 0xff);
        assert(e[6] == 0xff);
        assert(e[7] == 0xff);
        assert(e[8] == 0xff);
        assert(e[9] == 0xff);
        assert(e[10] == 0xff);
        assert(e[11] == 0xff);
        assert(e[12] == 0xff);
        assert(e[13] == 0xff);
        assert(e[14] == 0xff);
        assert(e[15] == 0xff);
        assert(e[16] == 0xff);
        assert(e[17] == 0xff);
        assert(e[18] == 0xff);
        assert(e[19] == 0xff);
        assert(e[20] == 0xff);
        assert(e[21] == 0xff);
        assert(e[22] == 0xff);
        assert(e[23] == 0xff);
        assert(e[24] == 0xff);
        assert(e[25] == 0xff);
        assert(e[26] == 0xff);
        assert(e[27] == 0xff);
        assert(e[28] == 0xff);
        assert(e[29] == 0xff);
        assert(e[30] == 0xff);
        assert(e[x] == 0xfe);

        int16 g = -15;
        bytes2 h = bytes2(g);

        assert(h[0] == 0xFF);
        assert(h[1] == 0xF1);

        h = 0xFFF0;
        g = int16(h);

        assert(g == -16);

        // bytes5 r = 0xFFFF00FFCC;

        // g = int16(r);

        // assert(g == -52);
    }

    function testStringToBytes() public {
        string memory a = 'abc';
        bytes memory b = bytes(a);

        assert(b[0] == 0x61);
        assert(b[1] == 0x62);
        assert(b[2] == 0x63);

        b[0] = 0x64;
        b[1] = 0x65;
        b[2] = 0x66;

        a = string(b);

        // TODO(BlitZ): no ability to test this yet.
        // assert(keccak256(abi.encodePacked(a)) == keccak256(abi.encodePacked('def')));
    }

    function testStringToBytesFixed() public {
        bytes4 a = 'ab';

        assert(a == 0x61620000);
        assert(a[0] == 0x61);
        assert(a[1] == 0x62);
        assert(a[2] == 0x00);
        assert(a[3] == 0x00);
    }


    function stringByteMemToMemCastAliasing() public returns (string memory, bytes memory) {
        string memory a = 'abcd';
        bytes memory b = bytes(a);
        uint8 t = 50;
        b[1] = byte(t);
        return (a, b);
    }
    
    bytes sB;
    function stringByteMemToStorageCastAliasing() public returns (string memory, bytes memory) {
        string memory a = 'abcd';
        sB = bytes(a);
        uint8 t = 50;
        sB[1] = byte(t);
        return (a, sB);
    }
    
    string sS;
    function stringByteStorageToStorageCastAliasing() public returns (string memory, bytes memory) {
        sS = 'abcd';
        sB = bytes(sS);
        uint8 t = 50;
        sB[1] = byte(t);
        return (sS, sB);
    }
    
    function stringByteStorageToMemCastAliasing() public returns (string memory, bytes memory) {
        sS = 'abcd';
        bytes memory b = bytes(sS);
        uint8 t = 50;
        b[1] = byte(t);
        return (sS, b);
    }

    function stringByteStorageToStorageLocalCastAliasing() public returns (string memory, bytes memory) {
        sS = "abc";
        bytes storage t = bytes(sS);
        t[0] = 50;
        return (sS, t);
    }
}
