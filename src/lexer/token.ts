export enum TokenType {
    EOF,
    SEMICOLON,
    WHITESPACE,

    NUMERIC_LITERAL,

    PLUS,
    MINUS,
}

export class Token {
    constructor(
        readonly startPos: number,
        readonly endPos: number,
        readonly type: TokenType,
        readonly value: string = "",
    ) {}
    
    toString() {
        return `{${TokenType[this.type]} '${this.value}' [${this.startPos}-${this.endPos}]}`
    }
}