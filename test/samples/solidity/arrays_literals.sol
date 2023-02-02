contract ArrayLiterals {
    uint[] arr;
    uint8[] arr1;

    function foo() public returns (uint) {
        uint[3] memory t = [uint(1),2,3];

        uint x = [4,5,6][1];

        arr = [7,8,20000];
        arr1 = [9,2,11];

        return t[0] + x + arr[2] + arr1[1];
    }
}
