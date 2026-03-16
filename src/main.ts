import { BinaryExpression, Expression, AtomicExpression, GroupExpression } from "./ast/expression.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";

// thanks chatgpt
let test = `(dingus + 2) * 3`

// ast visualizer
function recurse(e: Expression): string {
    if (e instanceof AtomicExpression) {
        return e.token.value;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
    }
    return "";
}

function visualizeAST(e: Expression): string {
    let out = recurse(expr);
    if (expr instanceof BinaryExpression) {
        return out.substring(1,out.length-1);
    } else {
        return out;
    }
}

const lexer = new Lexer(test,{ // 27
    includeWhitespaceTokens: false
});

lexer.tokenize()

const parser = new Parser(lexer.tokens);
let expr = parser.parseExpression(0) as Expression;
console.log(expr);
console.log(visualizeAST(expr));