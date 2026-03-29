import { ASTNode } from "../ast/astNode.ts";
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

    templateForm() {
        return {
            "id": "num",
            "data": {
                "name": this.value
            }
        };
    }
}

export class StringValue extends TangibleValue {
    constructor(
        public value: string,
        astNode?: ASTNode
    ) { super(astNode); }

    templateForm() {
        return {
            "id": "txt",
            "data": {
                "name": this.value
            }
        };
    }
}


export class StyledTextValue extends TangibleValue {
    constructor(
        public value: string,
        astNode?: ASTNode
    ) { super(astNode); }

    templateForm() {
        return {
            "id": "comp",
            "data": {
                "name": this.value
            }
        };
    }
}
