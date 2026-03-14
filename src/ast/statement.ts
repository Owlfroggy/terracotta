import { Expression } from "./expression.ts";

export class Statement {
    constructor(
        public startPos: number,
        public endPos: number,
    ) {}
}

export class ExpressionStatement extends Statement {
    constructor(
        startPos, endPos,
        public expression: Expression
    ) {
        super(startPos, endPos);
    }
}