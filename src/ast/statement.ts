import { ASTNode, CommentHolder } from "./astNode.ts";
import { ChunkExpression, Expression } from "./expression.ts";
import { Token } from "./token.ts";

export class Statement extends ASTNode implements CommentHolder {
    attachedComments: Token[] = [];
    constructor(
        startPos: number, endPos: number,
    ) {super(startPos, endPos);}
}

export class ExpressionStatement extends Statement {
    constructor(
        startPos, endPos,
        public expression: Expression
    ) {
        super(startPos, endPos);
    }
}
export class EventStatement extends Statement {
    constructor(
        public modifiers: Token[],
        public type: Token,
        public eventName: Token,
        public chunk: ChunkExpression
    ) {super(modifiers.length > 0 ? modifiers[0].startPos : type.startPos, chunk.endPos);}
}

export class RepeatForeverStatement extends Statement {
    constructor(
        public keyword: Token,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}