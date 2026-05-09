import { AtomicExpression, CallExpression } from "../../ast/expression.ts";
import { DFCodeblockName } from "../../df/constants.ts";
import { validateArguments } from "../../util/argValidation.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, EmptyValue, TangibleValue } from "../codeValue.ts";
import { FunctionDefinition } from "./definition.ts";

export function COMPILE_CALL_FUNCTION(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]] {
    validateArguments(args, callNode, this.signatures, ctx, true);
    // TODO: return values (idk if they should even go here but keep them in mind)
    return [new EmptyValue(), [new ActionBlock(DFCodeblockName.CALL_FUNCTION,{
        action: this.name,
        args: args.filter(arg => arg instanceof TangibleValue),
    })]]
}

// TODO: start process tags
export function COMPILE_START_PROCESS(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]] {
    validateArguments(args, callNode, this.signatures, ctx, true);
    return [new EmptyValue(), [new ActionBlock(DFCodeblockName.START_PROCESS,{
        action: this.name,
        args: args.filter(arg => arg instanceof TangibleValue),
    })]]
}