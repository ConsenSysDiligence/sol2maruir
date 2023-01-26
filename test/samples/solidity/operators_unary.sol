pragma solidity ^0.4.24;

contract OperatorsUnary {
    function testArithmeticOperators() public {
        int a;
        int b;

        a = 10;
        b = a++;

        assert(a == 11);
        assert(b == 10);

        a = 10;
        b = ++a;

        assert(a == 11);
        assert(b == 11);

        a = 10;
        b = a--;

        assert(a == 9);
        assert(b == 10);

        a = 10;
        b = --a;

        assert(a == 9);
        assert(b == 9);

        a = 5;
        b = -a;

        assert(a == 5);
        assert(b == -5);

        a = -5;
        b = -a;

        assert(a == -5);
        assert(b == 5);
    }

    function testBitwiseOperators() public {
        int a;
        int b;

        a = 8;
        b = ~a;

        assert(a == 8);
        assert(b == -9);

        a = -9;
        b = ~a;

        assert(a == -9);
        assert(b == 8);

        a = 0;
        b = ~a;

        assert(a == 0);
        assert(b == -1);

        a = -1;
        b = ~a;

        assert(a == -1);
        assert(b == 0);
    }

    function testLogicOperators() public {
        bool a;
        bool b;

        a = true;
        b = !a;

        assert(a == true);
        assert(b == false);

        a = false;
        b = !a;

        assert(a == false);
        assert(b == true);
    }

    function testDelete() public {
        int a = 1;

        delete a;

        assert(a == 0);

        uint b = 2;

        delete b;

        assert(b == 0);

        bool c = true;

        delete c;

        assert(c == false);
    }

    function testTupleArgs() public {
        uint[3] memory numbers = [uint(1), 2, 3];

        assert(numbers[0] == 1);
        delete (numbers[0]);
        assert(numbers[0] == 0);

        assert(numbers[1] == 2);
        assert(++(((numbers[1]))) == 3);
        assert(numbers[1] == 3);

        assert(numbers[2] == 3);
        assert(((numbers[2]))-- == 3);
        assert(numbers[2] == 2);
    }
}
