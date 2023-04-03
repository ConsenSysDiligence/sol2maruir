contract NumPong {
    address daddy;
    uint public myNum;

    constructor(
        address _daddy,
        uint _myNum
    ) {
        daddy = _daddy;
        myNum = _myNum;
    }
    
    function getMyNum() public virtual returns (uint) {
        assert(msg.sender == daddy);
        return myNum;
    }
}

contract A is NumPong {
    constructor(
        address _daddy,
        uint _myNum
    ) NumPong(_daddy, _myNum) {
    }

    function getMyNum() public override returns (uint) {
        return myNum + 1;
    }    
}

contract B is NumPong {
    constructor(
        address _daddy,
        uint _myNum
    ) NumPong(_daddy, _myNum) {
    }

    function getMyNum() public override returns (uint) {
        return myNum * 2;
    }    
}


contract C is NumPong {
    constructor(
        address _daddy,
        uint _myNum
    ) NumPong(_daddy, _myNum) {
    }

    function getMyNum() public override returns (uint) {
        return 42;
    }    
}

contract Dispatch {
    function main() public returns (uint) {
        NumPong[] memory contracts = new NumPong[](4);
        contracts[0] = new NumPong(address(this), 10);
        contracts[1] = new A(address(this), 100);
        contracts[2] = new B(address(this), 13);
        contracts[3] = new C(address(this), 1000);
        
        uint[] memory results = new uint[](4);
        results[0] = 10;
        results[1] = 101;
        results[2] = 26;
        results[3] = 42;

        return check(contracts, results);
    }

    function check(NumPong[] memory contracts, uint[] memory results) internal returns (uint) {
        uint sum = 0;
        for (uint i = 0; i < contracts.length; i++) {
            uint t = contracts[i].getMyNum();
            assert(t == results[i]);
            sum += results[i];
        }

        return sum;
    }
}
