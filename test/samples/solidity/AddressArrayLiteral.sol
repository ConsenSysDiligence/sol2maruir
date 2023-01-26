contract Test {
    address[3] public addrs = [
        0x9a1Fc7173086412A10dE27A9d1d543af3AB68262,
        msg.sender, // deployer
        0x8a91aC199440Da0B45B2E278f3fE616b1bCcC494
    ];

    function verify() public {
        assert(addrs[0] == 0x9a1Fc7173086412A10dE27A9d1d543af3AB68262);
        assert(addrs[1] == msg.sender); // caller is deployer
        assert(addrs[2] == 0x8a91aC199440Da0B45B2E278f3fE616b1bCcC494);
    }
}
