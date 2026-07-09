import { AtomicExpression, BinaryExpression, CallExpression, CallOrStartExpression, Expression, ListExpression } from "../ast/expression.ts";
import { Token, TokenType } from "../ast/token.ts";
import { REPEAT_ACTIONS } from "../compiler/namespace/builtins.ts";

/**
 * Returns true if the expression is a special for loop action call
 */
export function isForLoopActionCall(iteratorExpression: Expression):
    // sins
    iteratorExpression is (CallExpression & {
        callee: AtomicExpression & {
            token: Token & {type: TokenType.IDENTIFIER}
        }
    }) 
{
    if (
        iteratorExpression instanceof CallExpression
        && iteratorExpression.callee instanceof AtomicExpression
        && iteratorExpression.callee.token.type == TokenType.IDENTIFIER
        && iteratorExpression.callee.token.value in REPEAT_ACTIONS
    ) {
        return true
    }
    return false;
}

export function posIndexIsInListElement(list: ListExpression, index: number, element: number): boolean {
    if (list.elementStartPositions.length >= element+2) {
        return list.elementStartPositions[element] <= index && index < list.elementStartPositions[element+1]
    }
    else {
        return list.elementStartPositions[element] <= index && index <= list.endPos;
    }
}

export function binaryIsNamedArgument(binary: BinaryExpression | null, callNode: CallExpression | CallOrStartExpression): 
    binary is BinaryExpression&{
        operator: Token&{
            type: TokenType.EQUALS,
        },
        left: AtomicExpression&{
            token: Token&{
                type: TokenType.STRING_LITERAL | TokenType.IDENTIFIER
            }
        }
    }
{
    return (
        binary != null
        && binary.isChildOf(callNode.args) 
        && binary.operator.type == TokenType.EQUALS 
        && binary.left instanceof AtomicExpression
        && (binary.left.token.type == TokenType.STRING_LITERAL || binary.left.token.type == TokenType.IDENTIFIER)
    )
}

export function getExistingNamedArgs(list: ListExpression) {
    let existingArgs: string[] = [];
    for (const arg of list.elements) {
        if (
            arg instanceof BinaryExpression 
            && arg.operator.type == TokenType.EQUALS 
            && arg.left instanceof AtomicExpression
            && (arg.left.token.type == TokenType.STRING_LITERAL || arg.left.token.type == TokenType.IDENTIFIER)
        ) {
            existingArgs.push(arg.left.token.value);
        }
    }
    return existingArgs;
}