pragma solidity 0.4.21;

contract A {
    uint8[] public vals;

    modifier beforeA() {
        vals.push(1);
        _;
    }

    modifier afterA() {
        _;
        vals.push(2);
    }

    // vals = [1, x, 2]
    function A (uint8 x) public beforeA() afterA() {
        vals.push(x);
    }
}

// vals = [1, 10, 2]
contract B is A(10) {}

// vals = [1, 15, 2]
contract C is A {
    function C() public A(15) {}
}

// vals = [1, 15, 2]
contract D is B, C {
    function D() public {}
}

// vals = [1, 10, 2]
contract E is C, B {}

// vals = [1, 8, 2]
contract F is A(5) {
    function F() public A(8) {}
}

// vals = [1, 20, 2]
contract G is B {
    function G() public A(20) {}
}

contract Validator {
    function validateD() public {
        D d = new D();

        uint8[3] memory expected = [1, 15, 2];

        for (uint i = 0; i < expected.length; i++) {
            assert(d.vals(i) == expected[i]);
        }
    }

    function validateE() public {
        E e = new E();

        uint8[3] memory expected = [1, 10, 2];

        for (uint i = 0; i < expected.length; i++) {
            assert(e.vals(i) == expected[i]);
        }
    }

    function validateF() public {
        F f = new F();

        uint8[3] memory expected = [1, 8, 2];

        for (uint i = 0; i < expected.length; i++) {
            assert(f.vals(i) == expected[i]);
        }
    }

    function validateG() public {
        G g = new G();

        uint8[3] memory expected = [1, 20, 2];

        for (uint i = 0; i < expected.length; i++) {
            assert(g.vals(i) == expected[i]);
        }
    }
}
