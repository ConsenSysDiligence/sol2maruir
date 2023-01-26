pragma solidity 0.4.25;

contract Callee {
    uint public x;
    
    function Callee() public {
        x = 0;
    }
    
    function add(uint a) public {
        x += a;
    }
}

contract Call04 {
    Callee c;
    
    function Call04() public {
        c = new Callee();
    }
    
    function main() public {
        c.add(3);
        assert(c.x() == 3);
        
        bytes memory arg = abi.encodeWithSignature("add(uint256)", uint(3));
        bool res = address(c).call(arg);
        assert(res);
        assert(c.x() == 6);
        
        bytes4 selector = bytes4(bytes32(keccak256("add(uint256)")));
        bytes memory arg1 = abi.encodeWithSelector(selector, (uint32(3)));
        bool res1 = address(c).call(arg1);
        assert(res1);
        assert(c.x() == 9);
        
        bool res2 = address(c).call(selector, (uint(3)));
        assert(res2);
        assert(c.x() == 12);
        
        //This crashes
        string memory signature = "add(uint256)";
        bool res3 = address(c).call(signature, (uint(3)));
        //assert(res3);
        
        //And this crashes
        string memory name = "add";
        bool res4 = address(c).call(name, (uint(3)));
        //assert(res4);
        
        address(c).call();
    }
}
