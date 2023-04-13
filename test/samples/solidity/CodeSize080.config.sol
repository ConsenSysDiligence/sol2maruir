pragma solidity 0.8.0;

contract CodeSize {
    function f() public returns (uint) {
        return address(this).code.length;
    }
}

contract __IRTest__ {
    function main() public {
        CodeSize __this__ = new CodeSize();

        assert(__this__.f() == 232);
    }
}
