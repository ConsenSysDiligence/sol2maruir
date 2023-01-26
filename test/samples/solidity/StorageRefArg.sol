contract StorageRefArg {
    uint[] a;
    uint[] b;
    
    function setFirst(uint[] storage t, uint v) internal {
        t = b;
        t[0] = v;
    }
    
    function main() public returns (uint[] memory, uint[] memory) {
        a = [1,2,3];  
        b = [4,5, 6];
        
        setFirst(a, 42);
        assert(a[0] == 1);
        assert(b[0] == 42);
        return (a,b);
    }
}
