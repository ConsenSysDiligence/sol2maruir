pragma solidity ^0.6.3;

abstract contract B {}
contract A is B{}
contract D is B{}
interface C {}
contract E is C {}

enum X {
    A, B, C
}

contract ContractEnumKeys06 {
    mapping (A => int) mA;
    mapping (B => int) mB;
    mapping (C => int) mC;
    
    mapping (X => int) mX;
    
    function main() public {
        A a = new A();
        A a1 = new A();
        D d = new D();
        
        B b = B(a);
        
        mA[a] = 1;
        assert(mA[a] == 1);
        assert(mA[a1] == 0);
        
        
        mB[a] = 2;
        mB[a1] = 22;
        mB[d] = 222;
        assert(mB[b] == 2);
        assert(mB[a1] == 22);
        assert(mB[d] == 222);
        
	E e = new E();

	mC[e] = 1;
	assert(mC[e] == 1);
        
        X x = X.A;
        mX[x] = 3;
        assert(mX[X.A] == 3);
        assert(mX[X.B] != mX[X.A]);
        assert(mX[X.B] == 0);
    }
}
