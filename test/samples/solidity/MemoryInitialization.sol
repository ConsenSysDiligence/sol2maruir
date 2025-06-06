pragma solidity ^0.4.24;

contract MemoryInitialization {
    function memoryArrays() public {
        uint256[3] memory a;
        
        assert(a[0] == 0 && a[1] == 0 && a[2] == 0);
        
        a = [uint256(1),2,3];
        assert(a[0] == 1 && a[1] == 2 && a[2] == 3);
        
        uint256[3] memory b;
        
        assert(b[0] == 0 && b[1] == 0 && b[2] == 0);
        assert(a[0] == 1 && a[1] == 2 && a[2] == 3);
        
        uint256[] memory c;
        
        assert(c.length == 0);
        // cause an exception
        // assert(c[0] == 0);
        
        // c.length = 3; - compile error - memory arrays are not dynamic
        
        c = new uint256[](3);
        assert(c[0] == 0 && c[1] == 0 && c[2] == 0);
    }
  
    uint256[3] s;
    uint256[3] s1;
    uint256[] s2;
    uint256[][] s3;
    
    function storageArrays() public {
        uint256[3] storage a = s;
        
        assert(a[0] == 0 && a[1] == 0 && a[2] == 0);
        
        //a = [uint256(1),2,3]; - causes a type error
        s = [uint256(1),2,3]; // - doesn't cause a type error?
        
        assert(a[0] == 1 && a[1] == 2 && a[2] == 3);
        
        uint256[3] storage b = s;
        assert(b[0] == 1 && b[1] == 2 && b[2] == 3);
        
        b = s1;
        assert(b[0] == 0 && b[1] == 0 && b[2] == 0);
        
        uint256[] storage c = s2;
        
        assert(c.length == 0);
        // cause an exception
        // assert(c[0] == 0);
        
        c.length = 3; // works for storage arrays
        assert(c[0] == 0 && c[1] == 0 && c[2] == 0);
        
        c[0] = 1; c[1] = 2; c[2] = 3;
        
        // c = new uint256[](3) - causes a type error
        s2 = new uint256[](3);
        assert(c.length == 3);
        assert(c[0] == 0 && c[1] == 0 && c[2] == 0);

        s3.push([uint256(5),6,7]);
        assert(s3[0][0] == 5 && s3[0][1] == 6 && s3[0][2] == 7);
        s3[0] = [uint256(6),7,8];
        assert(s3[0][0] == 6 && s3[0][1] == 7 && s3[0][2] == 8);
    }  
}