import { Token } from "./token.ts";

export class ASTNode {
    public parent: ASTNode | null;
    public children: ASTNode[] = [];

    constructor(
        /** inclusive */
        public readonly startPos: number,
        /** exclusive */
        public readonly endPos: number,
    ) {}
}

export interface CommentHolder {
    attachedComments: Token[];
}