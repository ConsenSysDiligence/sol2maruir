pragma solidity ^0.4.24;

contract A {
   event E1(uint a, uint b);
}

contract B is A {
   event E1(uint c);
   event E2(uint d);
}

contract C is B {
   event E3();
   
    function main(){
	    emit E1(1,2);
	    emit E1(3);
	    emit E2(4);
       emit E3();
    }
}

// emit function calls.


// emit A_E1(1,2)

// emit A_in_C_E1(1,2)
// emit B_in_C_E1(3)


// 1) the most derived conract
// 2) the defining contract for the function
