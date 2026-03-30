import { ASTNode } from "../ast/astNode.ts";
import { DFCodeblockName, getCodeblockIdentifier, TargetType } from "../df/actiondump.ts";
import { CodeActionTag } from "./codeActionTag.ts";
import { CodeValue as CodeValue, TangibleValue } from "./codeValue.ts";

//=-------------------------------=\\
//=- warning! this file sucks :( -=\\
//=-------------------------------=\\

export enum BracketType {IF, REPEAT};
export enum BracketDirection {OPEN, CLOSE};

export abstract class CodeBlock {
    constructor(
        public block: DFCodeblockName,
        public astNode: ASTNode | null,
    ) {}

    templateForm() {
        return {
            id: "block",
            block: getCodeblockIdentifier(this.block)
        };
    }
}

export class ActionBlock extends CodeBlock {
    public action: string;
    public args: TangibleValue[];
    public tags: CodeActionTag[];
    public target: TargetType;

    constructor(
        block: DFCodeblockName, 
        {action, args = [], tags = [], target = TargetType.UNSET, astNode = null} : {
            action: string,
            args?: TangibleValue[],
            tags?: CodeActionTag[],
            target?: TargetType
            astNode?: ASTNode | null,
        }
    ) {
        super(block, astNode);
        this.action = action;
        this.args = args;
        this.tags = tags;
        this.target = target;
    }

    templateForm() {
        let actionField = "action";
        
        return {
            ...super.templateForm(),
            [actionField]: this.action,
            args: {items: this.args.filter(v => v instanceof TangibleValue).map((v, i) => ({item: v.templateForm(), slot: i}))},
            target: this.target == TargetType.UNSET ? undefined : this.target
        }
    }
}

export class EventBlock extends ActionBlock {
    public lsCancel: boolean;

    constructor(
        block: DFCodeblockName, 
        {action, args = [], tags = [], lsCancel = false, astNode = null} : {
            action: string,
            args?: [],
            tags?: [],
            lsCancel?: boolean,
            astNode?: ASTNode | null,
        }
    ) {
        super(block, {action, args, tags, astNode});
        this.lsCancel = lsCancel;
    }

    templateForm() {
        return {
            ...super.templateForm(),
            attribute: this.lsCancel ? "LS-CANCEL" : undefined
        };
    }
}

export class IfBlock extends ActionBlock {
    public inverted: boolean;

    constructor(
        block: DFCodeblockName, 
        {action, args = [], tags = [], target = TargetType.UNSET, inverted = false, astNode = null} : {
            action: string,
            args: [],
            tags: [],
            target: TargetType
            inverted: boolean,
            astNode: ASTNode | null,
        }
    ) {
        super(block, {action, args, tags, target, astNode});
        this.inverted = inverted;
    }
}

export class SubActionBlock extends ActionBlock {
    public inverted: boolean;
    public subAction: string | null;

    constructor(
        block: DFCodeblockName, 
        {action, subAction = null, args = [], tags = [], target = TargetType.UNSET, inverted = false, astNode = null} : {
            action: string,
            subAction?: string | null
            args?: [],
            tags?: [],
            target?: TargetType
            inverted?: boolean,
            astNode?: ASTNode | null,
        }
    ) {
        super(block, {action, args, tags, target, astNode});
        this.inverted = inverted;
        this.subAction = subAction;
    }
}

export class ElseBlock extends CodeBlock {
    constructor({astNode = null}: {
        astNode?: ASTNode | null,
    }) {
        super(DFCodeblockName.ELSE, astNode);
    }
}
export class BracketBlock extends CodeBlock {
    type: BracketType;
    direction: BracketDirection;

    constructor({type, direction, astNode = null}: {
        type: BracketType,
        direction: BracketDirection,
        astNode?: ASTNode | null,
    }) {
        super(DFCodeblockName.ELSE, astNode);
        this.type = type;
        this.direction = direction;
    }
}
