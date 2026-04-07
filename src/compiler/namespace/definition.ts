import { AtomicExpression } from "../../ast/expression.ts";
import { Action, DFValueType, GameValue, Tag } from "../../df/actiondump.ts";
import { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue } from "../codeValue.ts";

export enum DefinitionType {
    FUNCTION,
    VALUE,
}

export type Definition = FunctionDefinition | ValueDefinition;

export interface ArgumentEntry {
    type: Type,
    name: string,
    optional: boolean,
    plural: boolean,
    description?: string,
}

export interface ArgumentSignature {
    args: ArgumentEntry[],
}

export interface FunctionDefinition {
    definitionType: DefinitionType.FUNCTION,
    name: string,
    signatures: ArgumentSignature[],
    returnType: Type | null,
    tags?: Tag[],
    /** Is only used for language server purposes, the compiler should never touch this */
    action?: Action,
    // todo: signature
    compile(args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}

export interface ValueDefinition {
    definitionType: DefinitionType.VALUE;
    returnType: Type;
    /** Is only used for language server purposes, the compiler should never touch this */
    gameValue?: GameValue,
    compile(ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}