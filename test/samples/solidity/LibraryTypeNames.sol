pragma solidity ^0.5.0;

library L {
    struct SomeStruct {
        string name;
        int value;
    }
    
    enum SomeEnum {
        A, B, C
    }
}

contract LibraryTypeNames {
    function main() public {
        L.SomeEnum x = L.SomeEnum.A;
	assert(x == L.SomeEnum.A);

        L.SomeStruct memory s = L.SomeStruct("test", 1);
	assert(s.value == 1);
    }
}
