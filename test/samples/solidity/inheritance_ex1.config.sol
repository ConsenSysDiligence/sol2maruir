pragma solidity ^0.4.24;

contract A {
   uint z = 1;
   function E1(uint a, uint b) public returns (uint) {
      return a+b+z;
   }
}

contract B is A {
   uint w = 2;
   function E1(uint c) public returns (uint) {
      return c+w;
   }
   function E2(uint d) public returns (uint) {
      return d+1;
   }
}

contract C is B {
   uint d;
   
   function E3() public returns (uint){
      return 0;
   }
   
    function main() public {
	    uint t1 = E1(1,2);
       assert(t1 == 4);
	    uint t2 = E1(3);
       assert(t2 == 5);
	    uint t3 = E2(5);
       assert(t3 == 6);
       uint t4 = E3();
       assert(t4 == 0);
    }
}

// emit function calls.
// function A_in_C_E1(C storage *this, uint a, uint b) public returns (uint) {
//   return a+b+this.z;   
// }
//
// function B_in_C_E1(C storage *this, uint c) public returns (uint) {
//    return c+this.w;
// }
//
// function B_in_C_E2(C storage *this, uint d) public returns (uint) {
//    retun d+1;
// }
//
// ...
//
// function C_main(C storage *this) {
//    A_in_C_E1(this, 1, 2);
//    B_in_C_E1(this, 3);
//    B_in_C_E2(this, 4);
//    C_E3(this)
// }

contract __IRTest__ {
    function main() public {
        C __this__ = new C();
        __testCase130__(__this__);
    }

    function __testCase130__(C __this__) internal {
        __this__.main();
    }
}