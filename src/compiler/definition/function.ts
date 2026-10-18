import { ASTNode } from "../../ast/astNode.ts";
import { AtomicExpression, CallExpression, CallOrStartExpression, Expression } from "../../ast/expression.ts";
import { FunctionStatement } from "../../ast/statement.ts";
import { Action } from "../../df/actiondump.ts";
import { Type } from "../../typeProcessor/type.ts";
import type { TypeProcessor } from "../../typeProcessor/typeProcessor.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, EmptyValue, TangibleValue } from "../codeValue.ts";
import { Definition, DefinitionType } from "./base.ts";

export interface ParameterSignatureEntry {
    type: Type,
    name: string,
    optional: boolean,
    plural: boolean,
    description?: string,
}

export interface ParameterSignature {
    params: ParameterSignatureEntry[],
    name?: string,
    disallowSkips?: boolean,
}

export interface FunctionCallExtraInfo {
    /** If present, insert this value at the start of the arguments list */
    methodCallOf?: TangibleValue,
}

export function USE_DEFAULT_RETURN_TYPE(this: FunctionDefinition, args: Expression[], types: TypeProcessor) {
    return this.defaultReturnType
}

function EMPTY_COMPILE_BODY(): [CodeValue, CodeBlock[]] {
    return [new EmptyValue(), []];
}

type ReturnTypeGetter = (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => Type;
type FunctionCompilationBody = (this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext, callNode: CallExpression | CallOrStartExpression, extraInfo?: FunctionCallExtraInfo) => [CodeValue, CodeBlock[]];
interface FunctionDefinitionFlags {
    /** 
     * If true, indicates that this named args should NOT be compiled into code values prior to 
     * calling def.compile() as this function handles that itself
     * 
     * If true, EmptyValue should be passed in for every CodeValue entry in the namedArgs map
     * */
    manuallyCompilesNamedArgs?: boolean,
    /** 
     * If set to true, return value vars should be added to the end of the args list as opposed to the start
     * */
    returnVarsAtEnd?: boolean,
    isProcess?: boolean,
};

export class FunctionDefinition extends Definition {
    name: string;
    description?: string;
    signatures: ParameterSignature[] = [];
    
    
    defaultReturnType: Type = Type.void;
    getReturnType: ReturnTypeGetter = USE_DEFAULT_RETURN_TYPE;
    
    
    compile: FunctionCompilationBody = EMPTY_COMPILE_BODY;

    flags: FunctionDefinitionFlags = {};

    /** Is only used for language server purposes, the compiler should never touch this */
    action?: Action;

    // language server specific stuff
    /** If present, hide this function from autocomplete and show this deprecation message in signature help */
    deprecationMessage?: string;
    astNode?: FunctionStatement;
    autocompleteSortPrefix?: string;

    constructor(name: string) {
        super(DefinitionType.FUNCTION);
        this.name = name;
    }

    /**
     * WARNING: Currently, clone.signatures will still point to the same array as this.signatures
     */
    clone(): FunctionDefinition {
        let c = new FunctionDefinition(this.name)
        c.description = this.description;
        c.signatures = this.signatures;
        c.defaultReturnType = this.defaultReturnType;
        c.getReturnType = this.getReturnType;
        c.compile = this.compile;
        c.flags = structuredClone(this.flags);
        c.action = this.action;
        c.deprecationMessage = this.deprecationMessage;
        c.astNode = this.astNode;
        c.autocompleteSortPrefix = this.autocompleteSortPrefix;
        return c;
    }

    withDescription(desc?: string): this {
        if (desc) this.description = desc;
        return this;
    }
    withReturnType(defaultType: Type, getterMethod?: ReturnTypeGetter): this {
        this.defaultReturnType = defaultType;
        if (getterMethod) this.getReturnType = getterMethod;
        return this;
    }
    withSignatures(signatures: ParameterSignature[]): this {
        this.signatures = signatures;
        return this;
    }
    withCompilationBody(body: FunctionCompilationBody): this {
        this.compile = body;
        return this;
    }
    withAction(action?: Action): this {
        if (action) this.action = action;
        return this;
    }

    withASTNode(astNode: FunctionStatement): this {
        this.astNode = astNode;
        return this;
    }
    withDeprecationMessage(message?: string): this {
        this.deprecationMessage = message;
        return this;
    }
    withAutocompleteSortPrefix(prefix?: string): this {
        this.autocompleteSortPrefix = prefix;
        return this;
    }
    withFlags(flags: FunctionDefinitionFlags): this {
        this.flags = flags;
        return this;
    }
}

/**
 * Normal compile() is what will be used in expressions and will output a number.
 * To get the raw if block, use compileIf()
 */
export class ConditionDefinition extends FunctionDefinition {
    /** Should always return an EmptyValue */
    compileIf: FunctionCompilationBody;

    /** `def` will be modified in-place!! */
    static convertFunctionDefinition(def: FunctionDefinition, expressionizedCompileBody: FunctionCompilationBody): ConditionDefinition {
        Object.setPrototypeOf(def, ConditionDefinition.prototype)
        const casted = def as unknown as ConditionDefinition;
        casted.compileIf = casted.compile;
        casted.compile = expressionizedCompileBody;
        def.defaultReturnType = Type.num;
        return casted;
    }
}