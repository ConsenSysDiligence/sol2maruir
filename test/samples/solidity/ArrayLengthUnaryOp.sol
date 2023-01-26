pragma solidity ^0.4.24;

contract ArrayLengthUnaryOp {
    uint[] arr1;
    uint[] arr2;
    uint[] arr3;
    uint[] arr4 = [3,4,5,6,7];
    uint[] arr5 = [3,4,5,6,7];
    uint[] arr6 = [3,4,5,6,7];
    
    function main() public {
        // Prefix increments
        uint x = ++arr1.length + ++arr1.length + ++arr1.length;
        assert(x == 6); // 1  + 2 + 3
        assert(arr1.length == 3);
        // Postfix increments
        uint y = arr2.length++ + arr2.length++ + arr2.length++;
        assert(y == 3); // 0 + 1 + 2
        assert(arr2.length == 3);
        // Mixed-fix increment
        uint z = ++arr3.length + ++arr3.length + arr3.length++;
        assert(z == 5); // 1 + 2 + 2
        assert(arr3.length == 3);
        
        // Prefix decrements
        uint w = --arr4.length + --arr4.length + --arr4.length;
        assert(w == 9); // 4  + 3 + 2
        assert(arr4.length == 2);
        // Postfix decrements
        uint v = arr5.length-- + arr5.length-- + arr5.length--;
        assert(v == 12); // 5 + 4 + 3
        assert(arr5.length == 2);
        // Mixed-fix decrements
        uint u = --arr6.length + --arr6.length + arr6.length--;
        assert(u == 10); // 4 + 3 + 3
        assert(arr6.length == 2);
        
    }
}
