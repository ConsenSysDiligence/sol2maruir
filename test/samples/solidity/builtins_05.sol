pragma solidity ^0.5.0;

contract Builtins {
    function addOne(uint a) public returns (uint) {
        return a+1;
    }

    function encodeDecode() public {
        uint a = 42;
        uint a1;
        int32 b = 43;
        int32 b1;
        string memory c = "yolo";
        string memory c1;
        int128[] memory d = new int128[](3);
        d[0] = 2;
        d[1] = 3;
        d[2] = 4;
        int128[] memory d1;

        bytes memory bts;

        bts = abi.encode(a);
        a1 = abi.decode(bts, (uint));
        assert(a == a1);

        bts = abi.encode(b);
        b1 = abi.decode(bts, (int32));
        assert(b == b1);
        
        bts = abi.encode(c);
        c1 = abi.decode(bts, (string));
        //TODO: Need strcmp
        //assert(c == c1);
        
        bts = abi.encode(d);
        d1 = abi.decode(bts, (int128[]));
        assert(d1.length == 3);
        assert(d1[0] == 2);
        assert(d1[1] == 3);
        assert(d1[2] == 4);
    }
}
