import { Statement } from "./statement.ts";
import { Token } from "./token.ts";

export class ASTNode {
    public parent: ASTNode | null;
    /** 
     * the key in this node's parent that references this node 
     * this.parent[this.key] = this
     * */
    public key: string = "";
    /** 
     * guaranteed to be sorted:
     * order is based on startPos, least to greatest
     */
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

    toString(): string {
        return this.constructor.name;
    }
}


export class RootNode extends ASTNode {
    public scriptContents: string;
    public filePath: string;

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