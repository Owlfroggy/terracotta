import { ASTNode } from "../ast/astNode.ts";
import { Tag } from "../df/actiondump.ts";
import * as AD from "../df/actiondump.ts";
import { dfTypeToTC, DFValueType, getCodeblockIdentifier, TargetType } from "../df/constants.ts";
import { PCode } from "../pcode/pcode.ts";
import { Type } from "../typeProcessor/type.ts";
import { TypeProcessor, VariableId, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { parseTcNumber } from "../util/utils.ts";
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

    getType(typeProcessor: TypeProcessor): Type {
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

    getType(typeProcessor: TypeProcessor): Type {
        return this.type;
    }
}

export class FunctionValue extends InternalValue {
    constructor(
        public definition: FunctionDefinition,
        public methodCallOf?: TangibleValue,
        astNode?: ASTNode
    ) { super(astNode); }
}

export class MultiValue extends InternalValue {
    constructor(
        public values: CodeValue[],
        astNode?: ASTNode,
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
        public value: string | PCode[],
        astNode?: ASTNode
    ) { super(astNode); }

    getType(typeProcessor: TypeProcessor): Type {
        return Type.num;
    }

    /**
     * Will throw an error if used on a non-constant number
     */
    toNumber(): number {
        if (typeof this.value == "string") {
            return parseTcNumber(this.value);
        } else {
            throw new Error(`Cannot get numeric value of '${this.value}'`)
        }
    }

    templateForm() {
        return {
            "id": "num",
            "data": {
                "name": typeof this.value == "string" ? this.value : this.value.join("")
            }
        };
    }

    isCompileTimeConstant(): this is {value: string} {
        return typeof this.value == "string";
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

    getType(typeProcessor: TypeProcessor): Type {
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

    isCompileTimeConstant(): this is {value: string} {
        return typeof this.value == "string";
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

    getType(typeProcessor: TypeProcessor): Type {
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

    getType(typeProcessor: TypeProcessor): Type {
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

    getType(typeProcessor: TypeProcessor): Type {
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

export class SoundValue extends TangibleValue {
    constructor(
        public sound: string,
        public pitch: number, 
        public volume: number,
        public isCustom: boolean,
        public variant?: string,
        astNode?: ASTNode,
    ) { super(astNode) }

    getType(typeProcessor: TypeProcessor): Type {
        return Type.snd;
    }

    templateForm() {
        return {
            "id": "snd",
            "data": {
                "pitch": this.pitch,
                "vol": this.volume,
                "sound": this.isCustom ? undefined : this.sound,
                "variant": this.variant,
                "key": this.isCustom ? this.sound : undefined,
            }
        }
    }
}


export class PotionValue extends TangibleValue {
    constructor(
        public effect: string, 
        public amplifier: number, 
        /** `1000000` is what df considers 'infinite' */
        public duration: number,
        astNode?: ASTNode,
    ) {super(astNode);}

    getType(typeProcessor: TypeProcessor): Type {
        return Type.pot;
    }

    templateForm() {
        return {
            "id": "pot",
            "data": {
                "pot": this.effect,
                "dur": this.duration,
                "amp": this.amplifier
            }
        }
    }
}

export interface ParticleExtraData {
    rgb?: number,
    colorVariation?: number,
    rgb_fade?: number,

    size?: number,
    sizeVariation?: number,

    x?: number,
    y?: number,
    z?: number,
    motionVariation?: number,

    material?: string,
    roll?: number,
    opacity?: number,
    power?: number,
    time?: number,
}
export class ParticleValue extends TangibleValue {
    constructor(
        public particle: string,
        public amount: number,
        public spreadHorizontal: number,
        public spreadVertical: number,
        public data: ParticleExtraData,
        astNode?: ASTNode,
    ) { super(astNode); }

    getType(typeProcessor: TypeProcessor): Type {
        return Type.par;
    }

    templateForm() {
        return {
            "id": "part",
            "data": {
                "particle": this.particle,
                "cluster": {
                    "amount": this.amount,
                    "horizontal": this.spreadHorizontal,
                    "vertical": this.spreadVertical
                },
                "data": this.data
            }
        }
    }
}

export class ItemValue extends TangibleValue {
    constructor(
        public id: string,
        public count: number,
        public nbt?: string | undefined,
        astNode?: ASTNode,
        public dfNbt: number = 4671,
    ) {
        super(astNode);
        if (!id.startsWith("minecraft:")) id = "minecraft:" + id;
    }

    getType(typeProcessor: TypeProcessor): Type {
        return Type.item;
    }

    templateForm() {
        return {
            "id": "item",
            "data": {
                "item": `{count:${this.count}b,DF_NBT:${this.dfNbt},id:"${this.id}",components:${this.nbt ?? "{}"}}`
            }
        }
    }
}

export class LibraryItemValue extends TangibleValue {
    constructor(
        public data: string,
        public dfNbt: number = 4671,
        public libraryId: string,
        public itemId: string,
    ) {
        super();
    }

    getType(typeProcessor: TypeProcessor): Type {
        return Type.item;
    }

    templateForm() {
        return {
            "id": "item",
            "data": {
                "item": this.data.substring(0,this.data.length-1)+`,DF_NBT:${this.dfNbt}}` // TODO: use an actual nbt library :sob:
            }
        }
    }
}

export class VariableValue extends TangibleValue {
    public isTempVar: boolean = false;

    constructor(
        public name: string | PCode[],
        public scope: VariableScope,
        private explicitType?: Type,
        astNode?: ASTNode
    ) { super(astNode); }

    getVarId(): VariableId {
        return VariableId.get(this.scope,this.name.toString());;
    }

    getType(typeProcessor: TypeProcessor): Type {
        if (this.explicitType) return this.explicitType;
        // todo: make sure that putting Infinity here isnt as big of a war crime as i think it is
        if (!this.astNode) return Type.unknown;
        let frame = typeProcessor.getNodeFrame(this.astNode);

        return frame.getVariableType(this.getVarId(), this.astNode?.startPos ?? Infinity);
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

    getType(typeProcessor: TypeProcessor): Type {
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

export class ParameterValue extends TangibleValue {
    constructor(
        public name: string,
        public type: string,
        public plural: boolean,
        public optional: boolean,
        public defaultValue: TangibleValue | null,
        astNode?: ASTNode,
    ) { super(astNode); }

    getType(typeProcessor: TypeProcessor): Type {
        throw new Error("Attempted to get type of a parameter value");
    }

    templateForm() {
        return {
            "id": "pn_el",
            "data": {
                "name": this.name,
                "type": this.type,
                "default_value": this.defaultValue != null ? this.defaultValue.templateForm() : undefined,
                "plural": this.plural,
                "optional": this.optional
            }
        }
    }
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

    getType(typeProcessor: TypeProcessor): Type {
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