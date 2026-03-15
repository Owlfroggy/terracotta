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