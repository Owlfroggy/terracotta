import { ASTNode } from "../ast/astNode.ts";
import { Type } from "../typeProcessor/type.ts";
import { VariableId, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { EvaluationContext } from "./codeCompiler.ts";
import { FunctionDefinition } from "./namespace/functionDefinition.ts";
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
}

/**
 * used for stuff like namespaces and their methods,
 * stuff that needs to be evaluated in expressions but
 * has no item representation in df
 */
export abstract class InternalValue extends CodeValue {
    constructor(astNode?: ASTNode) { super(astNode); }
}

/**
 * used for actual values like vars, strings, numbers,
 * anything that does have an actual item representation in diamondfire
 */
export abstract class TangibleValue extends CodeValue {
    constructor(astNode?: ASTNode) { super(astNode); }

    abstract templateForm(): any;
}

//=-------------------=\\
//=- internal values -=\\
//=-------------------=\\

export class NamespaceValue extends InternalValue {
    constructor(
        public namespace: Namespace,
        astNode?: ASTNode
    ) { super(astNode); }
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

export class VariableValue extends TangibleValue {
    readonly variableId: VariableId;

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
        return ctx.envFrame.getVariableType(this.variableId, this.astNode?.startPos ?? Infinity);
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

    toString(): string {
        return `var${this.explicitType ? `<${this.explicitType.name}>` : ""}(${this.scope}, '${this.name}')`;
    }
}