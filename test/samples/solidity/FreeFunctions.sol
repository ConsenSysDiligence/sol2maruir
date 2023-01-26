pragma solidity 0.7.4;

function mul(uint x, uint y) returns (uint) {
    return x * y;
}

function mul(uint x, uint y, uint z) returns (uint) {
    return x * y * z;
}

function callInner(Foo f, uint x) returns (uint) {
    return f.double(x);
}

contract Foo {
    function double(uint x) external returns (uint) {
        return mul(x,2);
    }
    
    function indirectReentry(uint x) public returns (uint) {
        return callInner(this, x);
    }

    function quadruple(uint x) external returns (uint) {
        return mul(x,2, 2);
    }
}