import { HeaderType } from "../compiler/codeCompiler.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { ASTNode, CommentHolder } from "./astNode.ts";
import { ChunkExpression, Expression, GroupExpression, ListExpression, MissingExpression, MultiTypeAssignmentExpression, ParameterExpression, TypeAssignmentExpression, TypeExpression, VariableExpression } from "./expression.ts";
import { Token, TokenType } from "./token.ts";

export class Statement extends ASTNode implements CommentHolder {
    attachedComments: Token[] = [];
    /** Will only be set for statements that declare code lines (e.g. player event or function) */
    headerType: HeaderType | null = null;

    constructor(
        startPos: number, endPos: number,
    ) {super(startPos, endPos);}

    toString(): string {
        return this.constructor.name;
    }
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
        public chunk: ChunkExpression | MissingExpression
    ) {
        super(modifiers.length > 0 ? modifiers[0].startPos : type.startPos, chunk.endPos);
        this.headerType = DFCodeblockName[TokenType[type.type]];
    }
}

export class FunctionStatement extends Statement {
    constructor(
        public keyword: Token,
        public name: Token,
        public args: ListExpression<ParameterExpression> | null,
        public returnType: MultiTypeAssignmentExpression | null,
        public chunk: ChunkExpression,
    ) {
        super(keyword.startPos, chunk.endPos);
        this.headerType = DFCodeblockName.FUNCTION;
    }
}

export class ProcessStatement extends Statement {
    constructor(
        public keyword: Token,
        public name: Token,
        public args: ListExpression<ParameterExpression> | null,
        public chunk: ChunkExpression,
    ) {
        super(keyword.startPos, chunk.endPos);
        this.headerType = DFCodeblockName.PROCESS;
    }
}

export class RepeatStatement extends Statement {
    constructor(
        public keyword: Token,
        public countExpression: GroupExpression | null,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}

export class ForStatement extends Statement {
    constructor(
        public keyword: Token,
        public headerExpression: GroupExpression,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}

export class IfStatement extends Statement {
    constructor(
        public keyword: Token,
        public condition: GroupExpression,
        public chunk: ChunkExpression,
        public elseKeyword: Token | null = null,
        public elseChunk: ChunkExpression | null = null,
    ) {super(keyword.startPos, elseChunk ? elseChunk.endPos : chunk.endPos);}
}

export class WhileStatement extends Statement {
    constructor(
        public keyword: Token,
        public condition: GroupExpression,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}

export class DoStatement extends Statement {
    constructor(
        public doKeyword: Token,
        public chunk: ChunkExpression,
        public whileKeyword: Token | null = null,
        public whileCondition: Expression | null = null,
    ) {super(doKeyword.startPos, whileCondition ? whileCondition.endPos : chunk.endPos);}
}

export class SelectionStatement extends Statement {
    constructor (
        public keyword: Token,
        public name: Token,
        public args: ListExpression | null,
    ) {super(keyword.startPos, args != null ? args.endPos : name.endPos);}
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
        public values: Expression[],
    ) {super(keyword.startPos, values.length > 0 ? values[values.length-1].endPos : keyword.endPos);}
}