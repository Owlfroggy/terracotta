import { ASTNode } from "../ast/astNode.ts";
import { BinaryExpression, Expression, UnaryPrefixExpression } from "../ast/expression.ts";
import { TokenType } from "../ast/token.ts";

export class BooleanOperation {
    constructor(
        public operation: TokenType.BOOL_AND | TokenType.BOOL_OR | TokenType.BANG,
        public a: BooleanOperation | Expression,
        /** will not be present for NOT operations */
        public b?: BooleanOperation | Expression,
    ) {}
    
    toString() {
        if (this.operation == TokenType.BANG) {
            return `!${this.a}`
        } else {
            return `(${this.a} ${this.operation == TokenType.BOOL_AND ? "&&" : "||"} ${this.b})`
        }
    }
    toPrimitive = this.toString;

    /** 
     * Returns true if this boolean operation tree would only output its body once
     * 
     * ASSUMES THAT THE OP TREE IS SIMPLIFIED!!!
     *  */
    static isSinglePath(simplifiedOp: BooleanOperation): boolean {
        if (simplifiedOp.operation == TokenType.BOOL_OR) return false;

        if (simplifiedOp.a instanceof BooleanOperation) {
            if (!this.isSinglePath(simplifiedOp.a)) return false;
        }
        if (simplifiedOp.b && simplifiedOp.b instanceof BooleanOperation) {
            if (!this.isSinglePath(simplifiedOp.b)) return false;
        }
        
        return true;
    }

    /** Distributes negations as far as they will go */
    static simplify(op: BooleanOperation): BooleanOperation | Expression {
        // TODO: Make this handle multiple layers of ! correctly
        if (op.operation == TokenType.BANG) {
            let shouldNegate = true;
            let thingBeingNegated = op.a;
            let lowestNegationOperation = op;

            // account for multiple !s
            while (thingBeingNegated instanceof BooleanOperation && thingBeingNegated.operation == TokenType.BANG) {
                lowestNegationOperation = thingBeingNegated;
                thingBeingNegated = thingBeingNegated.a;
                shouldNegate = !shouldNegate;
            }
            if (!shouldNegate) return thingBeingNegated;

            // if an "atom" is being negated then this negation can stay
            if (thingBeingNegated instanceof Expression) {
                return lowestNegationOperation;
            } 
            // otherwise distribute
            else { 
                // flip args
                thingBeingNegated.a = new BooleanOperation(
                    TokenType.BANG,
                    thingBeingNegated.a
                );
                thingBeingNegated.b = new BooleanOperation(
                    TokenType.BANG,
                    thingBeingNegated.b!
                );
                // flip operation
                thingBeingNegated.operation = (thingBeingNegated.operation == TokenType.BOOL_AND) ? TokenType.BOOL_OR : TokenType.BOOL_AND;
                return this.simplify(thingBeingNegated);
            }
        } else {
            if (op.a instanceof BooleanOperation) op.a = this.simplify(op.a);
            if (op.b instanceof BooleanOperation) op.b = this.simplify(op.b);
            return op;
        }
    }

    private static generateRecurse(expression: Expression): BooleanOperation | Expression {
        if (
            expression instanceof BinaryExpression
            && (expression.operator.type == TokenType.BOOL_AND || expression.operator.type == TokenType.BOOL_OR)
        ) {
            return new BooleanOperation(
                expression.operator.type,
                this.generateRecurse(expression.left.getRealExpression()),
                this.generateRecurse(expression.right.getRealExpression()),
            )
        } else if (
            expression instanceof UnaryPrefixExpression
            && expression.operator.type == TokenType.BANG
        ) {
            return new BooleanOperation(
                expression.operator.type,
                this.generateRecurse(expression.right.getRealExpression()),
            )
        } else {
            return expression;
        }
    }
    static generateFromExpression(booleanExpression: BinaryExpression | UnaryPrefixExpression): BooleanOperation {
        return this.generateRecurse(booleanExpression) as BooleanOperation;
    }


    static exprIsBooleanExpression(expression: Expression): expression is BinaryExpression | UnaryPrefixExpression {
        return (
            (
                expression instanceof BinaryExpression
                && (expression.operator.type == TokenType.BOOL_AND || expression.operator.type == TokenType.BOOL_OR)
            )
            || (
                expression instanceof UnaryPrefixExpression
                && expression.operator.type == TokenType.BANG
            )
        )
    }
}