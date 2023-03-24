import * as ir from "maru-ir2";

const preambleStr = `
var _exception_code_: u256 = 0_u256

var _exception_bytes_: ArrWithLen<#exception; u8> *#exception = {
    arr: [],
    len: 0_u256
}

var _panic_signature: ArrWithLen<#exception; u8> *#exception = {
    arr: [80_u8, 97_u8, 110_u8, 105_u8, 99_u8, 40_u8, 117_u8, 105_u8, 110_u8, 116_u8, 50_u8, 53_u8, 54_u8, 41_u8],
    len: 14_u256
}

var _uint256_str_: ArrWithLen<#exception; u8> *#exception = {
    arr: [117_u8, 105_u8, 110_u8, 116_u8, 50_u8, 53_u8, 54_u8],
    len: 7_u256
}

var _balances_ : map(u160, u256) *#storage = { }

struct Block {
    number: u256;
}

struct Message {
    sender: u160;
    sig: u32;
    data: ArrWithLen<#memory; u8> *#memory;
    value: u256;
}

struct ArrWithLen<M; T> {
    len: u256;
    arr: T[] *M;
}

fun builtin_setExceptionCode(code: u256) {
    entry:
        _exception_code_ := code;
        return;
}

fun builtin_getExceptionCode(): u256 {
    entry:
        return _exception_code_;
}

fun builtin_setExceptionBytes(bytes: ArrWithLen<#exception; u8> *#exception) {
    entry:
        _exception_bytes_ := bytes;
        return;
}

fun builtin_getExceptionBytes(): ArrWithLen<#exception; u8> *#exception {
    entry:
        return _exception_bytes_;
}

fun copy_u8arr<S, D>(src: ArrWithLen<S; u8> *S): ArrWithLen<D; u8> *D
locals
    i: u256,
    len: u256,
    arr: u8[] *S,
    arr1: u8[] *D,
    t: u8,
    res: ArrWithLen<D; u8> *D;
{
    entry:
        i := 0_u256;
        load src.len in len;
        load src.arr in arr;

        res := alloc ArrWithLen<D; u8> in D;
        arr1 := alloc u8[len] in D;

        store arr1 in res.arr;
        store len in res.len;


        jump header;

    header:
        branch i < len body exit;

    body:
        load arr[i] in t;
        store t in arr1[i];
        i := i + 1_u256;
        jump header;

    exit:
        return res;
}

fun sol_assert(cond: bool) 
{
    entry:
        branch cond exit fail;

    fail:
        call sol_panic(1_u256);
        abort;

    exit:
        return;
}

fun sol_panic(code: u256): never
locals 
    panicBytes: ArrWithLen<#memory; u8> *#memory,
    panicBytesInExc: ArrWithLen<#exception; u8> *#exception;
{
    entry:
        panicBytes := call builtin_abi_encodeWithSignature_1<#exception; u256>(_panic_signature, _uint256_str_, code);
        panicBytesInExc := call copy_u8arr<#memory, #exception>(panicBytes);
        call builtin_setExceptionBytes(panicBytesInExc);
        abort;
}

fun sol_arr_read<M; ElT>(arr: ArrWithLen<M; ElT> *M, idx: u256): ElT 
locals
    len: u256,
    arrPtr: ElT[] *M,
    res: ElT;
{
    entry:
        branch idx < 0_u256 fail BB0;

    BB0:
        load arr.len in len;
        branch idx >= len fail ret;

    ret:
        load arr.arr in arrPtr;
        load arrPtr[idx] in res;
        return res;

    fail:
        call sol_panic(0x32_u256);
}

fun sol_arr_write<M; ElT>(arr: ArrWithLen<M; ElT> *M, idx: u256, val: ElT)
locals
    len: u256,
    arrPtr: ElT[] *M;
{
    entry:
        branch idx < 0_u256 fail BB0;

    BB0:
        load arr.len in len;
        branch idx >= len fail ret;

    ret:
        load arr.arr in arrPtr;
        store val in arrPtr[idx];
        return ;

    fail:
        call sol_panic(0x32_u256);
}

fun sol_revert(): never
locals 
    panicBytes: ArrWithLen<#exception; u8> *#exception,
    panicBytesArr: u8[] *#exception;
{
    entry:
        panicBytes := alloc ArrWithLen<#exception; u8> in #exception;
        panicBytesArr := alloc u8[0_u256] in #exception;
        store panicBytesArr in panicBytes.arr;
        store 0_u256 in panicBytes.len;
        call builtin_setExceptionBytes(panicBytes);
        abort;
}

fun sol_revert_08<M>(bytes: ArrWithLen<M; u8> *M): never 
locals 
    panicBytes: ArrWithLen<#exception; u8> *#exception;
{
    entry:
        panicBytes := call copy_u8arr<M, #exception>(bytes);
        call builtin_setExceptionBytes(panicBytes);
        abort;
}

fun sol_require(cond: bool)
{
    entry:
        branch cond exit fail;

    fail:
        call sol_revert();

    exit:
        return;
}

fun sol_require_msg<M>(cond: bool, message: ArrWithLen<M; u8> *M)
{
    entry:
        branch cond exit fail;

    fail:
        call sol_revert_08<M>(message);

    exit:
        return;
}

fun new_array<M; T>(size: u256): ArrWithLen<M; T> *M
locals
    arrPtr: T[] *M,
    resPtr: ArrWithLen<M; T> *M;
{
    entry:
        arrPtr := alloc T[size] in M;
        resPtr := alloc ArrWithLen<M; T> in M;
        store arrPtr in resPtr.arr;
        store size in resPtr.len;

        return resPtr;
}

fun sol_arr_eq<M1, M2; T>(arr1: ArrWithLen<M1; T> *M1, arr2: ArrWithLen<M2; T> *M2): bool 
locals
    len1: u256,
    len2: u256,
    i: u256,
    el1: T,
    el2: T;
{
    entry:
        i := 0_u256;
        load arr1.len in len1;
        load arr2.len in len2;
        branch len1 == len2 header different;

    header:
        branch i < len1 body equal;

    body:
        el1 := call sol_arr_read<M1; T>(arr1, i);
        el2 := call sol_arr_read<M2; T>(arr2, i);
        i := i + 1_u256;
        branch el1 == el2 header different;

    equal:
        return true;

    different:
        return false;
}

fun builtin_abi_encode_1<;T1>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encode_2<;T1, T2>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encode_3<;T1, T2, T3>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3: T3
): ArrWithLen<#memory; u8> *#memory

fun builtin_abi_encodePacked_1<;T1>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodePacked_2<;T1, T2>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodePacked_3<;T1, T2, T3>(
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3: T3
): ArrWithLen<#memory; u8> *#memory

fun builtin_abi_encodeWithSignature_0<SigM>(
    sig: ArrWithLen<SigM; u8> *SigM
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodeWithSignature_1<SigM; T1>(
    sig: ArrWithLen<SigM; u8> *SigM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodeWithSignature_2<SigM; T1, T2>(
    sig: ArrWithLen<SigM; u8> *SigM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodeWithSignature_3<SigM; T1, T2, T3>(
    sig: ArrWithLen<SigM; u8> *SigM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3: T3
): ArrWithLen<#memory; u8> *#memory
fun builtin_abi_encodeWithSignature_4<SigM; T1, T2, T3, T4>(
    sig: ArrWithLen<SigM; u8> *SigM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg1: T1,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2: T2,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3: T3,
    arg4AbiT: ArrWithLen<#exception; u8> *#exception,
    arg4: T4
): ArrWithLen<#memory; u8> *#memory

fun builtin_abi_decode_1<DataM; T1>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception
): T1

fun builtin_abi_decode_2<DataM; T1, T2>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception
): (T1, T2)

fun builtin_abi_decode_3<DataM; T1, T2, T3>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception
): (T1, T2, T3)

fun builtin_abi_decodeWithHash_1<DataM; T1>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception
): T1

fun builtin_abi_decodeWithHash_2<DataM; T1, T2>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception
): (T1, T2)

fun builtin_abi_decodeWithHash_3<DataM; T1, T2, T3>(
    data: ArrWithLen<DataM; u8> *DataM,
    arg1AbiT: ArrWithLen<#exception; u8> *#exception,
    arg2AbiT: ArrWithLen<#exception; u8> *#exception,
    arg3AbiT: ArrWithLen<#exception; u8> *#exception
): (T1, T2, T3)

fun builtin_add_overflows<;IntT>(x: IntT, y: IntT): bool
fun builtin_sub_overflows<;IntT>(x: IntT, y: IntT): bool
fun builtin_mul_overflows<;IntT>(x: IntT, y: IntT): bool
fun builtin_div_overflows<;IntT>(x: IntT, y: IntT): bool
fun builtin_pow_overflows<;Int1T, Int2T>(x: Int1T, y: Int2T): bool
fun builtin_neg_overflows<;IntT>(x: IntT): bool

fun builtin_register_contract<;T>(ptr: T): u160
fun builtin_is_contract_at<;T>(addr: u160): bool
fun builtin_get_contract_at<;T>(addr: u160): T

fun builtin_send(sender: u160, receiver: u160, amount: u256): bool
fun builtin_transfer(sender: u160, receiver: u160, amount: u256)
locals succeeded: bool;
{
    entry:
        succeeded := call builtin_send(sender, receiver, amount);
        branch succeeded exit fail;

    exit:
        return;

    fail:
        call sol_revert();
}

fun sol_call05(addr: u160, block: Block *#memory, msg: Message *#memory): (bool, ArrWithLen<#memory; u8> *#memory)
locals  res: ArrWithLen<#memory; u8> *#memory,
        success: bool;
{
    entry:
        res, success := trans_call contract_dispatch(addr, block, msg);
        branch success return_bb fail_bb;

    return_bb:
        return (success, res);

    fail_bb:
        res := call copy_u8arr<#exception, #memory>(_exception_bytes_);
        jump return_bb;

}

fun sol_call04(addr: u160, block: Block *#memory, msg: Message *#memory): bool
locals res: ArrWithLen<#memory; u8> *#memory,
       success: bool;
{
    entry:
        res, success := trans_call contract_dispatch(addr, block, msg);
        return success;
}

fun sol_staticcall05<M>(addr: u160, block: Block *#memory, msg: Message *#memory): (bool, ArrWithLen<#memory; u8> *#memory)
locals res: ArrWithLen<#memory; u8> *#memory,
       success: bool;
{
    entry:
        res, success := trans_call contract_dispatch(addr, block, msg);
        branch success return_bb fail_bb;

    return_bb:
        return (success, res);

    fail_bb:
        res := call copy_u8arr<#exception, #memory>(_exception_bytes_);
        jump return_bb;

}

fun sol_staticcall04<M>(addr: u160, block: Block *#memory, msg: Message *#memory): bool
locals res: ArrWithLen<#memory; u8> *#memory,
       success: bool;
{
    entry:
        res, success := trans_call contract_dispatch(addr, block, msg);
        return success;
}

fun builtin_delegatecall05<M>(addr: u160, block: Block *#memory, msg: Message *#memory, data: ArrWithLen<M; u8> *M): (bool, ArrWithLen<#memory; u8> *#memory)
fun builtin_delegatecall04<M>(addr: u160, block: Block *#memory, msg: Message *#memory, data: ArrWithLen<M; u8> *M): bool
fun builtin_callcode04<M>(addr: u160, block: Block *#memory, msg: Message *#memory, data: ArrWithLen<M; u8> *M): bool
fun builtin_balance(addr: u160): u256

fun builtin_keccak256_05(bytes: ArrWithLen<#memory; u8> *#memory): u256
`;

export const preamble = ir.parseProgram(preambleStr);
