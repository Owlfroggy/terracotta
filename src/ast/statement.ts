import { ASTNode, CommentHolder } from "./astNode.ts";
import { ChunkExpression, Expression, GroupExpression, ListExpression } from "./expression.ts";
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

export class RepeatStatement extends Statement {
    constructor(
        public keyword: Token,
        public countExpression: GroupExpression | null,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}

export class SingleKeywordStatement extends Statement {
    constructor(
        public keyword: Token,
        public args: ListExpression | null
    ) {super(keyword.startPos, args ? args.endPos : keyword.startPos);}
}

export class ReturnStatement extends Statement {
    constructor(
        public keyword: Token,
        public value: Expression | null,
    ) {super(keyword.startPos, value ? value.endPos : keyword.endPos);}
}