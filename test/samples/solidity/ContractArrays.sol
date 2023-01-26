pragma solidity 0.5.0;
contract Moo {}

contract Foo {
    
    function boo() internal returns (Moo[] memory) {
        return new Moo[](3);
    }
    function main() public {
        Moo[] memory moos = new Moo[](4);
        Moo[] memory mmos2 = boo();
    }
}
