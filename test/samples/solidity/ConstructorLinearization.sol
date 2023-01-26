pragma solidity ^0.4.24;

// Example adapted from wiki C3 linearization example1: https://en.wikipedia.org/wiki/C3_linearization
// O=1
contract O {
    uint[] arr;
    constructor() public {
        arr.push(1);
    }
    
    function getArr(uint i) public returns (uint) {
        return arr[i];
    }

    function arrLen() public returns (uint) {
        return arr.length;
    }
}
// A=2
contract A is O{
    constructor() public {
        arr.push(2);
    }
}
// B=3
contract B is O{
    constructor() public {
        arr.push(3);
    }
}
// C=4
contract C is O{
    constructor() public {
        arr.push(4);
    }
}
// D=5
contract D is O{
    constructor() public {
        arr.push(5);
    }
}
// E=6
contract E is O{
    constructor() public  {
        arr.push(6);
    }
}
// K1=7
contract K1 is A,B,C {
    constructor() public {
        arr.push(7);
    }
}
// K2=8
contract K2 is D,B,E {
    constructor() public {
        arr.push(8);
    }
}
// K3=9
contract K3 is D,A {
    constructor() public {
        arr.push(9);
    }
}
// Z=10
contract Z is K1,K2,K3 {
    constructor() public {
        arr.push(10);
    }
}

contract ConstructorLinearization {
    function main() public returns (uint, uint, uint, uint, uint, uint, uint, uint, uint, uint) {
        Z z = new Z();
        // Correct constructor order is [O, D, A, B, C, K1, E, K2, K3, Z]
        // Numeric encoding: [1,5,2,3,4,7,6,8,9,10]
        assert(z.arrLen() == 10);
        assert(z.getArr(0) == 1);
        assert(z.getArr(1) == 5);
        assert(z.getArr(2) == 2);
        assert(z.getArr(3) == 3);
        assert(z.getArr(4) == 4);
        assert(z.getArr(5) == 7);
        assert(z.getArr(6) == 6);
        assert(z.getArr(7) == 8);
        assert(z.getArr(8) == 9);
        assert(z.getArr(9) == 10);
        return (z.getArr(0), z.getArr(1), z.getArr(2), z.getArr(3), z.getArr(4), z.getArr(5), z.getArr(6), z.getArr(7), z.getArr(8), z.getArr(9) );
    }
}