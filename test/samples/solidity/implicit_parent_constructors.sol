pragma solidity ^0.4.24;

contract Base1 {
    uint x;
    constructor () public {
        x = x+1;
    }
}

/**
 * Case 1: One parent, no explicit call
 */
contract Child1 is Base1 {
    constructor () public {
    }

    function main() public {
       assert(x == 1); 
    }
}

/**
 * Case 2: One parent, explicit call in constructor. Make sure its called exactly once.
 */
contract Child2 is Base1 {
    constructor () Base1() public {
    }

    function main() public {
       assert(x == 1); 
    }
}

/**
 * Case 3: One parent, explicit call in inheritance list. Make sure its called exactly once.
 */
contract Child3 is Base1() {
    constructor () public {
    }

    function main() public {
       assert(x == 1); 
    }
}


/**
 * Case 4: Two direct parents, no explicit call. Make sure all are called exactly once.
 */
contract Base2 {
    uint y;
    constructor () public {
        y = y+1;
    }
}


contract Child4 is Base1, Base2 {
    constructor () public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}

/**
 * Case 5: Two direct parents, one explicit call. Make sure all are called exactly once.
 */
contract Child5 is Base1, Base2 {
    constructor () Base1() public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}

/**
 * Case 6: Two direct parents, two explicit call. Make sure all are called exactly once.
 */
contract Child6 is Base1, Base2 {
    constructor () Base1() Base2() public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}

/**
 * Case 7: Indirect parent.
 */
contract Base3 is Base1 {
    uint y;
    constructor () public {
        y = y+1;
    }
}

contract Child7 is Base3 {
    constructor () Base3() public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}

/**
 * Case 8: Both direct and indirect parent.
 */
contract Child8 is Base1, Base3 {
    constructor () Base3() public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}

/**
 * Case 9: Both direct and indirect parent. 2 explicit calls.
 */
contract Child9 is Base1, Base3 {
    constructor () Base3() Base1() public {
    }

    function main() public {
       assert(x == 1 && y == 1); 
    }
}


/**
 * Case 10: Explicit constructors in the inheritance list
 */

contract Base4 {
    constructor(uint a) {
        assert(a==1);
    }
}

contract Child10 is Base4(1) {}
