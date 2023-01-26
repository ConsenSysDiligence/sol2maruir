pragma solidity ^0.4.26;

contract Foo {
    uint public a;
    constructor() public {
        a = 42;
    }
}

contract ArrayTypesDesugaring {
    function normalArrays() public {
        // succeeds
        int[] memory a = new int[](1);
        assert(a.length == 1);
        assert(a[0] == 0);

        // fails
        bytes[] memory b = new bytes[](1);
        assert(b.length == 1);
        assert(b[0].length == 0);

        // fails 
        string[] memory c = new string[](1);
        assert(c.length == 1);

        // fails
        uint[6][] memory d = new uint[6][](1);
        assert(d.length == 1 && d[0].length == 6);
    }
    
    function contractArrays() public {
        Foo[] memory x = new Foo[](1);
        assert(x.length == 1);
        // Note that this creates an array with null references. You can verify this
        // by uncommenting the below code and observing that they fail.
        // Fails
        //assert(x[0].a() == 0); 
        // Fails
        //assert(x[0].a() == 42); 

    }
    
    function main() public {
        normalArrays();
        contractArrays();
    }

}
