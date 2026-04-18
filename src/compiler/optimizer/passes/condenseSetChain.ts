import { DFCodeblockName, DFValueType } from "../../../df/constants.ts";
import { ActionBlock, CodeBlock } from "../../codeBlock.ts";
import { CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import * as AD from "../../../df/actiondump.ts";

/**
 * Condenses `<temp var> = <value>; <var> = <temp var>;` to just `<var> = <value>`
 * 
 * NOTE: disabling this optimization pass **may** cause differences in behavior!!!
 * (becuase of GetDictValue returning a reference)
 */
export function OPT_condenseSetChain(line: CodeBlock[], matcher: CodeBlockMatcher): boolean {
    let [actualSetBlockIndex, actualSetBlock] = matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        args: [
            {accepts: ValueFilterType.TEMP_VAR}
        ]
    });


    let actionDef = AD.actions.get(actualSetBlock.block)![actualSetBlock.action];
    if (!actionDef) return false;
    if (actionDef.parameters.length == 0) return false;
    let firstParam = actionDef.parameters[0].groups[0][0];
    if (!(firstParam.type == DFValueType.VARIABLE && firstParam.description == "Variable to set")) return false;

    let tempVar = actualSetBlock.args[0];
    let [unneededSetBlockIndex, unneededSetBlock] = matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        action: "=",
        args: [
            {accepts: ValueFilterType.VAR},
            tempVar,
        ]
    })

    line.splice(unneededSetBlockIndex,1);
    actualSetBlock.args[0] = unneededSetBlock.args[0];

    return true;
}