pragma solidity ^0.5.0;

contract Base {
    uint public a;

    function own() public {
        a = 1;

        assert(a == 1);
        assert(Base.a == 1);
    }

    function shadowed() public {
        own();

        uint a;

        a = 2;

        assert(Base.a == 1);
        assert(Base(this).a() == 1);
        assert(a == 2);
    }
}

contract Child is Base {
    uint public a;

    function own() public {
        Base.own();

        a = 3;

        assert(a == 3);
        assert(Base.a == 1);
        assert(Child.a == 3);
        assert(Base(this).a() == 3);
        assert(Child(this).a() == 3);
        assert(this.a() == 3);
    }

    function shadowed() public {
        own();

        uint a;

        a = 4;

        assert(Base.a == 1);
        assert(Child.a == 3);
        assert(Base(this).a() == 3);
        assert(Child(this).a() == 3);
        assert(a == 4);
    }
}
