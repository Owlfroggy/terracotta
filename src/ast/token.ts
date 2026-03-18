import { Expression } from "./expression.ts";

export enum TokenType {
    EOF,
    SEMICOLON,
    WHITESPACE,

    IDENTIFIER,
    NUMERIC_LITERAL,

    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,

    COMMA,

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
}