pragma solidity ^0.4.24;

import './contract_v04.sol';

contract Shadowing {
    uint private x =1; 
    uint internal y =1;

    function dummy(OwnedToken o) private {
    }

    function shadow(uint msg) public returns (uint) {
       uint x = msg;
       uint OwnedToken = 1337;
       
       if (msg >5){
            x = 2;
           if (x+msg > 6){
               return x+msg;
           }
       }
       
       return x;
    }

    function shadowReturn1() public returns (uint a) {
        uint x = 1;
        // Should return 0
   }

   function shadowReturn2() public returns (uint x) {
      x=2;
      // Shouldn't change state variable
   }

   function shadowReturn2Harness() public {
      // This exercises the case of a BB with a single function call statement. 
      // This exposed a bug in the intereprter.
      shadowReturn2();
      assert(x==1);
   }

   function shadowReturn2Harness2() public {
      assert(2 == shadowReturn2());
      assert(x==1);
   }

/*
   function visibility(uint one) private returns  (uint) { 
      return one + x +y;
   }
   
   function visibility(uint one, uint two) internal returns (uint) {
      return one + visibility(x);
   }

   function visibility() public returns (uint) {
      return visibility(x) + visibility(x,y);
   }
*/
}