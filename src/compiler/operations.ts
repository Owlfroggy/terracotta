import { Token, TokenType } from "../ast/token.ts";
import { DFCodeblockName } from "../df/actiondump.ts";
import { Type } from "../typeProcessor/type.ts";
import { ActionBlock, CodeBlock } from "./codeBlock.ts";
import { EvaluationContext } from "./codeCompiler.ts";
import { CodeValue, MissingValue, TangibleValue } from "./codeValue.ts";
import { TempVarProvider } from "./tempVarProvider.ts";

type OperationHandler = (left: TangibleValue, right: TangibleValue, ctx: EvaluationContext) => [TangibleValue, CodeBlock[]];

type OperationDefinition = {
    resultType: Type,
    handler: OperationHandler,
}

export class Operations {
    static binaryOperations: Map<Type,Map<TokenType,Map<Type,OperationDefinition>>> = new Map();

    /**
     * @param bidirectional If true, automatically register `right op left -> result`
     * as well as `left op right -> result` (assuming that left and right are different)
     */
    static registerBinary(
        left: Type, op: TokenType, right: Type, 
        result: Type, 
        commutative: boolean, 
        handler: OperationHandler
    ) {
        for (const [l, r] of ((commutative && left != right) ? [[left, right], [right, left]] : [[left, right]])) {
            let leftMap = this.binaryOperations.get(l);
            if (leftMap == undefined) {
                leftMap = new Map();
                this.binaryOperations.set(l, leftMap);
            };
    
            let opMap = leftMap.get(op);
            if (opMap == undefined) {
                opMap = new Map();
                leftMap.set(op, opMap)
            };
    
            opMap.set(r, {
                resultType: result,
                handler: handler,
            });
        }
    }

    static evaluateBinaryValue(left: CodeValue, op: Token, right: CodeValue, ctx: EvaluationContext): [CodeValue, CodeBlock[]] {
        let opSymbol = op.value;
        // make sure left and right are both tangible
        for (const v of [left, right]) {
            if (!(v instanceof TangibleValue)) {
                if (!(v instanceof MissingValue)) {
                    ctx.reportError(
                        op.startPos, op.endPos, 
                        `Operation '${opSymbol}' cannot be applied to ${v.constructor.name}`
                    );
                }
                return [new MissingValue(op.parent ?? op), []];
            }
        }

        let leftType = left.getType(ctx);
        let rightType = right.getType(ctx);
        let def = this.binaryOperations.get(leftType)?.get(op.type)?.get(rightType);

        if (!def) {
            ctx.reportError(
                op.startPos, op.endPos,
                `Incompatible types, operation '${opSymbol}' is not supported for case: ${leftType.name} ${opSymbol} ${rightType.name}`
            );
            return [new MissingValue(op.parent ?? op), []];
        }

        return def.handler(left as TangibleValue, right as TangibleValue, ctx);
    }

    /** returns Type.unknown if this is not a valid operaton */
    static evaluateBinaryType(left: Type, op: TokenType, right: Type): Type {
        return (
            this.binaryOperations.get(left)?.get(op)?.get(right)?.resultType
            ?? this.binaryOperations.get(left)?.get(op)?.get(Type.any)?.resultType
            ?? this.binaryOperations.get(Type.any)?.get(op)?.get(right)?.resultType
            ?? Type.unknown
        );
    }
}

Operations.registerBinary(Type.num, TokenType.PLUS, Type.num, Type.num, false, 
    (left, right, ctx) => {
        let v = ctx.tvp.newTempVar(Type.num);
        let block = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "+",
            args: [v, left, right],
        });
        return [v, [block]];
    }
);
// Operations.registerBinary(Type.str, TokenType.PLUS, Type.num, Type.str, true);
// Operations.registerBinary(Type.txt, TokenType.PLUS, Type.any, Type.txt, true);