pragma solidity 0.8.4;
contract Test {
        fallback() external {}
        receive() external payable {}
        constructor() public {}

        function receive() external payable {}
        function fallback() external {}
}
