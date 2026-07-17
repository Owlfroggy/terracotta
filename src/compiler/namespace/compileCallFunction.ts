import { AtomicExpression, CallExpression, Expression } from "../../ast/expression.ts";
import { actions } from "../../df/actiondump.ts";
import { DFCodeblockName } from "../../df/constants.ts";
import { MultiValueTypeData, Type } from "../../typeProcessor/type.ts";
import { validateArguments } from "../../util/argValidation.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, EmptyValue, MultiValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { compileTags, handleSingleBlockReturnVars } from "./builtins.ts";
import { FunctionCallExtraInfo, FunctionDefinition } from "./definition.ts";

export function COMPILE_CALL_FUNCTION(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext, callNode: CallExpression, extraInfo: FunctionCallExtraInfo): [CodeValue, CodeBlock[]] {
    // TODO: handle user-defined methods
    validateArguments(args, callNode, this.signatures, ctx);

    let finalArgs = args.filter(arg => arg instanceof TangibleValue)
    let [returnValue] = handleSingleBlockReturnVars(this, ctx, extraInfo, callNode, finalArgs);

    return [returnValue, [new ActionBlock(DFCodeblockName.CALL_FUNCTION,{
        action: this.name,
        args: finalArgs,
    })]]
}

// TODO: start process tags
export function COMPILE_START_PROCESS(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]] {
    validateArguments(args, callNode, this.signatures, ctx, {allowNamedArgs: true});
    let [tags, code] = compileTags(actions.get(DFCodeblockName.START_PROCESS)!.dynamic, namedArgs, ctx);
    code.push(new ActionBlock(DFCodeblockName.START_PROCESS,{
        action: this.name,
        args: args.filter(arg => arg instanceof TangibleValue),
        tags,
    }));
    return [new EmptyValue(), code];
}