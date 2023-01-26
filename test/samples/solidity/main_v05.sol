
pragma solidity 0.5.5;

import './contract_v04.sol';

contract Sol {

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

    uint a;
    uint256 b;

    uint private x =1; 
    uint internal y =1; 
    uint public sum = 0;

    TestStructB c;
    TestEnum d;
    
    
    uint[3] a1;
    uint[3] a2;
    uint[] data;
    
    struct A { uint a; }
    struct B { uint b; A a; }

    mapping (uint => uint) uintMap;
    mapping (uint => uint[]) uintArrMap;
    mapping (uint => TestStructB) uintStructMap;
    
     B b1 = B(1,A(2));
     B b2 = B(3,A(4));

    constructor() public {
        a = 1;
        b = 100000000000;
        c = TestStructB(TestStructA("x", 2, TestEnum.C), "b", 5, address(0x0));
    }

    function types() public {
        uint16 a = 1;
        int8 b = 2;
        address c = address(0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        bool d = true;
        bytes4 e = bytes4(0xff000000);
        bytes memory f = "0xaa";
        string memory g = "aa";

        address payable x = address(0x123);
        address myAddress = address(this);
        if (x.balance < 10 && myAddress.balance >= 10) x.transfer(10);
    }


    function shadow(uint msg, uint x) public returns (uint) {
       uint x = msg;
       
       if (msg >5){
           uint x = 2;
           if (x+msg > 6){
               return x+msg;
           }
       }
       
       return x;
   }

    function literals() public {
         address  payable lol = 0xCf5609B003B2776699eEA1233F7C82D5695cC9AA;
    }

        
    function arrays() public returns (uint[] memory) {
        uint[] storage a = data;
        a.push(1);
        a.push(2);
        a.push(3);
        
        a.length = 2;
        a.pop();
        
        return a;
    }

    function builtins() public payable {
       bytes32 a = blockhash(1);
       address b = block.coinbase;
       uint c = block.difficulty;
       uint d = block.gaslimit;
       uint e = block.number;
       uint f = block.timestamp;
       uint g = gasleft();
       bytes memory h = msg.data;
       address i = msg.sender;
       bytes4 j = msg.sig;
       uint k = msg.value;
       uint l = now;
       uint m = tx.gasprice;
       address n = tx.origin;
       abi.encodePacked(uint16(0x12));
       
       uint8[3] memory arr = [0x1, 0x2, 0x42];
       
       bytes memory o1 = abi.encode( "ABC");
       bytes memory p1 = abi.encode( "ABC", "DEF");
       bytes memory q1 = abi.encode(arr, "ABC", "DEF");
       
       bytes memory o2 = abi.encodePacked( "ABC");
       bytes memory p2 = abi.encodePacked( "ABC", "DEF");
       bytes memory q2 = abi.encodePacked(arr, "ABC", "DEF");
       
       bytes4 selector1 = 0xed81cdda;
       bytes memory o3 = abi.encodeWithSelector( selector1);
       bytes memory p3 = abi.encodeWithSelector( selector1, "DEF");
       bytes memory q3 = abi.encodeWithSelector( selector1, arr, "ABC", "DEF");
       
       string memory selector2 = "ed81cdda";
       bytes memory o4 = abi.encodeWithSignature( selector2);
       bytes memory p4 = abi.encodeWithSignature( selector2, "DEF");
       bytes memory q4 = abi.encodeWithSignature( selector2, arr, "ABC", "DEF");
       
       bytes memory encodedData = "000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044141414100000000000000000000000000000000000000000000000000000000";
       string memory r = abi.decode(encodedData, (string)) ;
       (string memory tr1, string memory tr2) = abi.decode(encodedData, (string, string)) ;
       
       uint s = addmod(1,2,3);
       uint t = mulmod(1,2,3);
       bytes32 u = keccak256("something");
       bytes32 v = ripemd160("something");
       
       address w = ecrecover(u,1,"123","456");
       
       uint x = address(this).balance;
       x = msg.sender.balance;
       
       bool result = (0xCf5609B003B2776699eEA1233F7C82D5695cC9AA).send(1 ether);
       tx.origin.transfer(1 ether);
       
       address payable someAddress = 0xCf5609B003B2776699eEA1233F7C82D5695cC9AA;
       (bool r1, bytes memory r2) = someAddress.call(abi.encode("calculate(uint, uint)", 1, 2));
       (r1, r2) = someAddress.delegatecall(abi.encode("calculate(uint, uint)", 1, 2));
       (r1, r2) = someAddress.staticcall(abi.encode("calculate(uint, uint)", 1, 2));
       
       selfdestruct(someAddress);
       
       string memory y = type(OwnedToken).name;
       bytes memory z1 = type(OwnedToken).creationCode;
       bytes memory z2 = type(OwnedToken).runtimeCode;
    }

    function mappings() public {
        // Simple storage map indexing and aliasing
        mapping (uint => uint) storage m = uintMap;
        
        uint a = uintMap[1];
        uintMap[1] = 10;
        
        uint b = m[1];
        
        assert(b == 10);
        // Storage map containg arrays - indexing and aliasing
        mapping (uint => uint[]) storage m1 = uintArrMap;
        
        m1[0] = [1,2,3];
        assert(uintArrMap[0][2] == 3);
        // Storage map containg structs - indexing and aliasing
        mapping (uint => TestStructB) storage m3 = uintStructMap;
        m3[1] = TestStructB(TestStructA("sup", 42, TestEnum.C), "dawg", 127, address(0x43));
        
        assert(uintStructMap[1].memberA.memberY == 42);
        assert(uintStructMap[1].memberC == 127);
        assert(bytes(uintStructMap[1].memberA.memberX).length == 3);
    }
}
