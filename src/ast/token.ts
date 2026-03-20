export enum TokenType {
    EOF,
    MISSING,
    SEMICOLON,
    WHITESPACE,

    COMMENT,

    IDENTIFIER,
    NUMERIC_LITERAL,
    STRING_LITERAL,

    LAGSLAYER_CANCEL,
    PLAYER_EVENT,
    GAME_EVENT,
    ENTITY_EVENT,

    GLOBAL,
    SAVED,
    LOCAL,
    LINE,

    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,
    OPEN_CURLY,
    CLOSE_CURLY,

    COMMA,
    DOT,

    PLUS,
    MINUS,
    STAR,
    SLASH,
}

export enum BindingPower {
    DEFAULT,
    ADD,
    MULT,
    CALL,
    ACCESS,
    GROUP,
    ATOM,
}

export type StringExtraData = {
    quoteChar: string,
    isClosed: boolean,
};

export class Token {
    constructor(
        /** inclusive */
        readonly startPos: number,
        /** exclusive */
        readonly endPos: number,
        readonly type: TokenType,
        readonly value: string = "",
        readonly extraData: StringExtraData | null = null,
    ) {}
    
    toString() {
        return `{${TokenType[this.type]} '${this.value}' [${this.startPos}-${this.endPos}]}`
    }

    getStringExtraData(): StringExtraData {
        if (this.type != TokenType.STRING_LITERAL) {
            throw new Error("Attempted to get string metadata on a token that wasn't a string literal");
        }
        return this.extraData as StringExtraData;
    }
    
    static missing(pos: number): Token {
        return new Token(pos, pos, TokenType.MISSING, "⊘");
    }
}