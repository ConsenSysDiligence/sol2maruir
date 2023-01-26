pragma solidity ^0.6.0;

contract Caller {
    uint256 public x;
    Callee c;

    constructor(Callee arg) public {
        c = arg;
    }

    function setX(uint256 newX) public {
        x = newX;
    }

    function callAndMaybeFail(uint256 newX, bool calleeFail, bool fail) public {
        x = newX;
        c.modifyAndMaybeFail(newX, calleeFail);
        if (fail) {
            require(false, "caller nooo");
        }
    }
}

contract Callee {
    uint256 public y;

    function setY(uint256 newY) public {
        y = newY;
    }

    function modifyAndMaybeFail(uint256 newY, bool fail) public {
        y = newY;
        if (fail) {
            require(false, "callee nooo");
        }
    }
}

contract TryCatchStateNested {
    Caller a;
    Callee b;
    uint256 z;

    constructor() public {
        b = new Callee();
        a = new Caller(b);
    }

    function callerFail() public {
        z = 10;
        a.setX(20);
        b.setY(30);

        // b's call will succceed and a's call will fail afterwards
        try a.callAndMaybeFail(100, false, true) {
            z = 1000; // shouldn't get here
        } catch {
            z = z + 1; // should get here
        }

        assert(z == 11);
        // The changes to a.x and b.y should be reverted
        assert(a.x() == 20);
        assert(b.y() == 30);
    }
    
    function calleeFail() public {
        z = 10;
        a.setX(20);
        b.setY(30);

        // b's call will succceed and a's call will fail afterwards
        try a.callAndMaybeFail(100, true, false) {
            z = 1000; // shouldn't get here
        } catch {
            z = z + 1; // should get here
        }

        assert(z == 11);
        // The changes to a.x and b.y should be reverted
        assert(a.x() == 20);
        assert(b.y() == 30);
    }
}
