import { Token } from "../lexer/token.ts";

export class Expression {}

export class NumberExpression extends Expression {
    constructor(
        public token: Token,
    ) {super();}
}

export class BinaryExpression extends Expression {
    constructor (
        public left: Expression,
        public operator: Token,
        public right: Expression,
    ) {super();}
}