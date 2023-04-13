pragma solidity ^0.6.0;

contract HexLiterals {
    bytes4 public constant signatureOfSmt = "\x75\x32\xea\xac";
    bytes4 public signatureOther = "\xe9\xaf\xa7\xa1";
    bytes2 internal twoBytes;

    constructor() public {
        twoBytes = "\xff\x00";
    }

    function some(bytes memory x) public pure returns (bytes memory) {
        return x;
    }

    // https://github.com/ethereum/solidity/pull/832
    function main() public {
        assert(signatureOfSmt == 0x7532eaac);
        assert(this.signatureOfSmt() == 0x7532eaac);

        assert(signatureOther == 0xe9afa7a1);
        assert(this.signatureOther() == 0xe9afa7a1);

        assert(twoBytes == 0xff00);

        assert(bytes1(0x01) | hex"02" == 0x03);
        assert(~bytes1(hex"01") == 0xfe);

        bytes2 a = hex"AA_BB";

        assert(a == 0xaabb);

        bytes memory b = hex"11ff33bb";

        assert(b[0] == 0x11);
        assert(b[1] == 0xff);
        assert(b[2] == 0x33);
        assert(b[3] == 0xbb);

        string memory c = hex"010203";

        assert(bytes(c)[0] == 0x01);
        assert(bytes(c)[1] == 0x02);
        assert(bytes(c)[2] == 0x03);

        bytes memory d = some(hex"0405");

        assert(d[0] == 0x04);
        assert(d[1] == 0x05);
    }
}

contract __IRTest__ {
    function main() public {
        HexLiterals __this__ = new HexLiterals();
        __testCase206__(__this__);
    }

    function __testCase206__(HexLiterals __this__) internal {
        __this__.main();
    }
}
