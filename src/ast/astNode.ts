import { Statement } from "./statement.ts";
import { Token } from "./token.ts";

export class ASTNode {
    public parent: ASTNode | null;
    /** 
     * the key in this node's parent that references this node 
     * this.parent[this.key] = this
     * */
    public keyInParent: string = "";
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

    getClosestAncestor<T extends ASTNode>(type: new (...args: any[]) => T): T | null {
        if (this instanceof type) {
            return this;
        } else {
            return this.parent?.getClosestAncestor(type) ?? null;
        }
    }

    isChildOf(parent: ASTNode): boolean {
        let n = this.parent;
        while (n != null) {
            if (n == parent) return true;
            n = n.parent;
        }
        return false;
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