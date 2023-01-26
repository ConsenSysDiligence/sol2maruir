pragma solidity ^0.4.13;

contract Some {
    function() public payable {}
}

contract AddressMembersOfContract {
    function verify(uint x) public {
        Some s = new Some();

        s.balance;
        s.transfer(0 ether);
        s.send(0 ether);
        s.call();
        s.delegatecall();
        s.callcode();
    }
}
