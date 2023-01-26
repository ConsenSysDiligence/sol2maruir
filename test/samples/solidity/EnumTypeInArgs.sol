pragma solidity ^0.8.6;

library Utils {
    enum Some {
        A, B, C
    }
}

contract Test {
    Utils.Some public s;
    
    mapping(Utils.Some => uint) public x;

    function useEnumArg(Utils.Some v) pure public returns (Utils.Some) {
        return v;
    }

    function verify() public {
        x[Utils.Some.A] = 10;
        x[Utils.Some.B] = 20;
        x[Utils.Some.C] = 30;

        assert(s == Utils.Some.A);

        assert(this.useEnumArg(Utils.Some.B) == Utils.Some.B);

        assert(x[Utils.Some.A] == 10);
        assert(x[Utils.Some.B] == 20);
        assert(x[Utils.Some.C] == 30);

        assert(this.x(Utils.Some.A) == 10);
        assert(this.x(Utils.Some.B) == 20);
        assert(this.x(Utils.Some.C) == 30);
    }
}
