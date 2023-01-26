pragma solidity ^0.4.21;
contract Structs {
    struct Record {
        uint id;
        string data;
    }
}

contract CompoundTypeNames {
    struct Record{
        int y;
        uint8[] z;
    }

    Structs.Record[] recs;
    Record recs2;

    function main() public {
        recs.push(Structs.Record(1, "test"));
        assert(recs.length == 1);
        assert(recs[0].id == 1);
    }
}
