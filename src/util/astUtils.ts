import { AtomicExpression, CallExpression, Expression, ListExpression } from "../ast/expression.ts";
import { Token, TokenType } from "../ast/token.ts";
import { REPEAT_ACTIONS } from "../compiler/namespace/builtins.ts";
import { slog } from "../languageServer/languageServer.ts";

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