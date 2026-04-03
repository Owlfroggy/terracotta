import { Token, TokenType } from "../ast/token.ts";
import { actions, DFCodeblockName } from "../df/actiondump.ts";
import { Type } from "../typeProcessor/type.ts";
import { ActionBlock, CodeBlock } from "./codeBlock.ts";
import { EvaluationContext } from "./codeCompiler.ts";
import { ActionTagValue, CodeValue, MissingValue, TangibleValue } from "./codeValue.ts";

type OperationHandler = (left: TangibleValue, right: TangibleValue, ctx: EvaluationContext) => [TangibleValue, CodeBlock[]];

type OperationDefinition = {
    resultType: Type,
    handler: OperationHandler,
}


export const INCREMENTOR_OPERATIONS: Map<TokenType, TokenType> = new Map([
    [TokenType.PLUS_EQUALS, TokenType.PLUS],
    [TokenType.MINUS_EQUALS, TokenType.MINUS],
    [TokenType.STAR_EQUALS, TokenType.STAR],
    [TokenType.SLASH_EQUALS, TokenType.SLASH],
    [TokenType.PERCENT_EQUALS, TokenType.PERCENT],
    [TokenType.POW_EQUALS, TokenType.POW],
    [TokenType.POW_EQUALS, TokenType.POW],

    [TokenType.BW_OR_EQUALS, TokenType.BW_OR],
    [TokenType.PBW_OR_EQUALS, TokenType.PBW_OR],
    [TokenType.BW_AND_EQUALS, TokenType.BW_AND],
    [TokenType.PBW_AND_EQUALS, TokenType.PBW_AND],
    [TokenType.BW_XOR_EQUALS, TokenType.BW_XOR],
    [TokenType.PBW_XOR_EQUALS, TokenType.PBW_XOR],
    [TokenType.BW_LSHIFT_EQUALS, TokenType.BW_LSHIFT],
    [TokenType.PBW_LSHIFT_EQUALS, TokenType.PBW_LSHIFT],
    [TokenType.BW_RSHIFT_EQUALS, TokenType.BW_RSHIFT],
    [TokenType.PBW_RSHIFT_EQUALS, TokenType.PBW_RSHIFT],
    [TokenType.BW_URSHIFT_EQUALS, TokenType.BW_URSHIFT],
    [TokenType.PBW_URSHIFT_EQUALS, TokenType.PBW_URSHIFT],
]);  

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
        let opType = INCREMENTOR_OPERATIONS.has(op.type) ? INCREMENTOR_OPERATIONS.get(op.type)! : op.type;
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
        let def = this.binaryOperations.get(leftType)?.get(opType)?.get(rightType);

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

    static isAssignmentOperator(op: TokenType): boolean {
        if (op == TokenType.EQUALS) return true;
        return INCREMENTOR_OPERATIONS.has(op);
    }
}

//=----------------------=\\
//=- handler generators -=\\
//=----------------------=\\

function singleActionHandler(resultType: Type, action: string, tags: ActionTagValue[] = [], codeblock: DFCodeblockName = DFCodeblockName.SET_VARIABLE): OperationHandler {
    return (left, right, ctx) => {
        let v = ctx.tvp.newTempVar(resultType);
        let block = new ActionBlock(codeblock,{
            action: action,
            args: [v, left, right],
            tags: tags,
        });
        return [v, [block]];
    }
}

//=-------------------------=\\
//=- operation definitions -=\\
//=-------------------------=\\

//=- num -=\\

Operations.registerBinary(Type.num, TokenType.PLUS, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "+"));

Operations.registerBinary(Type.num, TokenType.MINUS, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "-"));

Operations.registerBinary(Type.num, TokenType.STAR, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "x"));

Operations.registerBinary(Type.num, TokenType.SLASH, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "/"));

Operations.registerBinary(Type.num, TokenType.PERCENT, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "%"));

Operations.registerBinary(Type.num, TokenType.POW, Type.num, Type.num, false, 
    singleActionHandler(Type.num, "Exponent"));


let bwTagDef = actions.get(DFCodeblockName.SET_VARIABLE)?.Bitwise?.tags.Operator!;
let preciseTag = new ActionTagValue(actions.get(DFCodeblockName.SET_VARIABLE)?.Bitwise?.tags["Bit Precision"]!, "64-bit")
for (const [tokenTypes, tagOption] of [
    [[TokenType.BW_OR,       TokenType.PBW_OR,     ], "|"],
    [[TokenType.BW_AND,      TokenType.PBW_AND,    ], "&"],
    [[TokenType.BW_XOR,      TokenType.PBW_XOR,    ], "^"],
    [[TokenType.BW_LSHIFT,   TokenType.PBW_LSHIFT, ], "<<"],
    [[TokenType.BW_RSHIFT,   TokenType.PBW_RSHIFT, ], ">>"],
    [[TokenType.BW_URSHIFT,  TokenType.PBW_URSHIFT,], ">>>"],
] as [[TokenType, TokenType], string][]) {
    let opTag = new ActionTagValue(bwTagDef, tagOption);
    // normal operation
    Operations.registerBinary(Type.num, tokenTypes[0], Type.num, Type.num, false, 
        singleActionHandler(Type.num, "Bitwise", [opTag]));
    // precise operation
    Operations.registerBinary(Type.num, tokenTypes[1], Type.num, Type.num, false, 
        singleActionHandler(Type.num, "Bitwise", [opTag, preciseTag]));
}

//=- str -=\\

Operations.registerBinary(Type.str, TokenType.PLUS, Type.num, Type.str, true, 
    singleActionHandler(Type.str, "String"));

Operations.registerBinary(Type.str, TokenType.PLUS, Type.str, Type.str, true, 
    singleActionHandler(Type.str, "String"));


// Operations.registerBinary(Type.txt, TokenType.PLUS, Type.any, Type.txt, true);