import { DFCodeblockName, DFValueType } from "../../../df/constants.ts";
import { ActionBlock, CodeBlock } from "../../codeBlock.ts";
import { CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import * as AD from "../../../df/actiondump.ts";
import { CodeOptimizer } from "../optimizer.ts";
import { VariableValue } from "../../codeValue.ts";

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
    if (!(tempVar instanceof VariableValue)) return false;
    let usages = optimizer.findVariableUsages(line, tempVar.getVarId(), actualSetBlockIndex);

    let unneededSetBlockIndex: number | undefined, unneededSetBlock: ActionBlock | undefined;
    let lastChainIndex: number | undefined;
    for (const u of usages) {
        // only condense set chains that are consecutive
        // if this isn't done, statements like `dingus = !dingus` break
        if (lastChainIndex != undefined) {
            if (u.blockIndex != lastChainIndex + 1) return false;
        }
        lastChainIndex = u.blockIndex;

        // im not sure how this could happen but its probably best to be safe and just not touch it
        if (u.pcodePath) return false;
        
        let [thisSetBlockIndex, thisSetBlock] = optimizer.matcher.codeblockOrNull<ActionBlock>({
            block: DFCodeblockName.SET_VARIABLE,
            action: "=",
            args: [
                {accepts: ValueFilterType.VAR},
                tempVar,
            ]
        }, u.blockIndex)

        if (thisSetBlock != null) {
            // if there are multiple set blocks, dont bother trying to condense
            if (unneededSetBlock != undefined) {
                return false;
            }
            unneededSetBlockIndex = thisSetBlockIndex;
            unneededSetBlock = thisSetBlock;
        }
    }
    
    if (unneededSetBlockIndex == undefined || unneededSetBlock == undefined) return false;
    let replacementVar = unneededSetBlock.args[0];

    for (const u of usages) {
        optimizer.replaceArg(line, u.blockIndex, u.argIndex, replacementVar);
    }


    optimizer.spliceBlocks(line, unneededSetBlockIndex, 1);

    return true;
}