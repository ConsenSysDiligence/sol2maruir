pragma solidity ^0.6.0;

contract VarHolder {
    uint256 public x;

    function modifyAndMaybeFail(uint256 newX, bool fail) public {
        x = newX;
        if (fail) {
            require(false, "nooo");
        }
    }
}

contract TryCatchState {
    uint256 public x;
    VarHolder v;
    constructor() public {
        v = new VarHolder();
    }

    function modifyAndMaybeFail(uint256 newX, bool fail) public {
        x = newX;
        if (fail) {
            require(false, "nooo");
        }
    }

    function successfulModifySelf() public {
        x = 1;
        try this.modifyAndMaybeFail(2, false) {
            x = x + 1;
        } catch {
            assert(false); // Shouldn't get here
        }
        assert(x == 3);
    }

    function revertingModifySelf() public {
        x = 1;
        try this.modifyAndMaybeFail(2, true) {
            x = x + 1;
        } catch {
            x = x + 100;
        }
        assert(x == 101);
    }

    function successfulModifyOther() public {
        v.modifyAndMaybeFail(1, false);
        assert(v.x() == 1);
        x = 1;
        try v.modifyAndMaybeFail(2, false) {
            //
        } catch {
            assert(false); // Shouldn't get here
        }
        assert(v.x() == 2 && x == 1);
    }

    
    function revertingModifyOther() public {
        v.modifyAndMaybeFail(1, false);
        assert(v.x() == 1);
        x = 1;
        try v.modifyAndMaybeFail(2, true) {
            x = x + 1;
        } catch {
            x = x + 100;
        }
        assert(v.x() == 1 && x == 101);
    }
}
