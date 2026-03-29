import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import { TCError } from "../../error/error.ts";
import { CodeActionTag } from "../codeActionTag.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeItem } from "../codeItem.ts";

export interface FunctionDefinition {
    // todo: signature
    compile(args: CodeItem[], tags: CodeActionTag[]): [CodeItem[], CodeBlock[]];
}


export function generateActionHook(functionName: string, codeblock, actionDFName: string, target: TargetType = TargetType.UNSET): FunctionDefinition {
    return {
        compile: (args: CodeItem[]): [CodeItem[], CodeBlock[]] => {
            // todo: return values
            let items: CodeItem[] = [];
            let code: CodeBlock[] = [
                new ActionBlock(codeblock,{action: actionDFName, args: args, tags: [], target: target})
            ]
            return [items, code];
        }
    }
}