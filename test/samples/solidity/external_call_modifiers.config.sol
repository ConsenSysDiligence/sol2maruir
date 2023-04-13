pragma solidity ^0.4.24;

contract A {
    constructor() public payable {}

    function arr() public payable {}
}

contract ExternalCallModifiers {
    constructor() public payable {}

    function main() public {
        A a = new A();
        //a = (new A)();
        a = (new A).value(5)();
        // Why are the below 2 only applicable to calls and not constructors?
        //a = (new A).gas(1000)();
        //a = (new A).value(5).gas(1000)();
        a.arr();
        a.arr.value(5)();
        a.arr.gas(10000)();
        a.arr.gas(20000).value(10)();
    }
}

contract __IRTest__ {
    function main() public payable {
        ExternalCallModifiers __this__ = (new ExternalCallModifiers).value(msg.value)();
        __testCase80__(__this__);
    }

    function __testCase80__(ExternalCallModifiers __this__) internal {
        __this__.main();
    }
}
