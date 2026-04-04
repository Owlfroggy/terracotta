import { Statement } from "./statement.ts";
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

    getRoot(): RootNode {
        return this.parent!.getRoot();
    }
}


export class RootNode extends ASTNode {
    public scriptContents: string;

    constructor(
        public readonly statements: Statement[],
    ) {super(-1, -1);}

    getRoot(): RootNode {
        return this;
    }
}

export interface CommentHolder {
    attachedComments: Token[];
}