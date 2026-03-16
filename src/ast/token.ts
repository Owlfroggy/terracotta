import { Expression } from "./expression.ts";

export enum TokenType {
    EOF,
    SEMICOLON,
    WHITESPACE,

    IDENTIFIER,
    NUMERIC_LITERAL,

    OPEN_PAREN,
    CLOSE_PAREN,

    PLUS,
    MINUS,
    STAR,
    SLASH
}

export enum BindingPower {
    DEFAULT,
    ADD,
    MULT,
    GROUP,
    ATOM,
}

export enum TokenPType {
    /** left denotation */
    EXPR_LED,
    /** null denotation */
    EXPR_NUD,
    NONE,
}

export type TokenProcessingProperites = (
    {
        /** binding power */
        bp: number,
        processType: TokenPType.EXPR_NUD,
        processor: (bp: number) => Expression;
    } |
    {
        /** binding power */
        bp: number,
        processType: TokenPType.EXPR_LED,
        processor: (left: Expression, bp: number) => Expression;
    } |
    {
        processType: TokenPType.NONE,
    }
)

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