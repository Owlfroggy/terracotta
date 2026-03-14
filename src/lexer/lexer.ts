import { Token, TokenType } from "./token.ts";

type Pattern = () => Token | null;

export class Lexer {
    tokens: Token[] = [];
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

    public tokenize(): Token[] {
        let tokens: Token[] = [];

        // every pattern will be tested in order of top to bottom.
        // the parser will move on after the first pattern succeeds, 
        // using the returned token's end index as the new start index.
        // if no patterns succeed then you need to fix that :(
        const patterns = [
            this.makeRegexPattern(TokenType.WHITESPACE      , /\s+/y),
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL , /(?:\d+(?:_?\d+)?)\.?(?:\d+(?:_?\d+)?)?/y),
            this.makeRegexPattern(TokenType.PLUS            , /\+/y),
            this.makeRegexPattern(TokenType.MINUS           , /\-/y),
            this.makeRegexPattern(TokenType.SEMICOLON       , /\;/y),
        ];

        while (this.position < this.script.length) {
            for (const pattern of patterns) {
                let result = pattern();
                // patterns return null if they don't match
                if (result == null) continue;

                this.position = result.endPos;

                // don't add whitespace tokens if we're not supposed to
                if (result.type == TokenType.WHITESPACE && !this.options.includeWhitespaceTokens) {
                    break;
                }

                tokens.push(result);
                break;
            }
        }

        // add EOF token
        tokens.push(new Token(this.script.length,this.script.length, TokenType.EOF, ""));

        return tokens
    }
}

