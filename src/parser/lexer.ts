import { ErrorType, TCError, TCManualError } from "../error/error.ts";
import { Token, TokenType } from "../ast/token.ts";

export class Lexer {
    tokens: Token[] = [];
    errors: TCError[] = [];
    position: number = 0;
    public script: string;
    private filePath: string;

    constructor(
        public options: {
            includeWhitespaceTokens: boolean,
            includeSingleLineComments: boolean,
        } = {includeSingleLineComments: false, includeWhitespaceTokens: false}
    ) {}

    reportError(startPos: number, endPos: number, message: string) {
        this.errors.push(new TCManualError(
            startPos, endPos,
            this.script,
            this.filePath,
            ErrorType.LEXER,
            message
        ));
    }

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
        return this.makeRegexPattern(tokenType, new RegExp(`\\${symbol.split("").join("\\")}`, 'y'));
    }

    makeStringPattern(qouteChar: string) {
        return () => {
            let regex = new RegExp(`[sn]?${qouteChar}((?:[^${qouteChar}\\\\]|\\\\.)*?)(?:${qouteChar}|\\n|$)`,'y')
            regex.lastIndex = this.position;
            let result = regex.exec(this.script);
            if (result == null) return null;

            let flagChar = this.script[result.index]
            let tokenType = (
                flagChar == "s" ? TokenType.STYLED_LITERAL : 
                flagChar == "n" ? TokenType.NUMEXPR_LITERAL :
                TokenType.STRING_LITERAL
            );

            let startPos = this.position;
            let endPos = this.position + result[0].length;

            // error for unclosed string
            let isClosed = true;
            if (endPos > this.script.length || this.script[endPos-1] != qouteChar) {
                isClosed = false;
                if (endPos < this.script.length) {
                    endPos--;
                }
                this.reportError(
                    startPos,endPos,
                    `Unclosed ${tokenType == TokenType.STYLED_LITERAL ? "styled text" : "string"} literal`
                );
            }

            let stringContents = result[1];

            //=- escape sequences -=\\

            // queue up substitutions instead of applying them immediately so
            // that indexes of error messages don't get messed up by shifting
            let substitutions: [number, number, string][] = [];
            // that then means that we need to manually keep track of which
            // escape sequences have already been parsed to avoid double-handling
            let processedIndexes: Set<number> = new Set();

            let escapeSequence = (
                regex: RegExp, 
                handler: (matchValue: string) => [evaluated: string] | [evaluated: string, error: string]
            ) => {
                let escapeMatches = [...stringContents.matchAll(regex)];
                for (let i = escapeMatches.length-1; i >= 0; i--) {
                    let match = escapeMatches[i];
                    let matchStartPos = match.index;
                    if (processedIndexes.has(matchStartPos)) {
                        continue;
                    } else {
                        processedIndexes.add(matchStartPos);
                    }
                    let matchEndPos = match.index + match[0].length;
                    let [evaluated, error] = handler(match[0]);
                    if (error != undefined) {
                        this.reportError(
                            startPos + matchStartPos + 1, startPos + matchEndPos + 1,
                            error
                        );
                    }
                    substitutions.push([matchStartPos, matchEndPos, evaluated]);
                }
            };

            // \uFFFF
            escapeSequence(/\\u(?:[A-Fa-f0-9]{4})?/g, (matchValue) => {
                if (matchValue.length != 6) {
                    return ['', `'\\u' escape sequence must be followed by four hexadecimal digits`];
                } else {
                    return [String.fromCodePoint(parseInt(matchValue.substring(2),16))];
                }
            })

            // \xFF
            escapeSequence(/\\x(?:[A-Fa-f0-9]{2})?/g, (matchValue) => {
                if (matchValue.length != 4) {
                    return ['', `'\\x' escape sequence must be followed by two hexadecimal digits`];
                } else {
                    return [String.fromCodePoint(parseInt(matchValue.substring(2),16))];
                }
            });

            // basic escape sequences
            escapeSequence(/\\n/g, _ => ["\n"]);
            escapeSequence(/\\'/g, _ => ["\'"]);
            escapeSequence(/\\"/g, _ => ["\""]);

            // (\\ -> \), or errors for invalid escape sequences (final catch-all)
            escapeSequence(/\\./g, (matchValue) => {
                if (matchValue == "\\\\") {
                    return ["\\"];
                } else {
                    return ["",`Invalid escape sequence '${matchValue}'`];
                }
            });

            // apply all the substitutions that have been queued up
            substitutions.sort((a, b) => b[0] - a[0]);
            for (const sub of substitutions) {
                stringContents = stringContents.substring(0,sub[0]) + sub[2] + stringContents.substring(sub[1]);
            }
            
            return new Token(startPos, endPos, tokenType, stringContents, {quoteChar: qouteChar, isClosed: isClosed});
        }
    }

    multiLineCommentPattern = (): Token | null => {
        let regex = /\/\*(?:.|\n)*?\*\//y;
        regex.lastIndex = this.position;
        let result = regex.exec(this.script);
        if (result == null) return null;

        let startPos = result.index;
        let endPos = result.index + result[0].length;

        let contents = (
            // trim out opening /* and closing */
            result[0].substring(2,result[0].length-2)
        );

        return new Token(startPos, endPos, TokenType.MULTILINE_COMMENT,contents);
    }

    public tokenize(script: string, filePath: string) {
        this.script = script;
        this.filePath = filePath;
        this.tokens.length = 0;
        this.errors.length = 0;
        this.position = 0;

        // every pattern will be tested in order of top to bottom.
        // the parser will move on after the first pattern succeeds, 
        // using the returned token's end index as the new start index.
        // if no patterns succeed then you need to fix that :(
        const patterns = [
            this.makeStringPattern('"'),
            this.makeStringPattern("'"),
            this.makeRegexPattern(TokenType.COMMENT,            /\/\/.*?(?=\n|$)/y),
            this.multiLineCommentPattern,
            this.makeRegexPattern(TokenType.WHITESPACE,         /\s+/y),
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL,    /0[xX](?:[a-fA-F0-9]+(?:_?[a-fA-F0-9]+)*)/y), // hex number
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL,    /0[bB](?:[01]+(?:_?[01]+)*)/y), // binary number
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL,    /(?:\d+(?:_?\d+)*)\.?(?:\d+(?:_?\d+)*)?/y), // normal number
            this.makeRegexPattern(TokenType.NUMERIC_LITERAL,    /\.(?:\d+(?:_?\d+)*)/y), // number that starts with a decimal point

            // keywords
            this.makeKeywordPattern(TokenType.LAGSLAYER_CANCEL, "lscancel"),
            this.makeKeywordPattern(TokenType.PLAYER_EVENT,     "playerevent"),
            this.makeKeywordPattern(TokenType.ENTITY_EVENT,     "entityevent"),
            this.makeKeywordPattern(TokenType.GAME_EVENT,       "gameevent"),
            this.makeKeywordPattern(TokenType.FUNCTION,         "function"),
            this.makeKeywordPattern(TokenType.PROCESS,          "process"),
            this.makeKeywordPattern(TokenType.DECLARE,          "declare"),
            
            this.makeKeywordPattern(TokenType.CALL,             "call"),
            this.makeKeywordPattern(TokenType.START,            "start"),

            this.makeKeywordPattern(TokenType.RETURN,           "return"),
            this.makeKeywordPattern(TokenType.BREAK,            "break"),
            this.makeKeywordPattern(TokenType.CONTINUE,         "continue"),
            
            this.makeKeywordPattern(TokenType.GLOBAL,           "global"),
            this.makeKeywordPattern(TokenType.SAVED,            "saved"),
            this.makeKeywordPattern(TokenType.LOCAL,            "local"),
            this.makeKeywordPattern(TokenType.LINE,             "line"),
            
            this.makeKeywordPattern(TokenType.FOR,              "for"),
            this.makeKeywordPattern(TokenType.REPEAT,           "repeat"),
            this.makeKeywordPattern(TokenType.IF,               "if"),
            this.makeKeywordPattern(TokenType.ELSE,             "else"),
            this.makeKeywordPattern(TokenType.WHILE,            "while"),
            this.makeKeywordPattern(TokenType.DO,               "do"),
            
            this.makeKeywordPattern(TokenType.PERSELECTED,      "perselected"),

            this.makeKeywordPattern(TokenType.AS,               "as"),

            this.makeKeywordPattern(TokenType.TO,               "to"),
            this.makeKeywordPattern(TokenType.OF,               "of"),
            
            this.makeKeywordPattern(TokenType.SELECT,           "select"),
            this.makeKeywordPattern(TokenType.FILTER,           "filter"),

            this.makeRegexPattern(TokenType.IDENTIFIER,         /[A-Za-z_]+[A-Za-z0-9_]*/y),
            
            // operations
            this.makeSymbolPattern(TokenType.DOUBLE_EQUALS,     "=="),
            this.makeSymbolPattern(TokenType.BANG_EQUALS,       "!="),

            this.makeSymbolPattern(TokenType.EQUALS,            "="),
            this.makeSymbolPattern(TokenType.POW_EQUALS,        "**="),
            this.makeSymbolPattern(TokenType.PLUS_EQUALS,       "+="),
            this.makeSymbolPattern(TokenType.MINUS_EQUALS,      "-="),
            this.makeSymbolPattern(TokenType.STAR_EQUALS,       "*="),
            this.makeSymbolPattern(TokenType.SLASH_EQUALS,      "/="),
            this.makeSymbolPattern(TokenType.PERCENT_EQUALS,    "%="),
            
            this.makeSymbolPattern(TokenType.POW,               "**"),
            this.makeSymbolPattern(TokenType.PLUS,              "+"),
            this.makeSymbolPattern(TokenType.MINUS,             "-"),
            this.makeSymbolPattern(TokenType.STAR,              "*"),
            this.makeSymbolPattern(TokenType.SLASH,             "/"),
            this.makeSymbolPattern(TokenType.PERCENT,           "%"),

            this.makeSymbolPattern(TokenType.BANG,              "!"),
            this.makeSymbolPattern(TokenType.BOOL_AND,          "&&"),
            this.makeSymbolPattern(TokenType.BOOL_OR,           "||"),

            this.makeSymbolPattern(TokenType.QUESTION,          "?"),

            // bitwise land of doom
            this.makeSymbolPattern(TokenType.PBW_OR_EQUALS,     "^|="),
            this.makeSymbolPattern(TokenType.PBW_AND_EQUALS,    "^&="),
            this.makeSymbolPattern(TokenType.PBW_NOT_EQUALS,    "^~="),
            this.makeSymbolPattern(TokenType.PBW_XOR_EQUALS,    "^^="),
            this.makeSymbolPattern(TokenType.PBW_URSHIFT_EQUALS,"^>>>="),
            this.makeSymbolPattern(TokenType.PBW_LSHIFT_EQUALS, "^<<="),
            this.makeSymbolPattern(TokenType.PBW_RSHIFT_EQUALS, "^>>="),
            this.makeSymbolPattern(TokenType.PBW_OR,            "^|"),
            this.makeSymbolPattern(TokenType.PBW_AND,           "^&"),
            this.makeSymbolPattern(TokenType.PBW_NOT,           "^~"),
            this.makeSymbolPattern(TokenType.PBW_XOR,           "^^"),
            this.makeSymbolPattern(TokenType.PBW_URSHIFT,       "^>>>"),
            this.makeSymbolPattern(TokenType.PBW_LSHIFT,        "^<<"),
            this.makeSymbolPattern(TokenType.PBW_RSHIFT,        "^>>"),

            this.makeSymbolPattern(TokenType.BW_OR_EQUALS,      "|="),
            this.makeSymbolPattern(TokenType.BW_AND_EQUALS,     "&="),
            this.makeSymbolPattern(TokenType.BW_NOT_EQUALS,     "~="),
            this.makeSymbolPattern(TokenType.BW_XOR_EQUALS,     "^="),
            this.makeSymbolPattern(TokenType.BW_URSHIFT_EQUALS, ">>>="),
            this.makeSymbolPattern(TokenType.BW_LSHIFT_EQUALS,  "<<="),
            this.makeSymbolPattern(TokenType.BW_RSHIFT_EQUALS,  ">>="),
            this.makeSymbolPattern(TokenType.BW_OR,             "|"),
            this.makeSymbolPattern(TokenType.BW_AND,            "&"),
            this.makeSymbolPattern(TokenType.BW_NOT,            "~"),
            this.makeSymbolPattern(TokenType.BW_XOR,            "^"),
            this.makeSymbolPattern(TokenType.BW_URSHIFT,        ">>>"),
            this.makeSymbolPattern(TokenType.BW_LSHIFT,         "<<"),
            this.makeSymbolPattern(TokenType.BW_RSHIFT,         ">>"),

            this.makeSymbolPattern(TokenType.LESS_EQUALS,       "<="),
            this.makeSymbolPattern(TokenType.LESS,              "<"),
            this.makeSymbolPattern(TokenType.GREATER_EQUALS,    ">="),
            this.makeSymbolPattern(TokenType.GREATER,           ">"),


            // brackets
            this.makeSymbolPattern(TokenType.OPEN_PAREN,        "("),
            this.makeSymbolPattern(TokenType.CLOSE_PAREN,       ")"),
            this.makeSymbolPattern(TokenType.OPEN_BRACKET,      "["),
            this.makeSymbolPattern(TokenType.CLOSE_BRACKET,     "]"),
            this.makeSymbolPattern(TokenType.OPEN_CURLY,        "{"),
            this.makeSymbolPattern(TokenType.CLOSE_CURLY,       "}"),

            // other symbols
            this.makeSymbolPattern(TokenType.ELLIPSES,          "..."),
            this.makeSymbolPattern(TokenType.COLON,             ":"),
            this.makeSymbolPattern(TokenType.COMMA,             ","),
            this.makeSymbolPattern(TokenType.DOT,               "."),
            this.makeSymbolPattern(TokenType.SEMICOLON,         ";"),
        ];

        while (this.position < this.script.length) {
            let result: Token | null = null;
            for (const pattern of patterns) {
                result = pattern();
                // patterns return null if they don't match
                if (result != null) { break; }
            }
            if (result == null) {
                this.reportError(
                    this.position, this.position+1, 
                    `Invalid character '${this.script[this.position]}'`
                );
                this.position++;
            } else {
                this.position = result.endPos;

                if (result.type == TokenType.WHITESPACE && !this.options.includeWhitespaceTokens) {
                    // don't add whitespace tokens if we're not supposed to
                } else if (result.type == TokenType.COMMENT && !this.options.includeSingleLineComments) {
                    // don't add single line comments if we're not supposed to
                } else {
                    this.tokens.push(result);
                }
            }
        }

        // add EOF token
        this.tokens.push(new Token(this.script.length,this.script.length, TokenType.EOF, ""));
    }
}

