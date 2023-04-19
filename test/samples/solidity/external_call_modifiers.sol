pragma solidity ^0.4.24;

contract A {
    constructor() public payable {}
    function arr() public payable {}
}

contract ExternalCallModifiers {
    constructor() payable {}
    
    function main() public {
        A a = new A();
        //a = (new A)();
        a = (new A).value(5)();
        // Why are the below 2 only applicable to calls and not constructors?
        //a = (new A).gas(1000)();
        //a = (new A).value(5).gas(1000)();
        a.arr();
        a.arr.value(5)();
        a.arr.gas(100)();
        a.arr.gas(200).value(10)();
    }
}