import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import { TCError } from "../../error/error.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, TangibleValue, ActionTagValue, EmptyValue, StringValue, VariableValue } from "../codeValue.ts";
import * as AD from "../../df/actiondump.ts";
import { AtomicExpression } from "../../ast/expression.ts";
import { Type } from "../../typeProcessor/type.ts";
import { DefinitionType } from "./namespace.ts";

export interface FunctionDefinition {
    definitionType: DefinitionType.FUNCTION,
    // todo: signature
    compile(args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, ctx: EvaluationContext): [CodeValue, CodeBlock[]];
}


export function generateActionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET): FunctionDefinition {
    return {
        definitionType: DefinitionType.FUNCTION,
        compile: (args, namedArgs, ctx): [CodeValue, CodeBlock[]] => {
            let tags: ActionTagValue[] = [];
            // todo: default tag values

            // tag parsing
            let actionDef = AD.actions.get(codeblock)?.[actionDFName];
            if (actionDef) {
                for (const [nameExpr, arg] of namedArgs.entries()) {
                    let tagDef = actionDef.tcTagMap[nameExpr.token.value];
                    if (!tagDef) {
                        ctx.reportError(
                            nameExpr.startPos, nameExpr.endPos,
                            `Invalid tag name '${nameExpr.token.value}'`
                        );
                        continue;
                    }

                    let valType = arg.getType(ctx);
                    if (!(valType == Type.str || valType == Type.any)) {
                        ctx.reportError(
                            arg.astNode?.startPos ?? -1, arg.astNode?.endPos ?? -1,
                            `Expected string (str) for tag value, got '${valType.name}'`
                        );
                        continue;
                    }

                    if (arg instanceof StringValue) {
                        if (!(arg.value in tagDef.options)) {
                            ctx.reportError(
                                arg.astNode?.startPos ?? -1, arg.astNode?.endPos ?? -1,
                                `'${arg.value}' is not a valid option for this tag`
                            );
                            continue;
                        }

                        tags.push(new ActionTagValue(tagDef, arg.value));
                    } else {
                        // todo: specifiable default vaulues)
                        tags.push(new ActionTagValue(tagDef, tagDef.defaultOption, arg as VariableValue))
                    }
                }
            }

            let code: CodeBlock[] = [
                new ActionBlock(codeblock,{action: actionDFName, args: args.filter(v => v instanceof TangibleValue), tags: tags, target: target})
            ]
            return [new EmptyValue(), code];
        }
    }
}