pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

contract Misc {
    enum TestEnum {
        A,
        B,
        C
    }

    uint[] data = [1, 2, 3];
    string public someString = "123";
    uint public sum = 15;

    struct TestStructA {
        string memberX;
        int memberY;
        TestEnum memberZ;
    }

    function sqrt(int32 x) public pure returns (int32 y) {
        int32 z = (x + 1) / 2;

        y = x;

        while (z < y) {
            y = z;

            z = (x / z + z) / 2;
        }
    }

    function types() public {
        uint16 a = 1;
        int8 b = 2;
        address c = address(0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        bool d = true;
        bytes4 e = bytes4(0xff000000);
        bytes memory f = "0xaa";
        string memory g = "ab";

        assert(a == 1);
        assert(b == 2);
        assert(c == 0x8a9a728f64E58Db7e790F099BdDB3416ccC2Eb77);
        assert(d == true);

        assert(e[0] == 0xff);
        assert(e[1] == 0x00);
        assert(e[2] == 0x00);
        assert(e[3] == 0x00);

        assert(f[0] == 0x30);
        assert(f[1] == 0x78);
        assert(f[2] == 0x61);
        assert(f[3] == 0x61);

        assert(bytes(g)[0] == 0x61);
        assert(bytes(g)[1] == 0x62);
    }

    function divisionBy(uint z) public returns (uint) {
        uint x = 6 / z;

        return x;
    }

    function modBy(uint z) public returns (uint) {
        uint x = 7 % z;

        return x;
    }

    function expressionNoAssignment() public {
        1 + sqrt(1);
        1 + 1;
        1;
    }

    // Unable to define struct arg - not covered with test
    function storageLocations(string a, TestStructA b,  uint[] c) public {
        uint[] e;
        e.push(2);
        data = e;

        string f = someString;

        TestStructA memory g;
        g = TestStructA("123",123,TestEnum.A);
        TestStructA h;

        bytes i;
    }

    function deleteFunc() public {
        assert(sum == 15);

        uint x = sum;

        assert(x == sum);

        delete x; // sets x to 0, does not affect sum

        assert(x == 0);
        assert(sum == 15);
        assert(x != sum);

        x = 10;

        delete sum; // sets sum to 0, does not affect x

        assert(x == 10);
        assert(sum == 0);
        assert(x != sum);

        assert(data[0] == 1);
        assert(data[1] == 2);
        assert(data[2] == 3);

        uint[] storage y = data;

        assert(y[0] == data[0]);
        assert(y[1] == data[1]);
        assert(y[2] == data[2]);
        assert(y.length == data.length);

        delete data; // this sets dataArray.length to zero, but as uint[] is a complex object, also
        // y is affected which is an alias to the storage object
        // On the other hand: "delete y" is not valid, as assignments to local variables
        // referencing storage objects can only be made from existing storage objects.
        assert(data.length == 0);
        assert(y.length == 0);
        
        // The docs talk about 'deleting a[x] leaving a hole in the array'. As far as I can tell
        // from the below experiements in remix, deleting an element of an array just 0-es it out.
        // Deleting the last element of the array also does not decrease the length of the array.
        data = [1,2,3];
        delete data[1];
        assert(data[1] == 0);
        delete data[2];
        assert(data.length == 3);
        assert(data[2] == 0);

    }

    function expAssoc(uint a, uint b, uint c) public returns (uint) {
        return a**b**c;
    }
}
