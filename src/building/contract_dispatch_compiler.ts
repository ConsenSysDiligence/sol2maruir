import * as sol from "solc-typed-ast";
import * as ir from "maru-ir2";
import { BaseFunctionCompiler } from "./base_function_compiler";
import { blockPtrT, msgPtrT, transpileType, u160, u256, u32, u8ArrMemPtr } from "./typing";
import { BasicBlock, boolT, noSrc } from "maru-ir2";
import {
    getContractDispatchName,
    getDesugaredFunName,
    getDesugaredGetterName,
    getMsgBuilderName,
    getMsgDecoderName
} from "./resolving";
import { IRFactory } from "./factory";
import { getContractCallables, isExternallyCallable, UIDGenerator } from "../utils";

export class ContractDispatchCompiler extends BaseFunctionCompiler {
    constructor(
        factory: IRFactory,
        private readonly contract: sol.ContractDefinition,
        globalScope: ir.Scope,
        globalUid: UIDGenerator,
        solVersion: string,
        abiVersion: sol.ABIEncoderVersion,
        private readonly irContract: ir.StructDefinition
    ) {
        super(factory, globalUid, globalScope, solVersion, abiVersion);
    }

    private getRecvFallback(): [
        sol.FunctionDefinition | undefined,
        sol.FunctionDefinition | undefined
    ] {
        let recv: sol.FunctionDefinition | undefined;
        let fallback: sol.FunctionDefinition | undefined;

        this.contract.vFunctions.forEach((fn) => {
            if (fn.kind === sol.FunctionKind.Receive) {
                recv = fn;
            }

            if (fn.kind === sol.FunctionKind.Fallback) {
                fallback = fn;
            }
        });

        return [recv, fallback];
    }

    /**
     * Given an IR expression holding the msg.data signature, and a candidate solidity function/public getter
     * emit the disaptch code that:
     *
     * 1. Checks if the msg.data signature matches that of the callee
     * 2. Tries to decode the arguments
     * 3. Calls the callee
     * 4. Re-encodes the results and returns them
     */
    private tryAndCall(
        sigExpr: ir.Identifier,
        dataExpr: ir.Identifier,
        retExpr: ir.Identifier,
        thisExpr: ir.Identifier,
        callee: sol.FunctionDefinition | sol.VariableDeclaration
    ): void {
        const factory = this.cfgBuilder.factory;

        const isCalleeBB = this.cfgBuilder.mkBB(`try_call_${callee.name}_${callee.id}`);
        const nextBB = this.cfgBuilder.mkBB();

        const calleeHash = this.cfgBuilder.infer.signatureHash(callee);
        const irHash = factory.numberLiteral(noSrc, BigInt("0x" + calleeHash), 16, u32);
        const dataLoc = factory.locationOf(dataExpr);

        this.cfgBuilder.branch(
            factory.binaryOperation(noSrc, sigExpr, "==", irHash, boolT),
            isCalleeBB,
            nextBB,
            noSrc
        );

        this.cfgBuilder.curBB = isCalleeBB;

        let solArgTs: sol.TypeNode[];
        let solRetTs: sol.TypeNode[];

        if (callee instanceof sol.FunctionDefinition) {
            solArgTs = callee.vParameters.vParameters.map((param) =>
                this.cfgBuilder.infer.variableDeclarationToTypeNode(param)
            );

            solRetTs = callee.vReturnParameters.vParameters.map((param) =>
                this.cfgBuilder.infer.variableDeclarationToTypeNode(param)
            );
        } else {
            let solRetT: sol.TypeNode;

            [solArgTs, solRetT] = this.cfgBuilder.infer.getterArgsAndReturn(callee);

            solRetTs =
                solRetT instanceof sol.TupleType ? (solRetT.elements as sol.TypeNode[]) : [solRetT];
        }

        const irArgTs = solArgTs.map((solT) => transpileType(solT, factory));
        const irRetTs = solRetTs.map((solT) => transpileType(solT, factory));
        const argTemps = irArgTs.map((argT) => this.cfgBuilder.getTmpId(argT, noSrc));
        const retTemps = irRetTs.map((argT) => this.cfgBuilder.getTmpId(argT, noSrc));
        if (argTemps.length > 0) {
            const msgDecoderFunName = getMsgDecoderName(
                this.contract,
                callee,
                this.cfgBuilder.infer
            );

            this.cfgBuilder.call(
                argTemps,
                factory.funIdentifier(msgDecoderFunName),
                [dataLoc],
                [],
                [dataExpr],
                noSrc
            );
        }

        const calleeName = factory.funIdentifier(
            callee instanceof sol.FunctionDefinition
                ? getDesugaredFunName(callee, this.contract, this.cfgBuilder.infer)
                : getDesugaredGetterName(callee, this.contract, this.cfgBuilder.infer)
        );

        // Call actual method
        this.cfgBuilder.call(
            retTemps,
            calleeName,
            [],
            [],
            [thisExpr, this.cfgBuilder.blockPtr(noSrc), this.cfgBuilder.msgPtr(noSrc), ...argTemps],
            noSrc
        );

        if (retTemps.length > 0) {
            const returnBuilderFunName = getMsgBuilderName(
                this.contract,
                callee,
                this.cfgBuilder.infer,
                false
            );

            this.cfgBuilder.call(
                [retExpr],
                factory.funIdentifier(returnBuilderFunName),
                [],
                [],
                retTemps,
                noSrc
            );
        } else {
            this.cfgBuilder.assign(retExpr, this.cfgBuilder.zeroValue(u8ArrMemPtr, noSrc), noSrc);
        }

        this.cfgBuilder.return([retExpr], noSrc);

        this.cfgBuilder.curBB = nextBB;
    }

    /**
     * Helper method to either emit a call to fallback (optionally passing arguments to it) or abort
     * @param fallback
     * @param data
     */
    private callFallbackOrAbort(
        fallback: sol.FunctionDefinition | undefined,
        data: ir.Expression
    ): void {
        const factory = this.cfgBuilder.factory;

        if (fallback !== undefined) {
            const args: ir.Expression[] = [
                this.cfgBuilder.this(noSrc),
                this.cfgBuilder.blockPtr(noSrc),
                this.cfgBuilder.msgPtr(noSrc)
            ];

            if (fallback.vParameters.vParameters.length === 1) {
                args.push(data);
            }

            const rets: ir.Identifier[] =
                fallback.vReturnParameters.vParameters.length === 1
                    ? [this.cfgBuilder.getTmpId(u8ArrMemPtr, noSrc)]
                    : [];

            const funName = getDesugaredFunName(fallback, this.contract, this.cfgBuilder.infer);
            this.cfgBuilder.call(rets, factory.funIdentifier(funName), [], [], args, noSrc);
            if (rets.length === 1) {
                this.cfgBuilder.return(rets, noSrc);
            } else {
                this.cfgBuilder.return([this.cfgBuilder.zeroValue(u8ArrMemPtr, noSrc)], noSrc);
            }
        } else {
            this.cfgBuilder.abort(noSrc);
        }
    }

    /**
     * Compile the dispatch method for the contract. It follows the logic of the initial switch table in any contract,
     * and is called by any call/staticcall/delegatecall builtin:
     *
     * 1. If msg.data.length == 0 && receive is defined - call to receive
     *
     * 2. If msg.data.length < 4 && fallback is defined - call fallback. Otherwise abort
     *
     * 3. If signature msg.data[0:4] doesn't match any method && fallback is defined - call fallback. Otherwise fail
     *
     * 4. If sig msg.data[0:4] matches method Foo(...), try decode args for Foo(...). If decoding fails, the revert propagates up
     *
     * 5. Call the contract function with the provided args
     */
    compile(): ir.FunctionDefinition {
        // Add this argument
        const factory = this.cfgBuilder.factory;

        this.cfgBuilder.addThis(u160);
        this.cfgBuilder.addIRArg("block", blockPtrT, noSrc);
        this.cfgBuilder.addIRArg("msg", msgPtrT, noSrc);
        const resDecl = this.cfgBuilder.addIRRet("res", u8ArrMemPtr, noSrc);

        const res = factory.identifier(noSrc, resDecl.name, resDecl.type);

        const [recv, fallback] = this.getRecvFallback();
        let nextBB: BasicBlock;

        const thisPtrT = factory.pointerType(
            noSrc,
            factory.userDefinedType(noSrc, this.irContract.name, [], []),
            factory.memConstant(noSrc, "storage")
        );
        const thisPtrDecl = this.cfgBuilder.addIRLocal("thisPtr", thisPtrT, noSrc);
        const thisPtr = factory.identifier(noSrc, thisPtrDecl.name, thisPtrDecl.type);

        this.cfgBuilder.call(
            [thisPtr],
            factory.funIdentifier("builtin_get_contract_at"),
            [],
            [thisPtrT],
            [this.cfgBuilder.this(noSrc)],
            noSrc
        );

        const dataPtr = this.cfgBuilder.loadField(
            this.cfgBuilder.msgPtr(noSrc),
            msgPtrT,
            "data",
            noSrc
        );
        const dataT = factory.typeOf(dataPtr);

        const dataLen = this.cfgBuilder.loadField(dataPtr, dataT, "len", noSrc);
        const dataArrPtr = this.cfgBuilder.loadField(dataPtr, dataT, "arr", noSrc);
        const dataArrPtrT = factory.typeOf(dataArrPtr);

        // 1. If msg.data.length == 0 && receive is defined - call to receive
        if (recv !== undefined) {
            nextBB = this.cfgBuilder.mkBB();
            const callRecv = this.cfgBuilder.mkBB("call_recv");

            this.cfgBuilder.branch(
                factory.binaryOperation(
                    noSrc,
                    dataLen,
                    "==",
                    factory.numberLiteral(noSrc, 0n, 10, u256),
                    boolT
                ),
                callRecv,
                nextBB,
                noSrc
            );

            this.cfgBuilder.curBB = callRecv;

            const funName = getDesugaredFunName(recv, this.contract, this.cfgBuilder.infer);

            this.cfgBuilder.call(
                [],
                factory.funIdentifier(funName),
                [],
                [],
                [
                    this.cfgBuilder.this(noSrc),
                    this.cfgBuilder.blockPtr(noSrc),
                    this.cfgBuilder.msgPtr(noSrc)
                ],
                noSrc
            );

            this.cfgBuilder.curBB = nextBB;
        }

        const lessThan4BB = this.cfgBuilder.mkBB("less_than4_bytes");
        nextBB = this.cfgBuilder.mkBB();

        this.cfgBuilder.branch(
            factory.binaryOperation(
                noSrc,
                dataLen,
                "<",
                factory.numberLiteral(noSrc, 4n, 10, u256),
                boolT
            ),
            lessThan4BB,
            nextBB,
            noSrc
        );

        // 2. If msg.data.length < 4 && fallback is defined - call fallback. Otherwise abort
        this.cfgBuilder.curBB = lessThan4BB;
        this.callFallbackOrAbort(fallback, dataPtr);
        this.cfgBuilder.curBB = nextBB;

        // 3. Check if the selector msg.data[0:4] matches any method or public
        // getter - and if so try calling it.
        // 3.1 Extract selector from msg.data
        const irSig = this.cfgBuilder.getTmpId(u32, noSrc);
        for (let i = 0n; i < 4n; i++) {
            const byte = this.cfgBuilder.loadIndex(
                dataArrPtr,
                dataArrPtrT,
                factory.numberLiteral(noSrc, i, 10, u256),
                noSrc
            );

            this.cfgBuilder.assign(
                irSig,
                factory.binaryOperation(
                    noSrc,
                    irSig,
                    "|",
                    factory.binaryOperation(
                        noSrc,
                        factory.cast(noSrc, u32, byte),
                        "<<",
                        factory.numberLiteral(noSrc, i * 8n, 10, u32),
                        u32
                    ),
                    u32
                ),
                noSrc
            );
        }

        // 3.2 For each callable method/getter in the contract, check if it matches the selector
        for (const callable of getContractCallables(this.contract, this.cfgBuilder.infer)) {
            if (!isExternallyCallable(callable)) {
                continue;
            }

            if (
                callable instanceof sol.FunctionDefinition &&
                callable.kind !== sol.FunctionKind.Function
            ) {
                continue;
            }

            this.tryAndCall(irSig, dataPtr, res, thisPtr, callable);
        }

        // 4. If no match - call fallback if defined. Otherwise abort
        this.callFallbackOrAbort(fallback, dataPtr);

        const name = getContractDispatchName(this.contract);

        return this.finishCompile(noSrc, name);
    }
}
