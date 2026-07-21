import { getDifferentiatedActionName } from "../../../df/actiondump.ts";
import { DFCodeblockName, TargetType } from "../../../df/constants.ts";
import { ActionBlock, BracketDirection, BracketType, CodeBlock, SubActionBlock } from "../../codeBlock.ts";
import { ALL_IF_BLOCK_TYPES, UNTARGETED_IF_BLOCK_TYPES, ValueFilterType } from "../matcher.ts";
import { CodeOptimizer } from "../optimizer.ts";

export function OPT_condenseSingleSelectFilter(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [initializerIndex, initializerBlock] = optimizer.matcher.codeblock({
        block: DFCodeblockName.SET_VARIABLE,
        action: "=",
        args: [{accepts: ValueFilterType.TEMP_VAR}, {accepts: ValueFilterType.NUM, value: "0"}]
    });

    // filter conditio 
    let [ifBlockIndex, ifBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: ALL_IF_BLOCK_TYPES,
    }); 
    if (ifBlock.target != TargetType.UNSET) return false // targeted if blocks cannot be condensed since target information would be lost
    optimizer.matcher.bracket(BracketType.IF, BracketDirection.OPEN);
        optimizer.matcher.codeblock({
            block: DFCodeblockName.SET_VARIABLE,
            action: "=",
            args: [{accepts: ValueFilterType.TEMP_VAR}, {accepts: ValueFilterType.NUM, value: "1"}],
            not: false,
        });
    let [spliceEndIndex, _] = optimizer.matcher.bracket(BracketType.IF, BracketDirection.CLOSE);
    let [filterIndex, filterBlock] = optimizer.matcher.codeblock<SubActionBlock>({
        block: DFCodeblockName.SELECT_OBJECT,
        action: "FilterCondition",
        subAction: "!=",
    })

    // copy args from condition to filter block
    for (let argIndex = 0; argIndex < 27; argIndex++) {
        optimizer.replaceArg(line, filterIndex, argIndex, ifBlock.args[argIndex]);
    }
    // copy action to filter block
    filterBlock.subAction = getDifferentiatedActionName(ifBlock.block, ifBlock.action);
    filterBlock.subActionBlockType = ifBlock.block;
    // copy tags to filter block
    filterBlock.tags = ifBlock.tags;
    // remove now-redundant condition code
    optimizer.spliceBlocks(line, initializerIndex, spliceEndIndex-initializerIndex+1);

    return true;
}