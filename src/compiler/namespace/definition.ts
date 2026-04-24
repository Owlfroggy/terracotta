import { AtomicExpression, CallExpression } from "../../ast/expression.ts";
import { Action, GameValue, Tag } from "../../df/actiondump.ts";
import { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue } from "../codeValue.ts";

export enum DefinitionType {
    FUNCTION,
    VALUE,
}

export type Definition = FunctionDefinition | ValueDefinition;

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
}

export interface FunctionDefinition {
    definitionType: DefinitionType.FUNCTION,
    name: string,
    signatures: ParameterSignature[],
    returnType: Type | null,
    /** Is only used for language server purposes, the compiler should never touch this */
    action?: Action,
    // todo: signature
    compile(args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]];
}

/**
 * Normal compile() is what will be used in expressions and will output a number.
 * To get the raw if block, use compileIf()
 */
export interface ConditionDefinition extends FunctionDefinition {
    /** Will always be Type.num */
    returnType: Type,
    /** Should always return an EmptyValue */
    compileIf(args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]];
}

export interface ValueDefinition {
    definitionType: DefinitionType.VALUE;
    returnType: Type;
    /** Is only used for language server purposes, the compiler should never touch this */
    gameValue?: GameValue,
    compile(ctx: EvaluationContext): [CodeValue, CodeBlock[]];
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