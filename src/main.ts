import { Lexer } from "./lexer/lexer.ts";
import { Parser } from "./parser/parser.ts";

const lexer = new Lexer("6+7+5",{
    includeWhitespaceTokens: false
});

lexer.tokenize()

const parser = new Parser(lexer.tokens);

console.log(
    parser.parseExpression(0)
)