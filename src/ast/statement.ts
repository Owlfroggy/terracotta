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
        public expression: Expression
    ) {
        super(expression.startPos,expression.endPos);
    }
}

export class DeclareStatement extends Statement {
    constructor(
        public keyword: Token,
        public subStatement: ExpressionStatement | AssignmentStatement
    ) {super(keyword.startPos, subStatement.endPos);}
}

export class AssignmentStatement extends Statement {
    constructor(
        public leftValues: Expression[],
        public leftValueCommas: Token[],
        public operator?: Token,
        public rightValue?: Expression,
    ) {
        super(
            leftValues[0]?.startPos ??
            leftValueCommas[0].startPos ??
            operator!.startPos
            ,
            rightValue?.endPos ??
            operator?.endPos ??
            leftValues[leftValues.length-1]?.endPos ??
            leftValueCommas[leftValueCommas.length-1]?.endPos
        )
    }

    isErrorFree(): 
        this is AssignmentStatement&{
            leftValues: [Expression, ...Expression[]],
            operator: Token,
            rightValue: Expression,
        }
    {
        return (
            this.leftValues.length > 0
            && this.operator != undefined
            && this.rightValue != undefined
        )
    }
}

export class EventStatement extends Statement {
    override headerType: HeaderType;
    
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

/** Also used for processes */
export class FunctionStatement extends Statement {
    override headerType: HeaderType;

    constructor(
        public keyword: Token,
        public name: Token,
        public params: ListExpression<ParameterExpression> | null,
        public returnType: MultiTypeAssignmentExpression | null,
        public chunk: ChunkExpression | MissingExpression,
    ) {
        super(keyword.startPos, chunk.endPos);
        this.headerType = keyword.type == TokenType.FUNCTION ? DFCodeblockName.FUNCTION : DFCodeblockName.PROCESS;
    }
}

export class RepeatStatement extends Statement {
    constructor(
        public keyword: Token,
        public countExpression: GroupExpression | null,
        public chunk: ChunkExpression | null,
    ) {super(keyword.startPos, chunk?.endPos ?? countExpression?.endPos ?? keyword.endPos);}
}

export class ForStatement extends Statement {
    constructor(
        public keyword: Token,
        public opener: Token,
        public variableList: ListExpression,
        public iteratorExpression: Expression | null,
        public closer: Token,
        public chunk: ChunkExpression | null,
    ) {
        super(
            keyword.startPos,
            chunk?.endPos ?? (closer.type == TokenType.MISSING ? null : closer.endPos) ?? iteratorExpression?.endPos ?? variableList.endPos
        );
    }
}

export class IfStatement extends Statement {
    constructor(
        public keyword: Token,
        public inverterToken: Token | null,
        public condition: GroupExpression,
        public chunk: ChunkExpression | null,
        public elseKeyword: Token | null = null,
        public elseContents: IfStatement | ChunkExpression | null = null,
    ) {super(keyword.startPos, elseContents ? elseContents.endPos : chunk ? chunk.endPos : condition.endPos);}
}

export class WhileStatement extends Statement {
    constructor(
        public keyword: Token,
        public inverterToken: Token | null,
        public condition: GroupExpression,
        public chunk: ChunkExpression | null,
    ) {super(keyword.startPos, chunk?.endPos ?? condition.endPos);}
}

export class DoStatement extends Statement {
    constructor(
        public doKeyword: Token,
        public chunk: ChunkExpression,
        public whileKeyword: Token | null = null,
        public whileInverterToken: Token | null = null,
        public whileCondition: Expression | null = null,
    ) {super(doKeyword.startPos, whileCondition?.endPos ?? whileInverterToken?.endPos ?? chunk.endPos);}
}

export class PerSelectedStatement extends Statement {
    constructor(
        public keyword: Token,
        public chunk: ChunkExpression,
    ) {super(keyword.startPos, chunk.endPos);}
}

export class SingleKeywordStatement extends Statement {
    constructor(
        public keyword: Token,
    ) {super(keyword.startPos, keyword.endPos);}
}

export class ReturnStatement extends Statement {
    constructor(
        public keyword: Token,
        public values: Expression[],
    ) {super(keyword.startPos, values.length > 0 ? values[values.length-1].endPos : keyword.endPos);}
}