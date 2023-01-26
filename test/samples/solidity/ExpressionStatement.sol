pragma solidity ^0.6.0;


contract ExpressionStatement {
    struct Foo {
        uint256 f;
    }

    function main() external {
        uint256 a;
        uint256 b;
        uint256[] memory arr = new uint256[](3);
        Foo memory f;

        uint256;
        a;
        -a;
        a + b;
        a > b;
        (uint256);
        (uint256, 1);
        (uint256, (bool, 1, string, "foo"));
        a > b ? a : b;
        (a, b);
        (a > b ? (a, b) : (b, a));
        arr[a];
        arr[arr[a]];
        1;
        true;
        f.f;
    }
}
