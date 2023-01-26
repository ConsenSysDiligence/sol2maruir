pragma solidity ^0.4.24;

contract StateVarInitializers {
    uint a;
    
    uint b = 1;
    
    uint c = 1+3;
    
    uint d = (c<0 ? 1 : 2);
    
    uint e = b;
    
    uint f = g;
    
    uint g = 1;
    
    uint[] arr;
    
    uint[3] fArr;
    
    uint[3] fArr2 = [a,b,c];
    
    struct Bar {
        int32 x;
    }
    
    struct Foo {
        uint a;
        uint[3] b;
        Bar c;
    }
    
    Foo st;
    
    Foo st1 = Foo(1, fArr2, Bar(int32(g)));
   
    
    constructor() public {
        
        assert(a == 0);
        assert(b == 1);
        assert(c == 4);
        assert(d == 2);
        assert(e == 1);
        assert(f == 0);
        // Note that f=0 implies that f's initializer runs before g's initializer.
        // Therefore state variables are initialized in the order in which they are declared.
        assert(g == 1);
     
        assert(arr.length == 0);   
        
        assert(fArr.length == 3);
        assert(fArr[0] == 0 && fArr[1] == 0 && fArr[2] == 0);
        
        assert(fArr2.length == 3);
        assert(fArr2[0] == 0 && fArr2[1] == 1 && fArr2[2] == 4);

        assert(st.a == 0);
        assert(st.b.length == 3);
        assert(st.b[0] == 0 && st.b[1] == 0 && st.b[2] == 0);
        assert(st.c.x == 0);
        
        assert(st1.a == 1);
        assert(st1.b.length == 3);
        assert(st1.b[0] == 0 && st1.b[1] == 1 && st1.b[2] == 4);
        assert(st1.c.x == 1);
        
        // TODO: What to do for string/map tests?
    }
}