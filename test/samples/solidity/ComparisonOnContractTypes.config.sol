contract Some {
    uint public a;
}

contract Token is Some {
    uint public b;
}

contract Test {
    function verify() public {
        Token a = Token(address(0x0));
        Some b = Some(address(0x1));
        Some c = Token(address(0x0));
        assert(a < b);
        assert(a <= b);
        assert(b > a);
        assert(b >= a);
        assert(a != b);
        assert(a == c);
    }
}

contract __IRTest__ {
    function main() public {
        Test __this__ = new Test();
        __testCase103__(__this__);
    }

    function __testCase103__(Test __this__) internal {
        __this__.verify();
    }
}
