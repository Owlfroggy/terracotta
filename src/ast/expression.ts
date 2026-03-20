import { ASTNode, CommentHolder } from "./astNode.ts";
import { Statement } from "./statement.ts";
import { Token } from "./token.ts";

export class Expression extends ASTNode implements CommentHolder {
    attachedComments: Token[] = [];
    constructor(
        startPos: number, endPos: number
    ) { super(startPos, endPos); }
}

export class AtomicExpression extends Expression {
    constructor(
        public token: Token,
    ) {super(token.startPos, token.endPos);}
}

export class VariableExpression extends Expression {
    constructor(
        public scope: Token,
        public name: Token,
    ) {super(scope.startPos, name.endPos);}
}

export class TypeExpression extends Expression {
    constructor(
        public baseType: Token,
    ) {super(baseType.startPos, baseType.endPos);}
}

export class BinaryExpression extends Expression {
    constructor (
        public left: Expression,
        public operator: Token,
        public right: Expression,
    ) {super(left.startPos, right.endPos);}
}

export class CallExpression extends Expression {
    constructor (
        public callee: Expression,
        public args: ListExpression,
    ) {super(callee.startPos,args.endPos); }
}

export class CallOrStartExpression extends Expression {
    constructor (
        public keyword: Token,
        public name: Token,
        public args: ListExpression | null,
    ) {super(keyword.startPos, args != null ? args.endPos : name.endPos);}
}

export class AccessExpression extends Expression {
    constructor (
        public accessee: Expression,
        public accessorToken: Token,
        public propertyName: Token,
    ) {super(accessee.startPos,propertyName.endPos); }
}

export class GroupExpression extends Expression {
    constructor (
        public opener: Token,
        public expression: Expression,
        public closer: Token,
    ) {super(opener.startPos, closer.endPos);}
}

export class ListExpression extends Expression {
    constructor(
        public opener: Token,
        public elements: Expression[],
        public closer: Token,
    ) {super(opener.startPos, closer.endPos);}
}

export class ChunkExpression extends Expression {
    constructor(
        public opener: Token,
        public statements: Statement[],
        public closer: Token,
    ) {super(opener.startPos, closer.endPos);}
}

/**
 * This expression is used as a placeholder when an expression that was expected to be in a place wasn't there.
 * This will never appear in an error-free AST.
 */
export class MissingExpression extends Expression {
    constructor(position: number) {
        super(position,position);
    }
}