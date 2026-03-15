import { BinaryExpression, Expression, AtomicExpression } from "./ast/expression.ts";
import { Lexer } from "./lexer/lexer.ts";
import { Parser } from "./parser/parser.ts";

// thanks chatgpt
let test = `(5 + dingus) * 2 * 3;`

// ast visualizer
function recurse(e: Expression): string {
    if (e instanceof AtomicExpression) {
        return e.token.value;
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
    }
    return "";
}

const lexer = new Lexer(test,{ // 27
    includeWhitespaceTokens: false
});

lexer.tokenize()

const parser = new Parser(lexer.tokens);
let expr = parser.parseExpression(0) as Expression;
console.log(expr);
console.log(recurse(expr));