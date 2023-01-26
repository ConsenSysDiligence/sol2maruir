contract Test {
    uint public someContant = 1 + 2 + 3;

    uint public decimals;
    uint public totalSupply;
    uint public scalarNested;

    constructor() public {
        decimals = 8;
        totalSupply = 10 ** uint(decimals);
        scalarNested = 1 + 2 + 3;
    }

    function verify() public {
        assert(someContant == 6);
        assert(this.someContant() == 6);

        assert(decimals == 8);
        assert(this.decimals() == 8);

        assert(totalSupply == 100000000);
        assert(this.totalSupply() == 100000000);

        assert(scalarNested == 6);
        assert(this.scalarNested() == 6);
    }
}
