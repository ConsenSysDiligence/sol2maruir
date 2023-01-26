contract Proxy {
    uint256 public val;

    constructor(uint256 v) public {
        val = v;
    }
}

contract TypeBuiltin {
    function verify() public {
        string memory name = type(Proxy).name;
        bytes memory creationCode = type(Proxy).creationCode;
        bytes memory runtimeCode = type(Proxy).runtimeCode;
    }
}
