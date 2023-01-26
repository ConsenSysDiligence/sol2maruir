contract ReturnStorageRef {
	uint[] a;

	function getA1() internal returns (uint[] storage) {
		return a;
	}
	
	function getA2() internal returns (uint[] storage x) {
		return a;
	}

	function getA3() internal returns (uint[] storage x) {
		x=a;
	}

	function main() public {
		a = [1,2];
		
		uint[] storage x = getA1();
		x[0] = 42;
		assert(a[0] == 42 && a[1] == 2);
		
		uint[] storage y = getA2();
		assert(y[0] == 42 && y[1] == 2);
		y[0] = 43;
		assert(a[0] == 43 && x[0] == 43 && y[0] == 43);
		
        uint[] storage z = getA2();
		assert(z[0] == 43 && z[1] == 2);
		z[0] = 44;
		assert(a[0] == 44 && x[0] == 44 && y[0] == 44 && z[0] == 44);

	}
}