import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import { TCError } from "../../error/error.ts";
import { CodeActionTag } from "../codeActionTag.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeValue } from "../codeValue.ts";

export interface FunctionDefinition {
    // todo: signature
    compile(args: CodeValue[], tags: CodeActionTag[]): [CodeValue[], CodeBlock[]];
}


export function generateActionHook(functionName: string, codeblock, actionDFName: string, target: TargetType = TargetType.UNSET): FunctionDefinition {
    return {
        compile: (args: CodeValue[]): [CodeValue[], CodeBlock[]] => {
            // todo: return values
            let items: CodeValue[] = [];
            let code: CodeBlock[] = [
                new ActionBlock(codeblock,{action: actionDFName, args: args, tags: [], target: target})
            ]
            return [items, code];
        }
    }
}