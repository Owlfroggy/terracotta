import { ASTNode } from "../ast/astNode.ts";
import { Tag } from "../df/actiondump.ts";
import * as AD from "../df/actiondump.ts";
import { dfTypeToTC, getCodeblockIdentifier, TargetType } from "../df/constants.ts";
import { Type } from "../typeProcessor/type.ts";
import { VariableId, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { EvaluationContext } from "./codeCompiler.ts";
import { FunctionDefinition } from "./namespace/definition.ts";
import { Namespace } from "./namespace/namespace.ts";

//=--------------------=\\
//=- abstract classes -=\\
//=--------------------=\\

/**
 * base class which all code values extend from
 */
export abstract class CodeValue {
    constructor(
        public astNode?: ASTNode,
    ) {}

    getType(ctx: EvaluationContext): Type {
        return Type.unknown;
    }

    /** 
     * Returns true if this value compiles to a single code item with a known value.
     * 
     * When called on variables/game values/etc, this returns false since the value could be anything.
     * 
     * When called on anything with % codes, this will return false 
     * (since there's basically a variable contained in there).
     * */
    abstract isCompileTimeConstant(): boolean
}

/**
 * used for stuff like namespaces and their methods,
 * stuff that needs to be evaluated in expressions but
 * has no item representation in df
 */
export abstract class InternalValue extends CodeValue {
    constructor(astNode?: ASTNode) { super(astNode); }

    isCompileTimeConstant() { return false; }
}

/**
 * used for actual values like vars, strings, numbers,
 * anything that does have an actual item representation in diamondfire
 */
export abstract class TangibleValue extends CodeValue {
    constructor(astNode?: ASTNode) { super(astNode); }

    abstract templateForm(): any;
    
    isCompileTimeConstant() { return true; }
}

//=-------------------=\\
//=- internal values -=\\
//=-------------------=\\

export class NamespaceValue extends InternalValue {
    private type: Type;
    constructor(
        public namespace: Namespace,
        astNode?: ASTNode
    ) { 
        super(astNode); 
        this.type = Type.namespace(namespace);
    }

    getType(ctx: EvaluationContext): Type {
        return this.type;
    }
}

export class FunctionValue extends InternalValue {
    constructor(
        public definition: FunctionDefinition,
        astNode?: ASTNode
    ) { super(astNode); }
}


/**
 * used to represent void return values of functions
 */
export class EmptyValue extends InternalValue {
    constructor(astNode?: ASTNode) { super(astNode); }
}

/**
 * used to represent values that could not be compiled
 * (e.g. a non-existant member on a domain)
 * 
 * this is only used for error recovery and will never be
 * present when compiling error-free code
 */
export class MissingValue extends InternalValue {
    constructor(astNode?: ASTNode) { super(astNode); }
}

//=-------------------=\\
//=- tangible values -=\\
//=-------------------=\\

export class NumberValue extends TangibleValue {
    constructor(
        public value: string,
        astNode?: ASTNode
    ) { super(astNode); }

    getType(ctx: EvaluationContext): Type {
        return Type.num;
    }

    templateForm() {
        return {
            "id": "num",
            "data": {
                "name": this.value
            }
        };
    }

    toString(): string {
        return `num('${this.value}')`;
    }
}

export class StringValue extends TangibleValue {
    constructor(
        public value: string,
        astNode?: ASTNode
    ) { super(astNode); }

    getType(ctx: EvaluationContext): Type {
        return Type.str;
    }

    templateForm() {
        return {
            "id": "txt",
            "data": {
                "name": this.value
            }
        };
    }

    toString(): string {
        return `str('${this.value}')`;
    }
}

export class StyledTextValue extends TangibleValue {
    constructor(
        public value: string,
        astNode?: ASTNode
    ) { super(astNode); }

    getType(ctx: EvaluationContext): Type {
        return Type.txt;
    }

    templateForm() {
        return {
            "id": "comp",
            "data": {
                "name": this.value
            }
        };
    }

    toString(): string {
        return `txt('${this.value}')`;
    }
}

export class VectorValue extends TangibleValue {
    constructor(
        public x: string,
        public y: string,
        public z: string,
        astNode?: ASTNode
    ) { super(astNode); }

    getType(ctx: EvaluationContext): Type {
        return Type.vec;
    }

    templateForm() {
        return {
            "id": "vec",
            "data": {
                "x": this.x,
                "y": this.y,
                "z": this.z,
            }
        };
    }

    toString(): string {
        return `vec(${this.x}, ${this.y}, ${this.z})`;
    }
}

export class LocationValue extends TangibleValue {
    constructor(
        public x: string,
        public y: string,
        public z: string,
        public pitch: string,
        public yaw: string,
        astNode?: ASTNode
    ) { super(astNode); }

    getType(ctx: EvaluationContext): Type {
        return Type.loc;
    }

    templateForm() {
        return {
            "id": "loc",
            "data": {
                "isBlock": false,
                "loc": {
                    "x": this.x,
                    "y": this.y,
                    "z": this.z,
                    "pitch": this.pitch,
                    "yaw": this.yaw,
                }
            }
        };
    }

    toString(): string {
        return `loc(${this.x}, ${this.y}, ${this.z}, ${this.pitch}, ${this.yaw})`;
    }
}

export class VariableValue extends TangibleValue {
    readonly variableId: VariableId;
    public isTempVar: boolean = false;

    constructor(
        public name: string,
        public scope: VariableScope,
        private explicitType?: Type,
        astNode?: ASTNode
    ) { 
        super(astNode); 
        this.variableId = VariableId.get(scope,name);
    }

    getType(ctx: EvaluationContext): Type {
        if (this.explicitType) return this.explicitType;
        // todo: make sure that putting Infinity here isnt as big of a war crime as i think it is
        if (!this.astNode) return Type.unknown;
        let frame = ctx.types.getNodeFrame(this.astNode);

        return frame.getVariableType(this.variableId, this.astNode?.startPos ?? Infinity);
    }

    templateForm() {
        let scope = "line";
        switch (this.scope) {
            case VariableScope.GLOBAL:  scope = "unsaved"; break;
            case VariableScope.SAVED:   scope = "saved"; break;
            case VariableScope.LOCAL:   scope = "local"; break;
            case VariableScope.LINE:    scope = "line"; break;
        }
        return {
            "id": "var",
            "data": {
                "name": this.name,
                "scope": scope,
            }
        };
    }

    isCompileTimeConstant() { return false; }

    toString(): string {
        return `var${this.explicitType ? `<${this.explicitType.name}>` : ""}(${this.scope}, '${this.name}')`;
    }
}

export class GameValueValue extends TangibleValue {
    constructor(
        public value: string,
        public target: TargetType,
        astNode?: ASTNode
    ) {super(astNode);}

    getType(ctx: EvaluationContext): Type {
        let dfType = AD.gameValues[this.value]?.type;
        if (!dfType) return Type.unknown;
        // console.log(dfType, dfTypeToTC[dfType])
        return dfTypeToTC.get(dfType)!;
    }

    templateForm() {
        return {
            "id": "g_val",
            "data": {
                "type": this.value,
                "target": this.target
            }
        };
    }

    isCompileTimeConstant() { return false; }
}

export class ActionTagValue extends TangibleValue {
    constructor(
        public definition: Tag,
        public option: string,
        public variable?: VariableValue,
        astNode?: ASTNode
    ) {
        super(astNode);
    }

    getType(ctx: EvaluationContext): Type {
        throw new Error("Attempted to get type of an action tag value");
    }

    templateForm() {
        return {
            "item": {
                "id": "bl_tag",
                "data": {
                    "tag": this.definition.name,
                    "option": this.option,
                    "block": getCodeblockIdentifier(this.definition.codeblock),
                    "action": this.definition.action,
                    "variable": this.variable?.templateForm(),
                }
            },
            "slot": this.definition.chestSlot
        };
    }

    isCompileTimeConstant() { return this.variable == undefined; }
}