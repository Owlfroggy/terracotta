export enum ErrorType {
    LEXER,
    PARSER,
}

export class TCError {
    constructor(
        /** inclusive */
        readonly startPos: number,
        /** exclusive */
        readonly endPos: number,
        readonly type: ErrorType,
        readonly message: string = ""
    ) {}
}