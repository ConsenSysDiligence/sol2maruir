pragma solidity ^0.4.24;

import "./contract_v04.sol";

contract CreateContract {
    enum TestEnum {A, B, C}

    function test() public {
        TokenCreator tc = new TokenCreator();

        OwnedToken ot = tc.createToken("ABC");
        address otAddr = address(ot);
        tc.changeName(OwnedToken(otAddr), "XYZ");
    }

    function enumAccess() public {
        TestEnum x = TestEnum.A;

        assert(int256(TestEnum.A) == 0);
        assert(int256(TestEnum.B) == 1);
        assert(int256(TestEnum.C) == 2);

        assert(x == TestEnum.A);
        assert(x != TestEnum.B);
        assert(x != TestEnum.C);
        assert(x < TestEnum.B);
        assert(x < TestEnum.C);
        assert(TestEnum.B > x);
        assert(TestEnum.C > x);

        assert(uint256(OwnedToken.ABC.D) == 0);
        assert(uint256(OwnedToken.ABC.E) == 1);
        assert(uint256(OwnedToken.ABC.F) == 2);

        assert(uint256(OwnedToken.ABC.E) == uint256(TestEnum.B));
    }
}
