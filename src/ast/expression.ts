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


export class TypeAssignmentExpression extends Expression {
    constructor(
        public colon: Token,
        public type: TypeExpression,
    ) {super(colon.startPos, type.endPos);}
}

export class MultiTypeAssignmentExpression extends Expression {
    constructor(
        public colon: Token,
        public types: TypeExpression[],
    ) {super(colon.startPos, types[types.length-1].endPos);}
}

export class ParameterExpression extends Expression {
    constructor(
        public name: Token,
        public assignedType: TypeAssignmentExpression | null,
        public plural: Token | null,
        public assignmentOperator: Token | null,
        public defaultValue: Expression | null
    ) {
        super(
            name.startPos, 
            // end (pos) me:
            defaultValue ? defaultValue.endPos : 
            assignmentOperator ? assignmentOperator.endPos : 
            plural ? plural.endPos : 
            assignedType ? assignedType.endPos : 
            name.endPos
        );
    }
}

export class UnaryPrefixExpression extends Expression {
    constructor (
        public operator: Token,
        public right: Expression,
    ) {super(operator.startPos, right.endPos);}
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

export class ListExpression<T extends Expression = Expression> extends Expression {
    constructor(
        public opener: Token,
        public elements: T[],
        public closer: Token,
    ) {super(opener.startPos, closer.endPos);}
}

export class DictionaryEntryExpression extends Expression {
    constructor(
        public key: Token | GroupExpression,
        public colon: Token,
        public value: Expression
    ) {super(key.startPos, value.endPos);}
}

export class DictionaryExpression extends Expression {
    constructor(
        public opener: Token,
        public entries: DictionaryEntryExpression[],
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