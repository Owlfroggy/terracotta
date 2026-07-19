import { ASTNode } from "../ast/astNode.ts";
import { Token, TokenType } from "../ast/token.ts";
import { PCode } from "../pcode/pcode.ts";

export enum ErrorType {
    LEXER,
    PARSER,
    TYPE_PROCESSOR,
    COMPILER,
    ITEM_LIBRARY,
}

export enum ErrorPositionMode {
    /** Highlight the entire AST node's range */
    FULL_NODE,
    /** Highlight the character after the AST node */
    AFTER_NODE,
}

export abstract class TCError {
    public shouldDisplay: boolean = true;
    public isWarning: boolean = false;

    /** inclusive */
    abstract getStartPos(): number
    /** exclusive */
    abstract getEndPos(): number
    abstract getScriptContents(): string
    abstract getFilePath(): string

    constructor(
        readonly type: ErrorType,
        readonly message: string = ""
    ) {}
}

export class TCManualError extends TCError {
    constructor(
        private startPos: number,
        private endPos: number,
        private scriptContents: string,
        private filePath: string,
        type: ErrorType,
        message: string,
    ) {super(type, message);}

    getStartPos(): number {
        return this.startPos;
    }

    getEndPos(): number {
        return this.endPos;
    }

    getScriptContents(): string {
        return this.scriptContents;
    }

    getFilePath(): string {
        return this.filePath;
    }
}

export class TCNodeError extends TCError {
    constructor(
        private astNode: ASTNode,
        type: ErrorType,
        message: string,
        public positionMode: ErrorPositionMode = ErrorPositionMode.FULL_NODE,
    ) {
        super(type, message);
    }

    getStartPos(): number {
        if (this.positionMode == ErrorPositionMode.AFTER_NODE) 
            return this.astNode.endPos;
        return this.astNode.startPos;
    }

    getEndPos(): number {
        if (this.positionMode == ErrorPositionMode.AFTER_NODE) 
            return this.astNode.endPos+1;
        return this.astNode.endPos;
    }

    getScriptContents(): string {
        return this.astNode.getRoot().scriptContents;
    }

    getFilePath(): string {
        return this.astNode.getRoot().filePath ?? "unknown file";
    }
}

export class TCNodePCodeError extends TCError {
    constructor(
        private astNode: ASTNode,
        private pcodeError: PCodeError,
        type: ErrorType,
    ) {
        super(type, pcodeError.message);
    }

    getOffset(): number {
        if (this.astNode instanceof Token) {
            switch (this.astNode.type) {
                case TokenType.NUMEXPR_LITERAL: return 2;
                case TokenType.STYLED_LITERAL: return 2;
                case TokenType.STRING_LITERAL: return 1;
            }
        }
        return 0;
    }

    getStartPos(): number {
        return this.astNode.startPos + this.pcodeError.startPos + this.getOffset();
    }

    getEndPos(): number {
        return this.astNode.startPos + this.pcodeError.endPos + this.getOffset();
    }

    getScriptContents(): string {
        return this.astNode.getRoot().scriptContents;
    }

    getFilePath(): string {
        return this.astNode.getRoot().filePath ?? "unknown file";
    }
}

export class TCStandaloneError extends TCError {
    constructor(
        type: ErrorType,
        message: string,
    ) {
        super(type, message);
    }

    getStartPos() { return -1; }

    getEndPos() { return -1; }

    getScriptContents() { return ""; }

    getFilePath() { return ""; }
}

export class PCodeError {
    constructor(
        /** inclusive, relative to the start of the expression */
        readonly startPos: number,
        /** exclusive, relative to the start of the expression */
        readonly endPos: number,
        readonly message: string = "",
    ) {}
}