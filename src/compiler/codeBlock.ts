import { ASTNode } from "../ast/astNode.ts";
import * as AD from "../df/actiondump.ts";
import { DFCodeblockName, getCodeblockIdentifier, TargetType } from "../df/constants.ts";
import { ActionTagValue, TangibleValue } from "./codeValue.ts";

//=-------------------------------=\\
//=- warning! this file sucks :( -=\\
//=-------------------------------=\\

export enum BracketType {
    IF = "norm", 
    REPEAT = "repeat",
};
export enum BracketDirection {
    OPEN = "open", 
    CLOSE = "close"
};

export abstract class CodeBlock {
    constructor(
        public block: DFCodeblockName,
        public astNode: ASTNode | null,
    ) {}

    templateForm(): any {
        return {
            id: "block",
            block: getCodeblockIdentifier(this.block)
        };
    }
}

export class ActionBlock extends CodeBlock {
    public action: string;
    public args: TangibleValue[];
    public tags: ActionTagValue[];
    public target: TargetType;

    constructor(
        block: DFCodeblockName, 
        {action, args = [], tags = [], target = TargetType.UNSET, astNode = null} : {
            action: string,
            args?: TangibleValue[],
            tags?: ActionTagValue[],
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

        // fill in missing tags
        let tags = [...this.tags];
        let actionEntry = AD.actions.get(this.block)?.[this.action];
        if (actionEntry) {
            let seenTags: AD.Tag[] = this.tags.map(v => v.definition);
            for (let tagDef of Object.values(actionEntry.tags)) {
                if (!(seenTags.includes(tagDef))) {
                    tags.push(new ActionTagValue(tagDef, tagDef.defaultOption));
                }
            }
        }
        
        return {
            ...super.templateForm(),
            [actionField]: this.action,
            args: {
                items: [
                    // args
                    ...this.args.filter(v => v instanceof TangibleValue).map((v, i) => ({item: v.templateForm(), slot: i})),
                    // tags (the templateForm() itself takes care of the item and slot wrapper)
                    ...tags.map(v => v.templateForm())
                ]
            },
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
            args?: TangibleValue[],
            tags?: ActionTagValue[],
            target?: TargetType
            inverted?: boolean,
            astNode?: ASTNode | null,
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
            args?: TangibleValue[],
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
        super(DFCodeblockName.BRACKET, astNode);
        this.type = type;
        this.direction = direction;
    }

    templateForm() {
        return {
            id: "bracket",
            direct: this.direction,
            type: this.type,
        };
    }
}
