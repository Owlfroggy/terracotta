export enum ErrorType {
    LEXER,
    PARSER,
}

export class TCError {
    public shouldDisplay: boolean = true;
    constructor(
        /** inclusive */
        readonly startPos: number,
        /** exclusive */
        readonly endPos: number,
        readonly type: ErrorType,
        readonly message: string = ""
    ) {}
}