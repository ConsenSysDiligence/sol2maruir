pragma solidity 0.5.7;

contract Taint {
    uint8 counter = 1;

    function taintIfElseNested(uint8 x) public returns (uint8,uint8){
        uint8 a = x;
        uint8 b = 0;
        uint8 c;

        if (a + 1 >= 2) {
            b = counter ;
            if (100 >= counter) {
                if (1000 >= counter) {
                    b +=  x;
                } else {
                    b -=  x;
                }
            } else {
                uint8 c = a * 2;
            }
        } else {
            b = a * 2;
        }

        b += 15;
        return (a,b);
    }  

    function ternaryNested(uint a) public returns (uint) {
        uint z =1; 
        uint b;

        if ( a == 1 ? (a <= 1 ? true : false ) : false ){
            b += 1 + a ;
        } else if (counter <= 1 ? true : false == a <= 2 ? true : false){
            b += 1;
        }
        return b ;
    }

  function taintFor(uint d, uint e) public returns (uint,uint){
        uint x = 0; // x1 
        uint a = d; // a1 
        uint b = 1; // b1
        
        // i1
        for(uint i =0; i < 3; i++){ // i2, ...
            x = a+ 10; // x2 
            if (a > 100){
                b += a + x; // b2
            }   
        }
        return (x,b);
  } 

  function taintWhile(uint d, uint e) public returns (uint){
        uint x = 0;
        uint a = d;
        uint b = 1;
        
        while (++x < 10) {
            a += 10;
            if (a > 100){
                b += a + x;
            }
        } 
        return a;
  }
       
  function taintDoWhile(uint d, uint e) public returns (uint){
        uint x = 0;
        uint a = d;
        uint b = 1;
        
        do {
            a += 10;
            if (a > 100){
                b += a + x;
            }
        } while (++x < 10);
        return a;
    }

    function taintRemoveComplete(uint d, uint e) public returns (uint){
        uint x = 0;
        uint a = d;
        uint b = 1;
        
        do {
            a = 10;
            if (a > 100){
                b += a + x;
            }
        } while (++x < 10);
        return a;
    }

    function taintRemovePartially(uint d, uint e) public returns (uint){
        uint x = 0;
        uint a = d;
        uint b = 1;
        
        while (++x < 10) {
            a = 10;
            if (a > 100){
                b += a + x;
            }
        } 
        return a;
    }


    function simpleIf(uint d, uint e) public returns (uint){
        uint x=d;
        if(x>0){
            ++x;
        }
        
        return x;
    }

  


}