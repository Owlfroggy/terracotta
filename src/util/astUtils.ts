import { AtomicExpression, CallExpression, Expression } from "../ast/expression.ts";
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