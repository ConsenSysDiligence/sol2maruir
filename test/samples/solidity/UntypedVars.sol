pragma solidity >=0.4.18 <0.5.0;

contract UntypedVars {
    function scalar() pure private returns (string memory) {
        return "some string";
    }

    bytes sB;

    struct Foo {
        uint f1;
    }

    Foo sFoo;

    function test_simple() public returns (uint8) {
        var u8 = 123; // uint8

        assert(u8 - uint8(124) == 255);

        var u8_1 = 255; // uint8

        assert(u8_1 + uint8(1) == 0);

        var i8 = -1; // int8

        assert(i8 - int8(128) == 127);

        var i8_1 = -128; // int8

        assert(i8_1 - int8(1) == 127);

        var u16 = 256; // uint16

        assert(u16 - uint16(257) == 65535);

        var u16_1 = 65535; // uint16

        assert(u16_1 + uint16(1) == 0);

        var i16 = -129; // int16

        assert(i16 - int16(32640) == 32767);

        var i16_1 = -32768; // int16

        assert(i16_1 - int16(1) == 32767);

        var (b, c, d) = (0x00, "test", -15);

        assert(b - uint8(1) == 255);

        assert(bytes(c)[0] == byte("t"));
        assert(bytes(c)[1] == byte("e"));
        assert(bytes(c)[2] == byte("s"));
        assert(bytes(c)[3] == byte("t"));

        assert(d - int8(114) == 127);

        // Infinite precision calculation using contants that don't fit in 256 bits.
        var u8_2 = 231584178474632390847141970017375815706539969331281128078915168015826259279915231584178474632390847141970017375815706539969331281128078915168015826259279915 - 231584178474632390847141970017375815706539969331281128078915168015826259279915231584178474632390847141970017375815706539969331281128078915168015826259279873;

        assert(u8_2 == 42);

        // This causes a compile error - cannot compare constants larger than 256 bits.
        //var u8_3 = 231584178474632390847141970017375815706539969331281128078915168015826259279915231584178474632390847141970017375815706539969331281128078915168015826259279915 > 231584178474632390847141970017375815706539969331281128078915168015826259279915231584178474632390847141970017375815706539969331281128078915168015826259279873 ? 0: 1;
        u8 = b;
        //i8=b; //can't convert u8->i8
        i8 = d;
        //u8 = d; //can't convert u8->i8

        // Check that c is a memory string. If we assign to storage it will be a copy
        sB = bytes(c);
        sB[0] = 0x32;
        assert(bytes(c)[0] == 116);
        // But if we assign it to memory its an alias
        bytes memory mB = bytes(c);

        mB[0] = 0x32;

        assert(bytes(c)[0] == 0x32);

        var e = scalar();

        assert(bytes(e)[0] == byte("s"));
        assert(bytes(e)[1] == byte("o"));
        assert(bytes(e)[2] == byte("m"));
        assert(bytes(e)[3] == byte("e"));
        assert(bytes(e)[10] == byte("g"));
    }

    function test_complex() public {
        var u8_arr = [1,2,255];
        // u8_arr[0] = 256; //cant assign u16 to u8

        var i8_arr = [-127, 127];
        // i8_arr[0] = 128; // cant assign an u8 (at least) to i8

        var strct = Foo(1);
        // Make sure its a memory struct. If we assign to storage its a copy
        sFoo = strct;
        sFoo.f1 = 42;
        assert(strct.f1 == 1);
        // If we assign to memory its an alias
        Foo memory mFoo = strct;
        mFoo.f1 = 43;
        assert(strct.f1 == 43);

        var u8_2d = [[1,2],[0,255]];
        //u8_2d[1] = [-1, 0]; // can't assign i8[2] to u8[2]
        //var i8_2d = [[-1, 0], [0, 127]]; // Can't deduce common type - doesn't do unification
        var i8_2d = [[-1, 0], [-1, 127]];
        //i8_2d[1] = [2, 0]; // can't assign u8[2] to i8[2]

        var u8_3 = [1,1,1];// common type is uint8[3] memory not int_const1[3]
        u8_3[0] = 2;

        uint8 x = 10;
        var u16_4 = [x, 1, 256]; // infer u16
        // u16_4[0] = -1; // can't assign i8 to u16
    }

    function main() public {
        test_simple();
        test_complex();
    }
}