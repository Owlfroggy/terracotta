import { ASTNode } from "../../ast/astNode.ts";
import { AtomicExpression, CallExpression, CallOrStartExpression, Expression } from "../../ast/expression.ts";
import { FunctionStatement } from "../../ast/statement.ts";
import { Action, GameValue, Tag } from "../../df/actiondump.ts";
import { Type } from "../../typeProcessor/type.ts";
import { TypeProcessor } from "../../typeProcessor/typeProcessor.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, TangibleValue } from "../codeValue.ts";

export enum DefinitionType {
    FUNCTION,
    VALUE,
    PROPERTY,
}

export type Definition = FunctionDefinition | ValueDefinition | PropertyDefinition;

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

export interface FunctionDefinition {
    definitionType: DefinitionType.FUNCTION,
    name: string,
    description?: string,
    signatures: ParameterSignature[],
    
    /** 
     * If set to true, return value vars should be added to the end of the args list as opposed to the start
     * */
    returnVarsAtEnd?: boolean,
    defaultReturnType: Type,
    getReturnType: (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => Type,
    
    /** 
     * If true, indicates that this named args should NOT be compiled into code values prior to 
     * calling def.compile() as this function handles that itself
     * 
     * If true, EmptyValue should be passed in for every CodeValue entry in the namedArgs map
     * */
    manuallyCompilesNamedArgs?: boolean,
    compile(args: CodeValue[], namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext, callNode: CallExpression | CallOrStartExpression, extraInfo?: FunctionCallExtraInfo): [CodeValue, CodeBlock[]];

    /** Is only used for language server purposes, the compiler should never touch this */
    action?: Action,

    // language server specific stuff
    astNode?: FunctionStatement,
    autocompleteSortPrefix?: string
}

/**
 * Normal compile() is what will be used in expressions and will output a number.
 * To get the raw if block, use compileIf()
 */
export interface ConditionDefinition extends FunctionDefinition {
    /** Will always be Type.num */
    defaultReturnType: Type,
    /** Should always return an EmptyValue */
    compileIf(args: CodeValue[], namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext, callNode: CallExpression | CallOrStartExpression, extraInfo?: FunctionCallExtraInfo): [CodeValue, CodeBlock[]];
}

export interface ValueDefinition {
    definitionType: DefinitionType.VALUE;
    returnType: Type;
    /** Is only used for language server purposes, the compiler should never touch this */
    gameValue?: GameValue,
    compile(ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}

export interface PropertyDefinition {
    definitionType: DefinitionType.PROPERTY,
    type: Type,
    /** 
     * If true, this property is only available on values whose type 
     * matches with this namespace; the property will NOT be available
     * on the namespace itself.
     * */
    valueExclusive?: boolean,
    compileGet(ctx: EvaluationContext, propertyOf: CodeValue): [CodeValue, CodeBlock[]],
    compileSet(newValue: TangibleValue, ctx: EvaluationContext, propertyOf: CodeValue): CodeBlock[],

    // language server specific stuff
    autocompleteSortPrefix?: string
}

export function isFunctionDefinition(obj): obj is FunctionDefinition {
    return (
        obj instanceof Object
        && obj.definitionType == DefinitionType.FUNCTION
    );
}

export function isValueDefinition(obj): obj is ValueDefinition {
    return (
        obj instanceof Object
        && obj.definitionType == DefinitionType.VALUE
    );
}

export function isPropertyDefinition(obj): obj is PropertyDefinition {
    return (
        obj instanceof Object
        && obj.definitionType == DefinitionType.PROPERTY
    );
}

export function USE_DEFAULT_RETURN_TYPE(this: FunctionDefinition, args: Expression[], types: TypeProcessor) {
    return this.defaultReturnType
}