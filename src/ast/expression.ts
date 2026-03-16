import { Token } from "../lexer/token.ts";

export class Expression {
    constructor(
        public startPos: number,
        public endPos: number
     ) {}
}

export class AtomicExpression extends Expression {
    constructor(
        public token: Token,
    ) {super(token.startPos, token.endPos);}
}

export class BinaryExpression extends Expression {
    constructor (
        public left: Expression,
        public operator: Token,
        public right: Expression,
    ) {super(left.startPos, right.endPos);}
}

export class GroupExpression extends Expression {
    constructor (
        public opener: Token,
        public expression: Expression,
        public closer: Token,
    ) {super(opener.startPos, closer.endPos);}
}