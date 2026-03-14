import { Lexer } from "./lexer/lexer.ts";

const lexer = new Lexer("6 + 7;",{
    includeWhitespaceTokens: false
});

lexer.tokenize()
lexer.tokens.map(v => console.log(""+v));
console.log(lexer.errors);