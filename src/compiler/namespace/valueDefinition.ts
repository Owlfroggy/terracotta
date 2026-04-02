import { TargetType } from "../../df/actiondump.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, GameValueValue } from "../codeValue.ts";
import { DefinitionType } from "./namespace.ts";

export interface ValueDefinition {
    definitionType: DefinitionType.VALUE;
    compile(ctx: EvaluationContext): [CodeValue, CodeBlock[]]
}

export function generateGameValueHook(valueName: string, dfName: string, target: TargetType): ValueDefinition {
    return {
        definitionType: DefinitionType.VALUE,
        compile: (ctx) => {
            return [new GameValueValue(dfName, target), []];
        }
    }
}