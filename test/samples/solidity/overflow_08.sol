pragma solidity 0.8.3;

contract InlineInitializerArithmetic {
    uint8 a = 255;
    uint8 b = a + 1;
}

contract ModifierArgArithmetic {
    modifier M(int8 m) {
        _;
    }

    function foo(int8 x) M(x+1) public {}
}


contract Base {
    constructor(int8 x) {
    }
}

contract BaseConstructorArgArithmetic is Base {
    constructor(int8 x) Base(x+1) {
        
    }
}

contract Overflow08 {

    function add_u8(uint8 x, uint8 y) external returns (uint8) {
        return x+y;
    }

    function add_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x+y;
        }
    }

    function add_i8(int8 x, int8 y) external returns (int8) {
        return x+y;
    }

    function add_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x+y;
        }
    }


    function sub_u8(uint8 x, uint8 y) external returns (uint8) {
        return x-y;
    }

    function sub_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x-y;
        }
    }

    function sub_i8(int8 x, int8 y) external returns (int8) {
        return x-y;
    }

    function sub_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x-y;
        }
    }

    function mul_u8(uint8 x, uint8 y) external returns (uint8) {
        return x*y;
    }

    function mul_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x*y;
        }
    }

    function mul_i8(int8 x, int8 y) external returns (int8) {
        return x*y;
    }

    function mul_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x*y;
        }
    }

    function div_i8(int8 x, int8 y) external returns (int8) {
        return x/y;
    }

    function div_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x/y;
        }
    }

    function neg_i8(int8 x) external returns (int8) {
        return -x;
    }

    function neg_i8_unchecked(int8 x) external returns (int8) {
        unchecked {
            return -x;
        }
    }

    function exp_i8(int8 x, uint8 exp) external returns (int8) {
        return x**exp;
    }

    function exp_i8_unchecked(int8 x, uint8 exp) external returns (int8) {
        unchecked {
            return x ** exp;
        }
    }

    function inc_i8(int8 x) external returns (int8) {
        return x++;
    }

    function inc_i8_unchecked(int8 x) external returns (int8) {
        unchecked {
            return x ++;
        }
    }

    function dec_i8(int8 x) external returns (int8) {
        return --x;
    }

    function dec_i8_unchecked(int8 x) external returns (int8) {
        unchecked {
            return --x;
        }
    }

    function comp_assign_add(int8 x, int8 y) external returns (int8) {
        return x += y;
    }

    function comp_assign_sub(int8 x, int8 y) external returns (int8) {
        return x -= y;
    }

    function comp_assign_mul(int8 x, int8 y) external returns (int8) {
        return x *= y;
    }

    function comp_assign_div(int8 x, int8 y) external returns (int8) {
        return x /= y;
    }
}