export enum TokenType {
    EOF,
    MISSING,
    SEMICOLON,
    WHITESPACE,

    IDENTIFIER,
    NUMERIC_LITERAL,

    LAGSLAYER_CANCEL,
    PLAYER_EVENT,
    GAME_EVENT,
    ENTITY_EVENT,

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


export class Token {
    constructor(
        /** inclusive */
        readonly startPos: number,
        /** exclusive */
        readonly endPos: number,
        readonly type: TokenType,
        readonly value: string = "",
    ) {}
    
    toString() {
        return `{${TokenType[this.type]} '${this.value}' [${this.startPos}-${this.endPos}]}`
    }
    
    static missing(pos: number): Token {
        return new Token(pos, pos, TokenType.MISSING, "⊘");
    }
}