pragma solidity ^0.5.0;

contract MapWithStringKeys {
    mapping (string => int) x;
    mapping (bytes => uint) z;
    string y;
    bytes b;
    
    constructor() public {
        y = 'test';
        b = bytes(y);
    }

    function useCase(string memory str) view public returns (int) {
        return x[str];
    }
    
    function main() public {
        x[y] = 1;
        string memory foo = 'foo';
        x[foo] = 2;
        x['boo'] = 3;
        
        assert(x[y] == 1);
        assert(x[foo] == 2);
        assert(x['boo'] == 3);
        
        z[b] = 4;
        bytes memory bar = b;
        assert(z[bar] == 4);
    }
}
