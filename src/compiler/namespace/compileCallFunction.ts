import { AtomicExpression, CallExpression } from "../../ast/expression.ts";
import { actions } from "../../df/actiondump.ts";
import { DFCodeblockName } from "../../df/constants.ts";
import { MultiValueTypeData, Type } from "../../typeProcessor/type.ts";
import { validateArguments } from "../../util/argValidation.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, EmptyValue, MultiValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { compileTags } from "./builtins.ts";
import { FunctionDefinition } from "./definition.ts";

export function COMPILE_CALL_FUNCTION(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]] {
    validateArguments(args, callNode, this.signatures, ctx, false);
    let returnValue: CodeValue;
    let returnType = this.getReturnType(callNode.args.elements, ctx.types);
    let returnVars: VariableValue[] = [];
    if (returnType.matches(Type.void)) {
        returnValue = new EmptyValue(callNode);
    } else if (returnType.matches(Type.multivalue)) {
        let returnTypeData = returnType.data as MultiValueTypeData
        let multiValue = new MultiValue([], callNode);
        for (let i = 0; i < returnTypeData.types.length; i++) {
            let tempVar = ctx.tvp.newTempVar(returnTypeData.types[i])
            multiValue.values.push(tempVar);
            returnVars.push(tempVar);
        }
        returnValue = multiValue;
    } else {
        let tempVar = ctx.tvp.newTempVar(returnType)
        returnValue = tempVar;
        returnVars.push(tempVar);
    }
    return [returnValue, [new ActionBlock(DFCodeblockName.CALL_FUNCTION,{
        action: this.name,
        args: [...returnVars, ...args.filter(arg => arg instanceof TangibleValue)],
    })]]
}

// TODO: start process tags
export function COMPILE_START_PROCESS(this: FunctionDefinition, args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext, callNode: CallExpression): [CodeValue, CodeBlock[]] {
    validateArguments(args, callNode, this.signatures, ctx, true);
    return [new EmptyValue(), [new ActionBlock(DFCodeblockName.START_PROCESS,{
        action: this.name,
        args: args.filter(arg => arg instanceof TangibleValue),
        tags: compileTags(actions.get(DFCodeblockName.START_PROCESS)!.dynamic, namedArgs, ctx),
    })]]
}