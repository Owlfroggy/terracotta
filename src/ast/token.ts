import { Expression } from "./expression.ts";

export enum TokenType {
    EOF,
    MISSING,
    SEMICOLON,
    WHITESPACE,

    IDENTIFIER,
    NUMERIC_LITERAL,

    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,

    COMMA,
    DOT,

    PLUS,
    MINUS,
    STAR,
    SLASH
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