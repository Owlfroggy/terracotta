import { getDifferentiatedActionName } from "../../../df/actiondump.ts";
import { DFCodeblockName, TargetType } from "../../../df/constants.ts";
import { ActionBlock, BracketDirection, BracketType, CodeBlock, SubActionBlock } from "../../codeBlock.ts";
import { ALL_IF_BLOCK_TYPES, UNTARGETED_IF_BLOCK_TYPES, ValueFilterType } from "../matcher.ts";
import { CodeOptimizer } from "../optimizer.ts";

export function OPT_condenseSelectCreation(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [creatorIndex, creatorBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SELECT_OBJECT,
    })

    let [filterIndex, filterBlock] = optimizer.matcher.codeblock<SubActionBlock>({
        block: DFCodeblockName.SELECT_OBJECT,
        action: "FilterCondition",
    })

    let splice = false;
    if (creatorBlock.action == "AllPlayers") {
        filterBlock.action = "PlayersCond";
        splice = true;
    } else if (creatorBlock.action == "AllEntities") {
        filterBlock.action = "EntitiesCond";
        splice = true;
    }
    if (!splice) return false;

    optimizer.spliceBlocks(line, creatorIndex, 1);

    return true;
}