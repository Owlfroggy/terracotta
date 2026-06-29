import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, CallExpression } from "../ast/expression.ts";

export function getImprovedErrorNode(node: ASTNode) {
    // when calling an access chain, only highlight the last function's name in errors
    if (node instanceof CallExpression) {
        if (node.callee instanceof AccessExpression) {
            return node.callee.propertyName;
        }
    }
    return node;
}