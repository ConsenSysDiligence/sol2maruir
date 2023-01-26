contract Provider {
    uint256 public v;

    constructor(uint256 val) public {
        v = val;
    }
}

contract Some {
    mapping(uint256 => Provider) public providers;

    constructor() public {
        providers[1] = new Provider(uint256(100));
        providers[5] = new Provider(uint256(500));
    }
}

contract Test {
    Some public some;

    constructor() public {
        some = new Some();
    }

    function verify() public {
        Some s = this.some();

        Provider p1 = s.providers(1);
        Provider p5 = s.providers(5);

        assert(p1.v() == 100);
        assert(p5.v() == 500);

        // Following assertion will intentionally fail.
        // For the reasons of explicitness, there is no support for nil contract pointers.
        // Provider p3 = s.providers(3);
        // assert(address(p3) == address(0));
    }
}
