import { BinaryExpression, Expression, NumberExpression } from "./ast/expression.ts";
import { Lexer } from "./lexer/lexer.ts";
import { Parser } from "./parser/parser.ts";

// thanks chatgpt
let tests = `1 + 12 * 7 - 4 / 2 + 15;2 * 19 - 5 + 11 / 3 - 6;3 + 14 / 7 * 9 - 8 + 10;4 - 16 * 5 + 12 / 6 + 1 - 7;5 + 3 * 18 - 9 / 2 + 14 * 2 - 8;6 / 3 + 17 * 4 - 13 + 7 - 1;7 * 8 - 2 + 15 / 5 + 11 - 9;8 + 6 - 12 * 3 + 14 / 7 - 2 + 19;9 - 13 + 2 * 16 - 8 / 4 + 10 - 5 + 12;10 / 5 + 3 * 11 - 6 + 15 - 7 / 2 + 8 - 1;11 + 2 * 17 - 9 / 3 + 14 - 5 + 6 * 8 - 12;12 * 3 - 7 + 4 / 2 + 16 - 8 + 1 / 1;13 + 9 - 2 * 18 + 6 / 3 - 1 + 7 * 5 - 10;14 - 5 + 12 * 2 / 4 - 8 + 19 - 3 + 11 * 6;15 + 1 * 14 - 9 + 3 / 2 - 7 + 16 * 2 - 4;16 / 4 + 5 * 11 - 3 + 12 - 1 + 9 * 7 - 2;17 + 6 - 8 * 3 + 14 / 7 - 1 + 15 * 4 - 5;18 - 3 + 2 * 19 - 6 / 3 + 7 - 12 + 8 * 1;19 / 1 + 4 * 17 - 2 + 13 - 6 + 5 * 11 - 8;20 + 7 - 1 * 16 + 9 / 3 - 12 + 14 * 2 - 15;1 + 3 * 18 - 5 / 2 + 6 - 7 + 8 * 14 - 9;2 * 17 - 4 + 11 / 5 + 12 - 3 + 13 * 6 - 8;3 + 8 * 12 - 6 / 3 + 9 - 2 + 10 * 5 - 1;4 - 9 + 2 * 19 - 5 / 1 + 7 - 14 + 8 * 3;5 / 1 + 6 * 15 - 2 + 13 - 4 + 7 * 11 - 3;6 + 2 - 3 * 17 + 4 / 2 - 5 + 8 * 12 - 1;7 * 5 - 1 + 6 / 3 + 9 - 2 + 10 * 14 - 8;8 + 4 * 11 - 5 / 1 + 6 - 9 + 12 * 3 - 7;9 - 3 + 2 * 18 - 6 / 2 + 5 - 10 + 7 * 4;10 / 2 + 1 * 16 - 3 + 14 - 5 + 8 * 12 - 6;11 + 2 * 13 - 4 / 1 + 9 - 3 + 7 * 15 - 8;12 * 4 - 5 + 6 / 3 + 8 - 2 + 9 * 11 - 1;13 + 1 - 2 * 17 + 3 / 1 - 5 + 14 * 6 - 7;14 - 2 + 3 * 19 - 6 / 3 + 8 - 12 + 5 * 10;15 / 3 + 7 * 16 - 2 + 11 - 4 + 9 * 13 - 6;16 + 8 - 1 * 14 + 5 / 2 - 9 + 12 * 3 - 7;17 * 2 - 3 + 4 / 1 + 8 - 5 + 9 * 15 - 6;18 + 5 * 12 - 3 / 1 + 7 - 2 + 14 * 4 - 1;19 - 7 + 2 * 11 - 5 / 2 + 8 - 3 + 10 * 6;20 / 4 + 1 * 13 - 2 + 9 - 6 + 5 * 12 - 3;1 + 6 * 14 - 3 / 1 + 7 - 2 + 8 * 19 - 4;2 * 5 - 1 + 6 / 3 + 9 - 3 + 12 * 8 - 7;3 + 7 * 11 - 4 / 2 + 5 - 1 + 14 * 2 - 6;4 - 2 + 3 * 18 - 5 / 1 + 6 - 7 + 12 * 5;5 / 1 + 8 * 13 - 2 + 9 - 4 + 7 * 11 - 3;6 + 3 - 1 * 16 + 4 / 2 - 5 + 12 * 8 - 7;7 * 2 - 5 + 6 / 3 + 9 - 1 + 14 * 3 - 4;8 + 1 * 15 - 2 / 1 + 6 - 7 + 10 * 5 - 3;9 - 3 + 4 * 12 - 5 / 2 + 8 - 2 + 7 * 11;10 / 2 + 1 * 14 - 3 + 6 - 5 + 12 * 9 - 4`
    .split(";");

// ast visualizer
function recurse(e: Expression): string {
    if (e instanceof NumberExpression) {
        return e.token.value;
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
    }
    return "";
}

// test to make sure it works
for (const test of tests) {
    console.log("-> ",test);
    const lexer = new Lexer(test,{ // 27
        includeWhitespaceTokens: false
    });

    lexer.tokenize()

    const parser = new Parser(lexer.tokens);
    let expr = parser.parseExpression(0) as Expression;
    let out = recurse(expr);
    console.log(out);
    if (eval(out) == eval(test)) {
        console.log("yay")
    } else {
        console.log("whoops\n\n\n");
    }
}
// console.log(out.substring(1,out.length-1));