pragma solidity 0.8.3;

contract InlineInitializerArithmetic {
    uint8 internal a = 255;
    uint8 internal b = a + 1;
}

contract ModifierArgArithmetic {
    modifier M(int8 m) {
        _;
    }

    function foo(int8 x) public M(x + 1) {}
}

contract Base {
    constructor(int8 x) {}
}

contract BaseConstructorArgArithmetic is Base {
    constructor(int8 x) Base(x + 1) {}
}

contract Overflow08 {
    function add_u8(uint8 x, uint8 y) external returns (uint8) {
        return x + y;
    }

    function add_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x + y;
        }
    }

    function add_i8(int8 x, int8 y) external returns (int8) {
        return x + y;
    }

    function add_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x + y;
        }
    }

    function sub_u8(uint8 x, uint8 y) external returns (uint8) {
        return x - y;
    }

    function sub_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x - y;
        }
    }

    function sub_i8(int8 x, int8 y) external returns (int8) {
        return x - y;
    }

    function sub_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x - y;
        }
    }

    function mul_u8(uint8 x, uint8 y) external returns (uint8) {
        return x * y;
    }

    function mul_u8_unchecked(uint8 x, uint8 y) external returns (uint8) {
        unchecked {
            return x * y;
        }
    }

    function mul_i8(int8 x, int8 y) external returns (int8) {
        return x * y;
    }

    function mul_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x * y;
        }
    }

    function div_i8(int8 x, int8 y) external returns (int8) {
        return x / y;
    }

    function div_i8_unchecked(int8 x, int8 y) external returns (int8) {
        unchecked {
            return x / y;
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
        return x ** exp;
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
            return x++;
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

contract __IRTest__ {
    function main() public {
        Overflow08 __this__ = new Overflow08();
        __testCase427__(__this__);
        __testCase462__(__this__);
        __testCase503__(__this__);
        __testCase538__(__this__);
        __testCase573__(__this__);
        __testCase608__(__this__);
        __testCase649__(__this__);
        __testCase684__(__this__);
        __testCase725__(__this__);
        __testCase760__(__this__);
        __testCase795__(__this__);
        __testCase836__(__this__);
        __testCase871__(__this__);
        __testCase906__(__this__);
        __testCase947__(__this__);
        __testCase982__(__this__);
        __testCase1023__(__this__);
        __testCase1058__(__this__);
        __testCase1093__(__this__);
        __testCase1128__(__this__);
        __testCase1169__(__this__);
        __testCase1204__(__this__);
        __testCase1245__(__this__);
        __testCase1280__(__this__);
        __testCase1321__(__this__);
        __testCase1362__(__this__);
        __testCase1394__(__this__);
        __testCase1426__(__this__);
        __testCase1458__(__this__);
        __testCase1490__(__this__);
        __testCase1522__(__this__);
        __testCase1563__(__this__);
        __testCase1598__(__this__);
        __testCase1633__(__this__);
        __testCase1674__(__this__);
        __testCase1709__(__this__);
        __testCase1744__(__this__);
        __testCase1782__(__this__);
        __testCase1814__(__this__);
        __testCase1846__(__this__);
        __testCase1884__(__this__);
        __testCase1916__(__this__);
        __testCase1948__(__this__);
        __testCase1989__(__this__);
        __testCase2030__(__this__);
        __testCase2071__(__this__);
        __testCase2112__(__this__);

        try new InlineInitializerArithmetic() {
            assert(false);
        } catch {
            assert(true);
        }

        ModifierArgArithmetic __this2__ = new ModifierArgArithmetic();

        __testCase2160__(__this2__);
        __testCase2183__(__this2__);

        BaseConstructorArgArithmetic __this3__ = new BaseConstructorArgArithmetic(int8(126));

        try new BaseConstructorArgArithmetic(int8(127)) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase427__(Overflow08 __this__) internal {
        uint8 expect_427_0 = (uint8(255));
        uint8 ret_427_0 = __this__.add_u8(uint8(254), uint8(1));
        assert(ret_427_0 == expect_427_0);
    }

    function __testCase462__(Overflow08 __this__) internal {
        try __this__.add_u8(uint8(254), uint8(2)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase503__(Overflow08 __this__) internal {
        uint8 expect_503_0 = (uint8(0));
        uint8 ret_503_0 = __this__.add_u8_unchecked(uint8(254), uint8(2));
        assert(ret_503_0 == expect_503_0);
    }

    function __testCase538__(Overflow08 __this__) internal {
        int8 expect_538_0 = (int8(127));
        int8 ret_538_0 = __this__.add_i8(int8(126), int8(1));
        assert(ret_538_0 == expect_538_0);
    }

    function __testCase573__(Overflow08 __this__) internal {
        int8 expect_573_0 = (int8(-128));
        int8 ret_573_0 = __this__.add_i8(int8(-127), int8(-1));
        assert(ret_573_0 == expect_573_0);
    }

    function __testCase608__(Overflow08 __this__) internal {
        try __this__.add_i8(int8(126), int8(2)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase649__(Overflow08 __this__) internal {
        int8 expect_649_0 = (int8(-128));
        int8 ret_649_0 = __this__.add_i8_unchecked(int8(126), int8(2));
        assert(ret_649_0 == expect_649_0);
    }

    function __testCase684__(Overflow08 __this__) internal {
        try __this__.add_i8(int8(-127), int8(-2)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase725__(Overflow08 __this__) internal {
        int8 expect_725_0 = (int8(127));
        int8 ret_725_0 = __this__.add_i8_unchecked(int8(-127), int8(-2));
        assert(ret_725_0 == expect_725_0);
    }

    function __testCase760__(Overflow08 __this__) internal {
        uint8 expect_760_0 = (uint8(2));
        uint8 ret_760_0 = __this__.sub_u8(uint8(3), uint8(1));
        assert(ret_760_0 == expect_760_0);
    }

    function __testCase795__(Overflow08 __this__) internal {
        try __this__.sub_u8(uint8(1), uint8(3)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase836__(Overflow08 __this__) internal {
        uint8 expect_836_0 = (uint8(254));
        uint8 ret_836_0 = __this__.sub_u8_unchecked(uint8(1), uint8(3));
        assert(ret_836_0 == expect_836_0);
    }

    function __testCase871__(Overflow08 __this__) internal {
        int8 expect_871_0 = (int8(-2));
        int8 ret_871_0 = __this__.sub_i8(int8(1), int8(3));
        assert(ret_871_0 == expect_871_0);
    }

    function __testCase906__(Overflow08 __this__) internal {
        try __this__.sub_i8(int8(-2), int8(127)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase947__(Overflow08 __this__) internal {
        int8 expect_947_0 = (int8(127));
        int8 ret_947_0 = __this__.sub_i8_unchecked(int8(-2), int8(127));
        assert(ret_947_0 == expect_947_0);
    }

    function __testCase982__(Overflow08 __this__) internal {
        try __this__.sub_i8(int8(0), int8(-128)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1023__(Overflow08 __this__) internal {
        int8 expect_1023_0 = (int8(-128));
        int8 ret_1023_0 = __this__.sub_i8_unchecked(int8(0), int8(-128));
        assert(ret_1023_0 == expect_1023_0);
    }

    function __testCase1058__(Overflow08 __this__) internal {
        uint8 expect_1058_0 = (uint8(0));
        uint8 ret_1058_0 = __this__.mul_u8_unchecked(uint8(2), uint8(128));
        assert(ret_1058_0 == expect_1058_0);
    }

    function __testCase1093__(Overflow08 __this__) internal {
        uint8 expect_1093_0 = (uint8(254));
        uint8 ret_1093_0 = __this__.mul_u8(uint8(2), uint8(127));
        assert(ret_1093_0 == expect_1093_0);
    }

    function __testCase1128__(Overflow08 __this__) internal {
        try __this__.mul_u8(uint8(2), uint8(128)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1169__(Overflow08 __this__) internal {
        int8 expect_1169_0 = (int8(-128));
        int8 ret_1169_0 = __this__.mul_i8_unchecked(int8(2), int8(64));
        assert(ret_1169_0 == expect_1169_0);
    }

    function __testCase1204__(Overflow08 __this__) internal {
        try __this__.mul_i8(int8(2), int8(64)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1245__(Overflow08 __this__) internal {
        int8 expect_1245_0 = (int8(126));
        int8 ret_1245_0 = __this__.mul_i8_unchecked(int8(-2), int8(65));
        assert(ret_1245_0 == expect_1245_0);
    }

    function __testCase1280__(Overflow08 __this__) internal {
        try __this__.mul_i8(int8(-2), int8(65)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1321__(Overflow08 __this__) internal {
        try __this__.div_i8(int8(-128), int8(-1)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1362__(Overflow08 __this__) internal {
        int8 expect_1362_0 = (int8(-128));
        int8 ret_1362_0 = __this__.div_i8_unchecked(int8(-128), int8(-1));
        assert(ret_1362_0 == expect_1362_0);
    }

    function __testCase1394__(Overflow08 __this__) internal {
        int8 expect_1394_0 = (int8(-128));
        int8 ret_1394_0 = __this__.neg_i8_unchecked(int8(-128));
        assert(ret_1394_0 == expect_1394_0);
    }

    function __testCase1426__(Overflow08 __this__) internal {
        int8 expect_1426_0 = (int8(127));
        int8 ret_1426_0 = __this__.neg_i8(int8(-127));
        assert(ret_1426_0 == expect_1426_0);
    }

    function __testCase1458__(Overflow08 __this__) internal {
        int8 expect_1458_0 = (int8(127));
        int8 ret_1458_0 = __this__.neg_i8(int8(-127));
        assert(ret_1458_0 == expect_1458_0);
    }

    function __testCase1490__(Overflow08 __this__) internal {
        int8 expect_1490_0 = (int8(-127));
        int8 ret_1490_0 = __this__.neg_i8(int8(127));
        assert(ret_1490_0 == expect_1490_0);
    }

    function __testCase1522__(Overflow08 __this__) internal {
        try __this__.neg_i8(int8(-128)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1563__(Overflow08 __this__) internal {
        int8 expect_1563_0 = (int8(-128));
        int8 ret_1563_0 = __this__.exp_i8_unchecked(int8(2), uint8(7));
        assert(ret_1563_0 == expect_1563_0);
    }

    function __testCase1598__(Overflow08 __this__) internal {
        int8 expect_1598_0 = (int8(0));
        int8 ret_1598_0 = __this__.exp_i8_unchecked(int8(2), uint8(8));
        assert(ret_1598_0 == expect_1598_0);
    }

    function __testCase1633__(Overflow08 __this__) internal {
        try __this__.exp_i8(int8(2), uint8(7)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1674__(Overflow08 __this__) internal {
        int8 expect_1674_0 = (int8(-128));
        int8 ret_1674_0 = __this__.exp_i8(int8(-2), uint8(7));
        assert(ret_1674_0 == expect_1674_0);
    }

    function __testCase1709__(Overflow08 __this__) internal {
        int8 expect_1709_0 = (int8(13));
        int8 ret_1709_0 = __this__.exp_i8_unchecked(int8(-3), uint8(5));
        assert(ret_1709_0 == expect_1709_0);
    }

    function __testCase1744__(Overflow08 __this__) internal {
        try __this__.exp_i8(int8(-3), uint8(5)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1782__(Overflow08 __this__) internal {
        int8 expect_1782_0 = (int8(127));
        int8 ret_1782_0 = __this__.inc_i8_unchecked(int8(127));
        assert(ret_1782_0 == expect_1782_0);
    }

    function __testCase1814__(Overflow08 __this__) internal {
        int8 expect_1814_0 = (int8(126));
        int8 ret_1814_0 = __this__.inc_i8(int8(126));
        assert(ret_1814_0 == expect_1814_0);
    }

    function __testCase1846__(Overflow08 __this__) internal {
        try __this__.inc_i8(int8(127)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1884__(Overflow08 __this__) internal {
        int8 expect_1884_0 = (int8(127));
        int8 ret_1884_0 = __this__.dec_i8_unchecked(int8(-128));
        assert(ret_1884_0 == expect_1884_0);
    }

    function __testCase1916__(Overflow08 __this__) internal {
        int8 expect_1916_0 = (int8(-128));
        int8 ret_1916_0 = __this__.dec_i8(int8(-127));
        assert(ret_1916_0 == expect_1916_0);
    }

    function __testCase1948__(Overflow08 __this__) internal {
        try __this__.dec_i8(int8(-128)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase1989__(Overflow08 __this__) internal {
        try __this__.comp_assign_add(int8(127), int8(1)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase2030__(Overflow08 __this__) internal {
        try __this__.comp_assign_sub(int8(-127), int8(2)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase2071__(Overflow08 __this__) internal {
        try __this__.comp_assign_mul(int8(65), int8(2)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase2112__(Overflow08 __this__) internal {
        try __this__.comp_assign_div(int8(-128), int8(-1)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function __testCase2160__(ModifierArgArithmetic __this2__) internal {
        __this2__.foo(int8(126));
    }

    function __testCase2183__(ModifierArgArithmetic __this2__) internal {
        try __this2__.foo(int8(127)) {
            assert(false);
        } catch Error(string memory reason) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
