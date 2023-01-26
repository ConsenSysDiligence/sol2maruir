pragma solidity >=0.5.0 <0.6.0;
contract Arrays {
    uint[] data;

    function addOne(uint a) public returns (uint) {
        return a+1;
    }

    function addOneTwice(uint a, uint b) public returns (uint, uint) {
        return (addOne(a), addOne(b));
    }

    function arrays() public returns (uint[] memory) {
        uint[] storage a = data;
        uint b;

        a.push(1);
        a.push(2);
        a.push(3);

        assert(a[0] == 1 && a[1] == 2 && a[2] == 3);
        a.length = 2;
        assert(a[0] == 1 && a[1] == 2 && a.length == 2);
        b = a.push(1) + 1;
        assert(a[0] == 1 && a[1] == 2 && a[2] == 1 && a.length == 3);
        assert(b == 4);
        a.pop();
        assert(a[0] == 1 && a[1] == 2 && a.length == 2);

        uint c = a.length;
        return a;
    }

    function tupleInlineArrayAssignment() public {
        uint[3] memory a;
        uint[3] memory b;

        (a,b) = ([uint(1),2,3], [uint(4),5,6]);
    }

    function arrayLenModifiers() public {
        uint[] storage a = data;
        uint b;

        a.length = 1;
        (a.length, b) = (3,4);

        b = (a.length=1) + 1;

        a.length = addOne(1);

        (b, a.length) = addOneTwice(1,2);

        a.length += 1;
        a.length *= 2;
        a.length >>= 2;
    }
}
