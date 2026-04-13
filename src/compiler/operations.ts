import { Token, TokenType } from "../ast/token.ts";
import { actions } from "../df/actiondump.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { Type } from "../typeProcessor/type.ts";
import { ActionBlock, CodeBlock } from "./codeBlock.ts";
import { EvaluationContext } from "./codeCompiler.ts";
import { ActionTagValue, CodeValue, MissingValue, NumberValue, TangibleValue } from "./codeValue.ts";

type BinaryOperationHandler = (left: TangibleValue, right: TangibleValue, ctx: EvaluationContext) => [TangibleValue, CodeBlock[]];
type BinaryOperationDefinition = {
    resultType: Type,
    handler: BinaryOperationHandler,
}

type UnaryOperationHandler = (val: TangibleValue, ctx: EvaluationContext) => [TangibleValue, CodeBlock[]];
type UnaryOperationDefinition = {
    resultType: Type,
    handler: UnaryOperationHandler,
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
    static binaryOperations: Map<Type,Map<TokenType,Map<Type,BinaryOperationDefinition>>> = new Map();
    static unaryOperations: Map<TokenType, Map<Type, UnaryOperationDefinition>> = new Map();

    //=---------------------=\\
    //=- binary operations -=\\
    //=---------------------=\\

    /**
     * @param bidirectional If true, automatically register `right op left -> result`
     * as well as `left op right -> result` (assuming that left and right are different)
     */
    static registerBinary(
        left: Type, op: TokenType, right: Type, 
        result: Type, 
        commutative: boolean, 
        handler: BinaryOperationHandler
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
                        op.parent ?? op,
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
                op.parent ?? op,
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

    //=--------------------=\\
    //=- unary operations -=\\
    //=--------------------=\\

    /**
     * @param bidirectional If true, automatically register `right op left -> result`
     * as well as `left op right -> result` (assuming that left and right are different)
     */
    static registerUnary(
        op: TokenType, val: Type, 
        result: Type, 
        handler: UnaryOperationHandler
    ) {
        let opMap = this.unaryOperations.get(op);
        if (opMap == undefined) {
            opMap = new Map();
            this.unaryOperations.set(op, opMap)
        };

        opMap.set(val, {
            resultType: result,
            handler: handler,
        });
    }

    static evaluateUnaryValue(op: Token, val: CodeValue, ctx: EvaluationContext): [CodeValue, CodeBlock[]] {
        let opSymbol = op.value;
        let opType = INCREMENTOR_OPERATIONS.has(op.type) ? INCREMENTOR_OPERATIONS.get(op.type)! : op.type;
        // make sure left and right are both tangible
        if (!(val instanceof TangibleValue)) {
            if (!(val instanceof MissingValue)) {
                ctx.reportError(
                    op,
                    `Operation '${opSymbol}' cannot be applied to ${val.constructor.name}`
                );
            }
            return [new MissingValue(op.parent ?? op), []];
        }

        let valType = val.getType(ctx);
        let def = this.unaryOperations.get(opType)?.get(valType);

        if (!def) {
            ctx.reportError(
                op,
                `Incompatible types, operation '${opSymbol}' cannot be applied to type '${valType.name}'`
            );
            return [new MissingValue(op.parent ?? op), []];
        }

        return def.handler(val, ctx);
    }

    /** returns Type.unknown if this is not a valid operaton */
    static evaluateUnaryType(op: TokenType, right: Type): Type {
        return (
            this.unaryOperations.get(op)?.get(right)?.resultType
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

function singleActionHandler(resultType: Type, action: string, tags: ActionTagValue[] = [], codeblock: DFCodeblockName = DFCodeblockName.SET_VARIABLE): BinaryOperationHandler {
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

//=- unary operations -=\\

Operations.registerUnary(TokenType.MINUS, Type.num, Type.num, (val, ctx) => {
    if (val instanceof NumberValue) {
        let valString = val.value;
        if (valString.startsWith("-")) {
            valString = valString.substring(1);
        } else {
            valString = "-" + valString;
        }
        return [new NumberValue(valString, val.astNode?.parent ?? undefined), []];
    } else {
        let v = ctx.tvp.newTempVar(Type.num);
        let block = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "x",
            args: [v, val, new NumberValue("-1")],
        });
        return [v, [block]];
    }
})

// binary ops below this point

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

//=- vec -=\\

Operations.registerBinary(Type.vec, TokenType.PLUS, Type.vec, Type.vec, false, 
    singleActionHandler(Type.vec, "+"));

Operations.registerBinary(Type.vec, TokenType.MINUS, Type.vec, Type.vec, false, 
    singleActionHandler(Type.vec, "-"));

Operations.registerBinary(Type.vec, TokenType.STAR, Type.vec, Type.vec, false, 
    singleActionHandler(Type.vec, "x"));

Operations.registerBinary(Type.vec, TokenType.SLASH, Type.vec, Type.vec, false, 
    singleActionHandler(Type.vec, "/"));

Operations.registerBinary(Type.vec, TokenType.STAR, Type.num, Type.vec, true, 
    singleActionHandler(Type.vec, "MultiplyVector"));

Operations.registerBinary(Type.vec, TokenType.SLASH, Type.num, Type.vec, true, (left, right, ctx) => {
    let numResult = ctx.tvp.newTempVar(Type.num);
    let vecResult = ctx.tvp.newTempVar(Type.vec);

    let num: TangibleValue;
    let vec: TangibleValue;
    if (left.getType(ctx).matches(Type.num)) {
        num = left;
        vec = right;
    } else {
        num = right;
        vec = left;
    }
    // otherwise, do the normal operation. if the user wants precision, they can veccast it themselves
    

    return [vecResult, [
        new ActionBlock(DFCodeblockName.SET_VARIABLE, {
            action: "/",
            args: [numResult, new NumberValue("1"), num]
        }),
        new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "MultiplyVector",
            args: [vecResult, vec, numResult],
        })
    ]];
});


// Operations.registerBinary(Type.txt, TokenType.PLUS, Type.any, Type.txt, true);