import { ASTNode } from "../ast/astNode.ts";
import { DFCodeblockName, getCodeblockIdentifier, TargetType } from "../df/actiondump.ts";
import { CodeActionTag } from "./codeActionTag.ts";
import { CodeItem } from "./codeItem.ts";

//=-------------------------------=\\
//=- warning! this file sucks :( -=\\
//=-------------------------------=\\

export interface TargetedCodeBlock {
    target: TargetType,
}

export interface SubActionCodeBlock {
    subAction: string,
}

//=----------=\\
//=- events -=\\
//=----------=\\

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

export abstract class ActionBlock extends CodeBlock {
    private actionField = "action";

    constructor(
        block: DFCodeblockName, 
        public action: string,
        public args: CodeItem[],
        public tags: CodeActionTag[],
        astNode: ASTNode | null,
    ) {super(block, astNode)}

    templateForm() {
        return {
            ...super.templateForm(),
            [this.actionField]: this.action,
            args: {items: /** TODO: serialize args and tags */null},
        }
    }
}

export abstract class InvertibleBlock extends ActionBlock{
    constructor(
        block: DFCodeblockName, 
        public inverted: boolean,
        action: string,
        args: CodeItem[],
        tags: CodeActionTag[],
        astNode: ASTNode | null,
    ) {super(block, action, args, tags, astNode);}
}

export abstract class EventBlock extends ActionBlock {
    constructor(
        block: DFCodeblockName, 
        public lsCancel: boolean,
        action: string,
        args: CodeItem[],
        tags: CodeActionTag[],
        astNode: ASTNode | null,
    ) {super(block, action, args, tags, astNode);}

    templateForm() {
        return {
            ...super.templateForm(),
            attribute: this.lsCancel ? "LS-CANCEL" : undefined
        };
    }
}

//=----------=\\
//=- events -=\\
//=----------=\\

export class PlayerEventBlock extends EventBlock {
    constructor({event, lsCancel, astNode}: { event: string, lsCancel: boolean, astNode: ASTNode | null }) {
        super(DFCodeblockName.PLAYER_EVENT, lsCancel, event, [], [], astNode);
    }
}

export class EntityEventBlock extends EventBlock {
    constructor({event, lsCancel, astNode}: { event: string, lsCancel: boolean, astNode: ASTNode | null }) {
        super(DFCodeblockName.ENTITY_EVENT, lsCancel, event, [], [], astNode);
    }
}

export class GameEventBlock extends EventBlock {
    constructor({event, lsCancel, astNode}: { event: string, lsCancel: boolean, astNode: ASTNode | null }) {
        super(DFCodeblockName.GAME_EVENT, lsCancel, event, [], [], astNode);
    }
}

//=--------------------------=\\
//=- function/process stuff -=\\
//=--------------------------=\\

export class FunctionBlock extends ActionBlock {
    constructor({name, astNode}: { name: string, astNode: ASTNode | null }) {
        super(DFCodeblockName.FUNCTION, name, [], [], astNode);
    }
}

export class ProcessBlock extends ActionBlock {
    constructor({name, astNode}: { name: string, astNode: ASTNode | null }) {
        super(DFCodeblockName.FUNCTION, name, [], [], astNode);
    }
}

export class CallFunctionBlock extends ActionBlock {
    constructor({name, args, tags, astNode}: { name: string, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.CALL_FUNCTION, name, args, tags, astNode);
    }
}

export class StartProcessBlock extends ActionBlock {
    constructor({name, args, tags, astNode}: { name: string, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.START_PROCESS, name, args, tags, astNode);
    }
}

//=-----------=\\
//=- actions -=\\
//=-----------=\\

export class PlayerActionBlock extends ActionBlock implements TargetedCodeBlock {
    target: TargetType;

    constructor({action, args, tags, target, astNode}: { action: string, args: CodeItem[], tags: CodeActionTag[], target: TargetType, astNode: ASTNode | null }) {
        super(DFCodeblockName.PLAYER_ACTION, action, args, tags, astNode);
        this.target = target;
    }
}

export class EntityActionBlock extends ActionBlock implements TargetedCodeBlock {
    target: TargetType;

    constructor({action, args, tags, target, astNode}: { action: string, args: CodeItem[], tags: CodeActionTag[], target: TargetType, astNode: ASTNode | null }) {
        super(DFCodeblockName.ENTITY_ACTION, action, args, tags, astNode);
        this.target = target;
    }
}

export class GameActionBlock extends ActionBlock {
    constructor({action, args, tags, astNode}: { action: string, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.GAME_ACTION, action, args, tags, astNode);
    }
}

export class SetVariableBlock extends ActionBlock {
    constructor({action, args, tags, astNode}: { action: string, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.SET_VARIABLE, action, args, tags, astNode);
    }
}

//=-----------------=\\
//=- if statements -=\\
//=-----------------=\\


export class IfPlayerBlock extends InvertibleBlock implements TargetedCodeBlock {
    target: TargetType;

    constructor({action, inverted, args, tags, target, astNode}: { action: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], target: TargetType, astNode: ASTNode | null }) {
        super(DFCodeblockName.IF_PLAYER, inverted, action, args, tags, astNode);
        this.target = target;
    }
}

export class IfEntityBlock extends InvertibleBlock implements TargetedCodeBlock {
    target: TargetType;

    constructor({action, inverted, args, tags, target, astNode}: { action: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], target: TargetType, astNode: ASTNode | null }) {
        super(DFCodeblockName.IF_ENTITY, inverted, action, args, tags, astNode);
        this.target = target;
    }
}

export class IfGameBlock extends InvertibleBlock {
    constructor({action, inverted, args, tags, astNode}: { action: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.IF_GAME, inverted, action, args, tags, astNode);
    }
}

export class IfVariableBlock extends InvertibleBlock {
    constructor({action, inverted, args, tags, astNode}: { action: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.IF_VARIABLE, inverted, action, args, tags, astNode);
    }
}

export class ElseBlock extends CodeBlock {
    constructor({astNode}: {
        astNode?: ASTNode | null,
    }) {
        super(DFCodeblockName.ELSE, astNode ?? null);
    }
}

//=------------------------------=\\
//=- other miscellaneous blocks -=\\
//=------------------------------=\\


export class ControlBlock extends ActionBlock {
    constructor({action, args, tags, astNode}: { action: string, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.CONTROL, action, args, tags, astNode);
    }
}


export class SelectObjectBlock extends InvertibleBlock implements SubActionCodeBlock {
    subAction: string;
    
    constructor({action, subAction, inverted, args, tags, astNode}: { action: string, subAction: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.SELECT_OBJECT, inverted, action, args, tags, astNode);
        this.subAction = subAction;
    }
}

export class RepeatBlock extends InvertibleBlock implements SubActionCodeBlock {
    subAction: string;

    constructor({action, subAction, inverted, args, tags, astNode}: { action: string, subAction: string, inverted: boolean, args: CodeItem[], tags: CodeActionTag[], astNode: ASTNode | null }) {
        super(DFCodeblockName.REPEAT, inverted, action, args, tags, astNode);
        this.subAction = subAction;
    }
}

export enum BracketType {IF, REPEAT};
export enum BracketDirection {OPEN, CLOSE};

export class BracketBlock extends CodeBlock {
    type: BracketType;
    direction: BracketDirection;

    constructor({type, direction, astNode}: {
        type: BracketType,
        direction: BracketDirection,
        astNode?: ASTNode | null,
    }) {
        super(DFCodeblockName.ELSE, astNode ?? null);
        this.type = type;
        this.direction = direction;
    }
}
