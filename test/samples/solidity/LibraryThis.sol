pragma solidity ^0.6.0;

library GetThis {
    function getThat() internal view returns (address){
        return address(this);
    }
    
    function getThis() public view returns (address) {
        return getThat();
    }
    
    function failingGetThis() public view returns (address) {
        assert(false);
    }
}

contract LibraryThis {    
    function main() public {
        address x = GetThis.getThis();    
        assert(x == address(this));
        
        try GetThis.getThis() returns (address y) {
            assert(y == address(this));
        } catch {
            assert(false);
        }
        
        try GetThis.failingGetThis() returns (address y) {
            assert (false);
        } catch {
            
        }
    }
}