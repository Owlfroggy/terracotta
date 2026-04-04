import { ASTNode } from "../ast/astNode.ts";

export enum ErrorType {
    LEXER,
    PARSER,
    TYPE_PROCESSOR,
    COMPILER,
}

export abstract class TCError {
    public shouldDisplay: boolean = true;

    /** inclusive */
    abstract getStartPos(): number
    /** exclusive */
    abstract getEndPos(): number
    abstract getScriptContents(): string

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
}

export class TCNodeError extends TCError {
    constructor(
        private astNode: ASTNode,
        type: ErrorType,
        message: string,
    ) {
        super(type, message);
    }

    getStartPos(): number {
        return this.astNode.startPos;
    }

    getEndPos(): number {
        return this.astNode.endPos;
    }

    getScriptContents(): string {
        return this.astNode.getRoot().scriptContents;
    }
}