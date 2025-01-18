import * as Tokenizer from "../tokenizer/tokenizer.ts"
import { VariableToken } from "../util/textCodeParser.ts";

export enum ContextDomainAccessType {
    Action,
    Value,
    Condition,
}
export enum ContextDictionaryLocation {
    Key,
    Value,
}

export class CodeContext {
    /**
     * Parents a context to this one and also returns the child
     * @param childContext The context to be the new child
     * @returns The child context
     */
    setChild<T extends CodeContext>(childContext: T): T {
        if (this.child) {
            this.child.parent = undefined
        }
        this.child = childContext
        childContext.parent = this
        return childContext
    }

    /**
     * Orphan this context (make parent context have no child, effectively deleting this branch)
     * @returns The parent that is now childless
     */
    discardBranch(): CodeContext | null {
        let parent = this.parent
        if (parent) {
            if (parent._linkedToChild) {
                return parent.discardBranch()
            }
            parent.child = undefined
            this.parent = undefined
            return parent
        } else {
            return null
        }
    }

    /**
     * If this context is inside of another context (for example a dictionary
     * nested in a particle), this is the context one level up
     */
    parent: CodeContext | undefined
    /**
     * If this context containers another context (for example the particle
     * that contains a dictionary, this is that context
     */
    child: CodeContext | undefined
    
    /** If the cursor is inside a string, this provides information about that string */
    stringInfo?: {startIndex: number, endIndex: number, value: string, openingChar: string, unclosed?: boolean}
    
    inComplexName: boolean

    /**
     * If true, this context will also be discarded when its child is discarded
     */
    _linkedToChild: boolean

    from?: number
}

//uni
export class CodelineContext extends CodeContext {}

export class ConditionContext extends CodeContext {}
//uni
export class AssigneeContext extends CodeContext {}
//uni
export class TypeContext extends CodeContext {}

export class RepeatContext extends CodeContext {}
//uni
export class ParameterContext extends CodeContext {
    name?: string
}

export class VariableContext extends CodeContext {
    scope: "saved" | "unsaved" | "line" | "local"
    name?: string
}

export class NumberContext extends CodeContext {}
//uni
export class SelectionContext extends CodeContext {
    type: "select" | "filter"
    action?: string
}
export class ForLoopContext extends CodeContext {
    variables: Tokenizer.VariableToken[] = []
    mode?: "in" | "on"
    action?: string
}
//uni
export class DomainAccessContext extends CodeContext {
    constructor(
        public type: ContextDomainAccessType,
        public domainId: string
    ) {super()}
    name?: string
}
//uni
export class ConstructorContext extends CodeContext {
    constructor(
        public name: "str" | "num" | "vec" | "loc" | "pot" | "var" | "snd" | "txt" | "item" | "par" | "list" | "dict" | "litem" | "csnd"
    ) {super()}

    _linkedToChild: boolean = true;
}
//uni
export class ListContext extends CodeContext {
    /**
     * All elements that come before the one the cursor is positioned in
     */
    prevoiusElements: (Tokenizer.ExpressionToken | null)[]
    /**
     * The index of the element the cursor is positioned at
     */
    elementIndex: number
}
//uni
export class DictionaryContext extends CodeContext { 
    in: ContextDictionaryLocation
    keyName?: string
}
//uni
export class TagsContext extends DictionaryContext {
    isVariable: boolean
}

export class StandaloneFunctionContext extends CodeContext {
    constructor(
        public name: string
    ) {super()}
}

export class UserCallContext extends CodeContext {
    constructor(
        public mode: "function" | "process"
    ) {super()}
    name?: string
}

export class EventContext extends CodeContext {
    constructor(
        public mode: "player" | "entity"
    ) {super()}
}