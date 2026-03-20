import { ErrorType, TCError } from "../error/error.ts";
import { Token, TokenType } from "../ast/token.ts";

export class Lexer {
    tokens: Token[] = [];
    errors: TCError[] = [];
    position: number = 0;

    constructor(
        public script: string,
        public options: {
            includeWhitespaceTokens: boolean
        }
    ) {}

    makeRegexPattern(tokenType: TokenType, regex: RegExp) {
        return () => {
            regex.lastIndex = this.position;
            let result = regex.exec(this.script);
            if (result == null) return null;
            return new Token(this.position, this.position + result[0].length, tokenType, result[0])
        }
    }

    makeKeywordPattern(tokenType: TokenType, keyword: string) {
        return this.makeRegexPattern(tokenType, new RegExp(`${keyword}(?=[^\\w]|$)`, 'y'));
    }

    makeSymbolPattern(tokenType: TokenType, symbol: string) {
        return this.makeRegexPattern(tokenType, new RegExp(`\\${symbol}`, 'y'));
    }

    public tokenize() {
        this.tokens.length = 0;
        this.errors.length = 0;
        this.position = 0;

        // every pattern will be tested in order of top to bottom.
        // the parser will move on after the first pattern succeeds, 
        // using the returned token's end index as the new start index.
        // if no patterns succeed then you need to fix that :(
        const patterns = [
            this.makeRegexPattern(TokenType.WHITESPACE,         /\s+/y),
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL,    /(?:\d+(?:_?\d+)?)\.?(?:\d+(?:_?\d+)?)?/y),
            this.makeKeywordPattern(TokenType.LAGSLAYER_CANCEL, "lscancel"),
            this.makeKeywordPattern(TokenType.PLAYER_EVENT,     "playerevent"),
            this.makeKeywordPattern(TokenType.ENTITY_EVENT,     "entityevent"),
            this.makeKeywordPattern(TokenType.GAME_EVENT,       "gameevent"),
            this.makeKeywordPattern(TokenType.GLOBAL,           "global"),
            this.makeKeywordPattern(TokenType.SAVED,            "saved"),
            this.makeKeywordPattern(TokenType.LOCAL,            "local"),
            this.makeKeywordPattern(TokenType.LINE,             "line"),
            this.makeRegexPattern(TokenType.IDENTIFIER,         /[A-Za-z_]+[A-Za-z0-9_]*/y),
            this.makeSymbolPattern(TokenType.PLUS,              "+"),
            this.makeSymbolPattern(TokenType.MINUS,             "-"),
            this.makeSymbolPattern(TokenType.STAR,              "*"),
            this.makeSymbolPattern(TokenType.SLASH,             "/"),
            this.makeSymbolPattern(TokenType.SEMICOLON,         ";"),
            this.makeSymbolPattern(TokenType.OPEN_PAREN,        "("),
            this.makeSymbolPattern(TokenType.CLOSE_PAREN,       ")"),
            this.makeSymbolPattern(TokenType.OPEN_BRACKET,      "["),
            this.makeSymbolPattern(TokenType.CLOSE_BRACKET,     "]"),
            this.makeSymbolPattern(TokenType.OPEN_CURLY,        "{"),
            this.makeSymbolPattern(TokenType.CLOSE_CURLY,       "}"),
            this.makeSymbolPattern(TokenType.COMMA,             ","),
            this.makeSymbolPattern(TokenType.DOT,               "."),
        ];

        while (this.position < this.script.length) {
            let result: Token | null = null;
            for (const pattern of patterns) {
                result = pattern();
                // patterns return null if they don't match
                if (result != null) { break; }
            }
            if (result == null) {
                this.errors.push(new TCError(this.position, this.position+1, ErrorType.LEXER, `Invalid character '${this.script[this.position]}'`))
                this.position++;
            } else {
                this.position = result.endPos;

                if (result.type == TokenType.WHITESPACE && !this.options.includeWhitespaceTokens) {
                    // don't add whitespace tokens if we're not supposed to
                } else {
                    this.tokens.push(result);
                }
            }
        }

        // add EOF token
        this.tokens.push(new Token(this.script.length,this.script.length, TokenType.EOF, ""));
    }
}

