import { DFCodeblockName, DFValueType } from "../../../df/constants.ts";
import { ActionBlock, CodeBlock } from "../../codeBlock.ts";
import { CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import * as AD from "../../../df/actiondump.ts";
import { CodeOptimizer } from "../optimizer.ts";

/**
 * Condenses `<temp var> = <value>; <var> = <temp var>;` to just `<var> = <value>`
 * 
 * NOTE: disabling this optimization pass **may** cause differences in behavior!!!
 * (becuase of GetDictValue returning a reference)
 */
export function OPT_condenseSetChain(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [actualSetBlockIndex, actualSetBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        args: [
            {accepts: ValueFilterType.TEMP_VAR}
        ]
    });


    let actionDef = AD.actions.get(actualSetBlock.block)![actualSetBlock.action];
    if (!optimizer.actionIsSetter(actionDef)) return false;

    let tempVar = actualSetBlock.args[0];
    let [unneededSetBlockIndex, unneededSetBlock] = optimizer.matcher.codeblock<ActionBlock>({
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