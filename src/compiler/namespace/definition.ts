import { AtomicExpression } from "../../ast/expression.ts";
import { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue } from "../codeValue.ts";

export enum DefinitionType {
    FUNCTION,
    VALUE,
}

export type Definition = FunctionDefinition | ValueDefinition;

export interface FunctionDefinition {
    definitionType: DefinitionType.FUNCTION,
    // todo: signature
    compile(args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}

export interface ValueDefinition {
    definitionType: DefinitionType.VALUE;
    returnType: Type;
    compile(ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}