
pragma solidity 0.4.25;
pragma experimental ABIEncoderV2;

import './library_v04.sol';
import './contract_v04.sol';

contract Sol {
    using SafeMath for uint256;

    event Operand(uint256 value );
    event Sum( uint256 value);

    enum TestEnum {
        A,
        B,
        C
    }

    struct TestStructA {
        string memberX;
        int memberY;
        TestEnum memberZ;
    }

    struct TestStructB {
        TestStructA memberA;
        string memberB;
        int8 memberC;
        address memberD;
    }

    struct TestStructC {
        string memberX;
        int memberY;
        int [1] memberZ;
    }

    uint a;
    uint256 b;

    uint private x =1; 
    uint internal y =1; 
    uint public sum = 0;

    TestStructB c;
    TestEnum d;
    TestStructC e;
    
    string public someString="123";

    uint[] data;
    uint[3] a1;
    uint[3] a2;
    
    mapping (uint => uint) uintMap;
    mapping (uint => uint[]) uintArrMap;
    mapping (uint => TestStructB) uintStructMap;
    struct A { uint a; }
    struct B { uint b; A a; }
    
     B b1 = B(1,A(2));
     B b2 = B(3,A(4));

    function Sol() public {
        a = 1;
        b = 100000000000;
        c = TestStructB(TestStructA("x", 2, TestEnum.C), "b", 5, address(0x0));
    }

    function simpleAssignment() public {
        int8 test = 1;
    }

    function multipleAssignmentsLong() public {
        uint8 test = 2;
        uint8 newTest = 1;

        test = test + 2;
        test = test - 2;
        test = test * 2;
        test = test / 2;
        test = test ** 2;
        test = test % 2;
        test = test << 1;
        test = test >> 1;
        test = test | 1;
        test = test & 1;
        test = test ^ 1;
        test = ~test;
        test = -test;
        newTest = test++;
        newTest = ++test;
        newTest = test--;
        newTest = --test;
    }

    function multipleAssignmentsShort() public {
        int16 test = 2;

        test++;
        ++test;

        test--;
        --test;
        
        test += 2;
        test -= 2;
        test *= 2;
        test /= 2;
        test %= 2;
        test <<= 1;
        test >>= 1;
        test |= 1;
        test &= 1;
        test ^= 1;
    }

    function booleanLogic() public {
        int32 a = 4;
        int32 b = 3;

        bool c = a == 4;

        c = c && b != 4;
        c = c || !c;

        c = a >= b;
        c = a <= b;

        c = true;
        c = false;
        c = true || false;
    }


    function ifElseStatementNested() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2) {
            b = a / 4;
            if (b >= 2) {
                b =  2;
            } else {
                a = a * 2;
            }
        } else {
            b = a * 2;
        }

        b += 15;
    }

    function ifElseStatement() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2) {
            b = a / 2;
        } else {
            b = a * 2;
        }

        b += 15;
    }

    function ifStatement() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2) {
            b = a / 2;
        }

        b += 15;
    }

    function ifElseStatementWithExpressions() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2) b = a / 2;
        else b = a * 2;

        b += 15;
    }

    function ifStatementWithExpression() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2)b = a / 2;

        b += 15;
    }

    function ifStatementWithReturn() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2)return;

        b += 15;
    }

    function ifStatementWithThrow() public {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2) revert();

        b += 15;
    }

    function forStatementCompleteWithExpression() public {
        uint16 x = 0;
        
        for (uint8 a = 0; a < 10; a++)x += a;
        
        x *= 2;
    }

    function forStatementCompleteWithBlock() public {
        uint16 x = 0;
        int16 y = 0;

        for (uint8 a = 0; a < 10; a++) {
            x += a;
            y -= a;
        }
        
        x *= 2;
        y /= 2;
    }

    function forStatementInitializationWithNoDeclaration() public {
        uint16 x = 0;
        int16 y = 0;
        uint8 a;

        for (a = 0; a < 10; a++) {
            x += a;
            y -= a;
        }
        
        x *= 2;
        y /= 2;
    }

    function forStatementNoInitialization() public {
        uint16 x = 0;
        uint8 y = 0;
        
        for (; y < 10; y++)x += y;
        
        x *= 2;
    }

    function forStatementNoLoopExpression() public {
        uint16 x = 0;
        
        for (uint8 a = 0; a < 10;)x += ++a;
        
        x *= 2;
    }

    function forStatementNoLoopCondition() public {
        uint16 x = 0;
        
        for (uint8 a = 0; ; a++) {
            if (a > 10) {
                break;
            }

            x += a;
        }
        
        x *= 2;
    }

    function forStatementLoopExpressionOnly() public {
        uint16 x = 0;
        uint8 a = 0;
        
        for (;; a++) {
            if (a > 10) {
                break;
            }

            x += a;
        }

        x *= 2;
    }

    function forStatementLoopConditionOnly() public {
        uint16 x = 0;
        uint8 a = 0;

        for (;a > 10;) x += a++;

        x *= 2;
    }

    function forStatementLoopInitializationOnly() public {
        uint16 x = 0;

        for (uint8 a = 0;;) {
            if (a > 10) {
                break;
            }

            x += a++;
        }

        x *= 2;
    }

    function forStatementEmpty() public {
        uint16 x = 0;
        uint8 a = 0;

        for (;;) {
            if (a > 10) {
                break;
            }

            x += a++;
        }

        x *= 2;
    }

    function forStatementWithLoopControlStatements() public {
        uint16 x = 0;
        uint8 a = 0;

        for (a = 1; a < 15; a++) {
            if (a > 10) {
                break;
            } else if (a < 2) {
                a++;

                continue;
            }

            x += a;

            if (x > 40) {
                return;
            }

            if (x > 35 || a > 12) {
                revert();
            }
        }

        x *= 2;
    }

    function forStatementwithTernaryInHeader() public {
        uint16 x = 0;
        uint16 y = 0;
        uint16 a =0;

        for (a <= 1 ? true : false ; a < 10; a++) {
            x += a;
            y -= a;
        }
        
        for ( uint b =1 ;b <= 1 ? true : false ; b++) {
            x += a;
            y -= a;
        }
        
        for ( uint c =1 ; c < 10 ; c <= 1 ? true : false) {
            x += a;
            y -= a;
        }

    }
    
    function whileStatementWithBlock() public {
        uint8 x = 0;
        uint8 a = 100;
        uint8 b = 0;
        
        while (++x < a) {
            a -= 10;
            b += a + x;
        }
    }
    
    function whileStatementWithExpression() public {
        uint8 x = 0;
        
        while (x < 100) x++;
    }
    
    function whileStatementWithLoopControlStatements() public {
        uint8 x = 0;

        while (true) {
            if (x >= 100) {
                break;
            } else if (x < 10) {
                x += 5;

                continue;
            }

            x++;

            if (x > 90) {
                return;
            }

            if (x > 80) {
                throw;
            }
        }
    }

    function doWhileStatementWithBlock() public {
        uint8 x = 0;
        uint8 a = 100;
        uint8 b = 0;
        
        do {
            a -= 10;
            b += a + x;
        } while (++x < a);
    }

    function doWhileStatementWithExpression() public {
        uint8 x = 0;
        
        do x++; while (x < 100);
    }

    function doWhileStatementWithLoopControlStatements() public {
        uint8 x = 0;
        
        do {
            if (x >= 100) {
                break;
            } else if (x < 10) {
                x += 5;

                continue;
            }

            x++;

            if (x > 90) {
                return;
            }

            if (x > 80) {
                revert();
            }
        } while (true);
    }


    function tupleDeclaration() public {
        (uint8 r, uint16 t, string memory x) = (1, 2, "abc");
        (uint8 a, , string memory c, ) = (1, 2, "abc",4);
    }

    function tupleNested() public {
        uint8 r;
        uint16 t;
        string memory x;
        address f;

        (r, t, (x, f)) = (3, 4, ("abc", 0x0));
        (, t, (, f)) = (5, 6, ("def", 0x1));
        (r, t, ,f) = (7, 8, ("xyz", 0x42), 0x0);

        uint a = 0;
        // RValue expressions are evaluated even if there is no
        // corresponding LValue component to assignme them to.
        (uint b, uint c, ) = (0, 0, a = 42);
        assert (a == 42);
    }

    function tupleEvaluateAllInitialExpressions() public returns(uint){
        uint foo = 42;
        (uint8 a, , string memory c, ) = (1, foo=1337, "abc",4);
        return foo;
    }
    
    function sqrt(int32 x) public returns (int32 y) {
        int32 z = (x + 1) / 2;

        y = x;

        while (z < y) {
            y = z;

            z = (x / z + z) / 2;
        }
    }
    
    function complexExpressionsNesting() public {
        int8 a = 1;
        int8 b = 5;
        int16 c = 2;
        int32 d = 2 + 9;
        int h = 144;
        
        int x = ((3 + a * b) * (c + d)) / (a + h);
 
    }
    
    function functionCallInExpression() public {
        int32 a = 5;
        int32 b = 8;
        int32 c = 15 + (sqrt(a * a + b * b) / 2);
        
        bool d;
        
        if (!(d = msg.sender.send(uint(sqrt(2))))){
            revert("No money honey");
        }
    }

    function functionCallPublicGetter(OwnedToken o) returns(address){
        return o.owner();
    }

    function requireCall(uint x, uint y) public returns (uint) {
       require(x+y > x);
       uint z = x + y;
       require(z > 0 && x > 0, "z and x should be greater than 0");
       z+= 1;
       return z;
   }
   

    function assertCall(uint x, uint y) public returns (uint) {
       assert(x+y > x);
       uint z = x + y;
       assert(z > 0 && x > 0);
       z+= 1;
       return z;
   }

   function revertCall(uint x, uint y) public returns (uint) {
       if (!(x+y > x)){
           revert();
       }
  
       uint z = x + y;
       if (z > 0 && x > 0){
           z+= 1;
       } else {
           revert("z and x should be greater than 0");
       }
  
       return z;
   }


   function throwStatement(uint x, uint y) public returns (uint) {
       if (!(x+y > x)){
           throw;
       }
         
       uint z = x + y;
       return z;
   }

   function multipleReturn() public returns (uint) {
        uint8 a = 1;
        uint8 b = 0;

        if (a + 1 >= 2){
            return a;
        } else {
            if (b>0){
                return b;  
            } else {
                b++;
            }
            
        }
    }

    function returnNoExplicitReturn() public returns ( uint x ) {
      x=1;
    }

    function returnMixedNamedUnamed(bool b) public returns (uint, uint a) {
        if (b) {
            a = 10;
            return (2,3);
        } else {
            a = 11;
        }
    }


   function returnOverwrite() public returns ( uint x ) {
      y=1;
      return y;
   }

    function returnAssignBeforeBreak1() public returns (uint) {
        uint x = 0;
        do {
            break;
        } while ( (x=1) > 0);
        return x;
        // Should return 0
    }

    function returnAssignBeforeBreak2() public returns (uint,uint) {
        uint x = 0;
        uint y = 0; 
        for (uint i = 5; (x=i) >= 0; (y=i ++)) {
            break;
        }
        return (x,y);
        // Should return (5,0)
    }

    function returnBreakBeforeAssign() public returns (uint) {
        uint x = 0;
        while ( (x=1) > 0) {
            break;
        } 
        return x;
        // Should return 1
    }

    function returnTuplesFromFunction() public {
        uint[3] memory x1;
        uint[3] memory x2;
        
        (x1,x2) = arrayStorageToStorage();
        (x1,) = arrayStorageToStorage();
        (,x2) = arrayStorageToStorage();
    }

    function returnTuplesFromFunctionCall() public returns (uint[3],uint[3]) {
        return arrayStorageToStorage();
    }
    
    function emitFunction(){
        uint x = 1;
        uint y = 2;
        uint sum = x +y;
        
        emit Operand(x+1);
        emit Sum(x);
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

    function visibility(uint one) private returns  (uint) { 
       return one + x +y;
    }
   
   function visibility(uint one, uint two) internal returns (uint) {
      return one + visibility(x);
   }

   function visibility() public returns (uint) {
      return visibility(x) + visibility(x,y);
   }

   function deadCodeAfterReturn(uint x) public returns (uint) {
      return x;
      y=2;
   }

    function enumAccess() public returns (TestEnum) {
        TestEnum x= TestEnum.A;
        OwnedToken.ABC.D;
        return x ;
    }
   

     // array storage to memory is a copy 
    function arrayStorageToMemory() public returns (uint[3], uint[3]) {
        a1 =[1,2,3];
        uint[3] memory b;
        b = a1;
        b[0] = 4;
        
        return (a1,b);
    }

    // array memory to storage is a copy 
    function arrayMemoryToStorage() public returns (uint[3], uint[3]) {
        
        uint256[3] memory b = [uint(1),2,3];
        a1 = b ;
        a1[0] = 4;
        
        return (a1,b);
    }
    
    // array memory to memory is a reference 
    function arrayMemoryToMemory() public returns (uint[3], uint[3]) {
        
        uint256[3] memory b = [uint(1),2,3];
        uint256[3] memory c;
        c = b ;
        c[0] = 4;
        
        return (b,c);
    }
    
    // array storage to storage is a copy 
    function arrayStorageToStorage() public returns (uint[3], uint[3]) {
        a1 =[1,2,3];
 
        a2 = a1 ;
        a2[0] = 4;
        
        return (a1,a2);
    }

    function twoDimArrayMemoryToMemory() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] memory b;
        b[0] = [uint(1),1,1];
        b[1] = [uint(2),2,2];
        b[2] = [uint(3),3,3];
        
        uint[3] memory c;
        c = [uint(4),4,4];
        
        b[0] = c;
        b[0][0] = 42;
        
        // If b[0] = c is a copy, then should return [42,4,4], [4,4,4]
        // If b[0] = c is a alias, then should return [42,4,4], [42,4,4]
        // It returns the second so its a alias.        
        return (b[0],c);
    }
    
    uint[3][3] store_b;
    uint[3] store_c;
    
    function twoDimArrayStorageToStorage() public returns (uint[3] memory, uint[3] memory) {
        uint[3][3] storage b = store_b;
        b[0] = [uint(1),1,1];
        b[1] = [uint(2),2,2];
        b[2] = [uint(3),3,3];
        
        uint[3] storage c = store_c;
        c[0] = 4;
        c[1] = 4;
        c[2] = 4;
        
        b[0] = c;
        b[0][0] = 42;

        // If b[0] = c is a copy, then should return [42,4,4], [4,4,4]
        // If b[0] = c is a alias, then should return [42,4,4], [42,4,4]
        // It returns the first so its a copy.        
        return (b[0],c);
    }
        
    // struct storage to storage is a reference  
    function structStorageToStorage() public returns (uint, uint) {
         B storage b3 = b1;
         b3.b = 5;
         
         return (b3.b, b1.b);
    }
    
    // struct storage to memory is a copy  
    function structStorageToMemory() public returns (uint, uint) {
         b1;
         B memory b3 = b1;
         b3.b = 5;
         
         return (b3.b, b1.b);
    }
    
    // struct memory to storage is a copy  
    function structMemoryToStorage() public returns (uint, uint) {
         B memory b3 = B(1,A(2));
         b1 = b3;
         b1.b = 5;
         
         return (b1.b, b3.b);
    }
    
    // struct memory to memory is a reference  
    function structMemoryToMemory() public returns (uint, uint) {
         B memory b3 = B(1,A(2));
         B memory b4 ;
         
         b4 = b3;
         
         b4.b = 5;
         
         return (b4.b, b3.b);
    }
    
    
    function copyNestedStruct() public returns (uint, uint) {
        b1.a = b2.a;
        b1.a.a = 6;
        
        return ( b1.a.a,  b2.a.a);
    }
    
    function ternaryInExpressionStatement(uint a) public returns (uint) {
        require( a >0 );
        a == 1 ? a+=1 : a+=2 ;
        return a;
    }
            
    function ternaryNested(uint a) public returns (uint) {
        if ( a == 1 ? (a <= 1 ? true : false ) : false ){
            a += 1;
        } else if (a <= 1 ? true : false == a <= 2 ? true : false){
            a += 1;
        }
        return a ;
    }

    function ternaryNestedFunctioncallArguement(bool b) public returns (int64) {
        int16 x = 1337; 
        return sqrt( (b? x = 2 : x = 3));
    }
    
    function ternaryReturn(uint a) public returns (uint) {
        require( a>0 );
        return (a == 1 ? a+=1 : a+=2) ;
    }

    function ternaryReturnMultiple(bool b) public returns (uint, uint) {
        return ((b?x=1:x=2), (b?y=1:y=2));
    }

    function libraryUsing(uint a) public returns (uint) {
        uint x = a.mul(2);
        return (x.div(2));
    }

    function libraryCall(uint a) public returns (uint) {
        uint x = SafeMath.mul(a, 2);
        return (SafeMath.div(x, 2));
    }

    function createContract() public {
        TokenCreator tc = new TokenCreator();
        tc.changeName(OwnedToken(0xca35b7d915458ef540ade6068dfe2f44e8fa733c),"XYZ");
    }

        
    function castToChar(byte b) pure internal returns (byte c) {
        if (b < 10) return byte(uint8(b) + 0x30);
        else return byte(uint8(b) + 0x57);
    }

    function castToString(address a) public returns (bytes) {
        bytes memory str = new bytes(40);
        
        for (uint i = 0; i < 20; i++) {
            byte strb = byte(uint8(uint(this) / (2**(8*(19 - i)))));
            
            byte hi = byte(uint8(strb) / 16);
            byte lo = byte(uint8(strb) - 16 * uint8(hi));
            
            str[2*i] = castToChar(hi);
            str[2*i+1] = castToChar(lo);            
        }
        
        return str;
    }
    
    function castToUpper(string str) pure internal returns (string) {
		bytes memory bStr = bytes(str);
		bytes memory bUpper = new bytes(bStr.length);
		for (uint i = 0; i < bStr.length; i++) {
			if ((bStr[i] >= 97) && (bStr[i] <= 122)) {
				bUpper[i] = byte(int(bStr[i]) - 32);
			} else {
				bUpper[i] = bStr[i];
			}
		}
		return string(bUpper);
    }
    
    function castToUint(string self) view internal returns (uint result) {
        bytes memory b = bytes(self);
        uint i;
        result = 0;
        for (i = 0; i < b.length; i++) {
            uint c = uint(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
    }

    function types() public {
        uint16 a = 1;
        int8 b = 2;
        address c = address(0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        bool d = true;
        bytes4 e = bytes4(0xff000000);
        bytes memory f = "0xaa";
        string memory g = "aa";
    }

    modifier checkBefore(uint x, uint y){
      require(x!=y);     
      _;    
      // x and y are actually affected by changes 
      //    require(x>y);
    }

    modifier checkAfter(uint x, uint y){
      _;    
      require(x>y);
    }

    modifier increaseSum(){
      _;
      require(sum>0);
      sum +=1;
    }

    modifier greaterThanStateVar(uint c) {
        uint a; // modifiers can define local variables
        a=c;
        require (a>b); // modifiers can refer to state variables
        _;
    }

    // The same modifier can be applied twice to a function
    function modifierRepeated(uint x, uint y) public greaterThanStateVar(x) greaterThanStateVar(y) returns (uint) {
        return x+y;
    }

    function modifierBefore(uint x, uint y) public checkBefore(x,y) returns (uint){
        return x + y;
    }

    function modifierReturn(uint x, uint y) public increaseSum() returns (uint){
        sum =1;
        // returns 1 and sum is 2 if x = 1 and y = 0 
        return sum;
    }

    function modifierAfter(uint x, uint y) public checkAfter(x,y) returns (uint){
        // reverts if x=0 and y=0 
        x += 1;
        return x+y;
    }

    function modifierTwo(uint x, uint y) public checkAfter(x,y) checkBefore(x,y)  {
        x += 1;
    }

    modifier alterMemoryBefore(uint[3] memory x) {
        x[0] = 1;
        _;
    }
    
    
    
    function modifierChangeMemoryArrBefore(uint[3] memory a) public alterMemoryBefore(a) returns (uint[3] memory) {
        // This returns [1, _, _] as alterMemoryBefore changes memory.
        return a;
    }
    
    modifier alterMemoryAfter(uint[3] memory x) {
        _;
        x[0] = 1;
    }
    
    function modifierChangeMemoryArrAfter1(uint[3] memory a) public alterMemoryAfter(a) returns (uint[3] memory) {
        // This returns [1, _, _] as even though alterMemoryAfter runs after the body if the function, it runs before the caller
        // so if you call modifierChangeMemoryArrAfter1([5,5,5]) you would get [5,5,5]
        return a;
    }
    
    function modifierChangeMemoryArrAfter2(uint[3] memory a) public alterMemoryAfter(a) returns (uint) {
        // This returns whatever the caller passed in in a[0] instead of one, since the mutation happens after the fun body
        // So if you call modifierChangeMemoryArrAfter2([5,5,5]) you would get 5 instead of 1
        uint res = a[0];
        return res;
    }
    
    function divisionByZero(uint z) public returns (uint){
        uint x = 1/z;
        uint y = 1%z;
    }


    function mixedReturn1(uint x) public returns (uint, uint a) {
        a = 10;
        return (1,2);
    }
    
    function mixedReturn2(uint x) public returns (uint, uint a) {
        a = 10;
    }

    function returnImplicitCopy() public returns (uint[3]) {
        return a1;
    }

    function expressionNoAssignment() public {
        1 + sqrt(1);
        1+1;
        1; 
    }

    function storageLocations(string a, TestStructA b,  uint[] c) public {
        uint[] e;
        e.push(2);
        data = e;
        
        string f = someString;

        TestStructA memory g;
        g= TestStructA("123",123,TestEnum.A);
        TestStructA  h;
        
        bytes i;
    }

    function deleteFunc() public {
        uint x = sum;
        delete x; // sets x to 0, does not affect data
        delete data; // sets data to 0, does not affect x
        uint[] storage y = data;
        delete data; // this sets dataArray.length to zero, but as uint[] is a complex object, also
        // y is affected which is an alias to the storage object
        // On the other hand: "delete y" is not valid, as assignments to local variables
        // referencing storage objects can only be made from existing storage objects.
        assert(y.length == 0);
    }


    function structOperations() public returns (int) {
        int [1] memory y;
        y[0] = 1;
        
        // TestStructC contains memory reference to z 
        TestStructC memory z = TestStructC("x", 2, y);

        // copy memory struct to storage struct 
        e = z;

        // change value in y and z but not in e since it's a copy
        z.memberZ[0] = 2;
        
   
        return  e.memberZ[0];
       // return y[0];
    }

    function literals() public {
         uint [3] memory array = [uint(1), 2, 3];
         string memory someText = "test";
         uint x = 1;
         address  lol = 0xCf5609B003B2776699eEA1233F7C82D5695cC9AA;
    }

    function arrays() public returns (uint[]) {
        uint[] storage a = data;
        uint b;

        a.push(1);
        a.push(2);
        a.push(3);
        
        a.length = 2;
        b = a.push(1) + 1;
        
        uint c = a.length;
        return a;
    }
  
    function tupleInlineArrayAssignment() public {
        uint[3] memory a;
        uint[3] memory b;
        
        (a,b) = ([uint(1),2,3], [uint(4),5,6]);
    }

    function builtins() public payable {
        bytes32 a = block.blockhash(1+1);
        uint b = msg.gas;
        address myAddress = this; 
        uint myBalance = this.balance; 
        suicide(someAddress);
        
        bytes32 c = sha256("foo");
        bytes32 d = sha3("foo");

                
        address someAddress = 0xCf5609B003B2776699eEA1233F7C82D5695cC9AA;
        bool r1 = someAddress.call(abi.encode("calculate(uint, uint)", 1, 2));
        r1 = someAddress.delegatecall(abi.encode("calculate(uint, uint)", 1, 2));
        r1 = someAddress.callcode(abi.encode("calculate(uint, uint)", 1, 2));
         
        r1 = someAddress.call.value(55)();
        r1 = someAddress.call.gas(100)(bytes4(sha3("deposit()"))); 
        r1 = someAddress.call.value(100).gas(44)(bytes4(sha3("deposit()"))); 
        r1 = someAddress.call.gas(44).value(100)(bytes4(sha3("deposit()"))); 
        r1 = someAddress.call.gas(44).gas(45).value(100).value(101)(bytes4(sha3("deposit()"))); 

        address someOtherAddress = 0xDEADBEEF;
        bool flag;

        r1 = (flag ? someAddress : someOtherAddress).call.value(100).gas(1123)(bytes4(sha3("deposit()")));

        bytes4 h = this.addOne.selector;
    }  

        
    function addOne(uint a) public returns (uint) {
        return a+1;
    }    

    
    function addOneTwice(uint a, uint b) public returns (uint, uint) {
        return (addOne(a), addOne(b));
    }    

    function arrayLenModifiers() public {
        uint[] storage a = data;
        uint b;

        a.length = 1;
        (a.length, b) = (3,4);

        b = (a.length=1) + 1;

        a.length = addOne(1);

        (b, a.length) = addOneTwice(1,2);

        a.length += 1;
        a.length *= 2;
        a.length >>= 2;
     }

    function mappings() public {
        // Simple storage map indexing and aliasing
        mapping (uint => uint) m = uintMap;
        
        uint a = uintMap[1];
        uintMap[1] = 10;
        
        uint b = m[1];
        
        assert(b == 10);
        // Storage map containg arrays - indexing and aliasing
        mapping (uint => uint[]) m1 = uintArrMap;
        
        m1[0] = [1,2,3];
        assert(uintArrMap[0][2] == 3);
        // Storage map containg structs - indexing and aliasing
        mapping (uint => TestStructB) m3 = uintStructMap;
        m3[1] = TestStructB(TestStructA("sup", 42, TestEnum.C), "dawg", 127, address(0x43));
        
        assert(uintStructMap[1].memberA.memberY == 42);
        assert(uintStructMap[1].memberC == 127);
        assert(bytes(uintStructMap[1].memberA.memberX).length == 3);
    }

    function paramReturnAssignments(uint a) public returns (uint b, uint) {
        a = a + 1;
        a = 1 ;
        b = 2;
        return (a, b); // this returns (1,2). WTF?
    }
}
