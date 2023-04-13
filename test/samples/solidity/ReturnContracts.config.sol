pragma solidity ^0.5.0;


contract ERC20 {}


contract ReturnContracts {
    ERC20[] public tokens;
    ERC20 token;
    //mapping(uint256 => ERC20) token_map;
    struct Foo {
        uint256 x;
        ERC20 t;
        address a;
    }

    Foo f;
    Foo[] fs;

    function retArray() public view returns (ERC20[] memory) {
        return tokens;
    }

    function retArrayNamed() public view returns (ERC20[] memory x) {
        x = tokens;
    }

    function retContract() public view returns (ERC20) {
        return token;
    }

    function retContractNamed() public view returns (ERC20 x) {
        x = token;
    }

    function retStruct() internal view returns (Foo memory) {
        return f;
    }

    function retStructNamed() internal view returns (Foo memory x) {
        x = f;
    }

    function retStructs() internal view returns (Foo[] memory) {
        return fs;
    }

    function retStructsNamed() internal view returns (Foo[] memory x) {
        x = fs;
    }

    // TODO: support maps in return
    /*
    function retMap() internal view returns (mapping(uint256 => ERC20) storage) {
        return token_map;
    }

    function retMapoNamed() internal view returns (mapping(uint256 => ERC20) storage x) {
        x = token_map;
    }
   */
}

contract __IRTest__ {
    function main() public {
        // Just verify that it compiles properly
    }
}
