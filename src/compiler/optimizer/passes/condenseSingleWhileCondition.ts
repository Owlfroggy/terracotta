import { getDifferentiatedActionName } from "../../../df/actiondump.ts";
import { DFCodeblockName } from "../../../df/constants.ts";
import { ActionBlock, BracketDirection, BracketType, CodeBlock, SubActionBlock } from "../../codeBlock.ts";
import { VariableValue } from "../../codeValue.ts";
import { ALL_IF_BLOCK_TYPES, CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import { CodeOptimizer } from "../optimizer.ts";

export function OPT_condenseSingleWhileCondition(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [repeatBlockIndex, repeatBlock] = optimizer.matcher.codeblock<SubActionBlock>({
        block: DFCodeblockName.REPEAT,
        action: "Forever"
    })
    optimizer.matcher.bracket(BracketType.REPEAT, BracketDirection.OPEN);
        
    // check for a breaker condition that's only one condition
    let [ifBlockIndex, ifBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: ALL_IF_BLOCK_TYPES,
    }); 
    optimizer.matcher.bracket(BracketType.IF, BracketDirection.OPEN);
        optimizer.matcher.codeblock({
            block: DFCodeblockName.CONTROL,
            action: "StopRepeat",
        })
    let [spliceEndIndex, _] = optimizer.matcher.bracket(BracketType.IF, BracketDirection.CLOSE);

    // copy args from breaker condition to repeat block
    for (let argIndex = 0; argIndex < ifBlock.args.length; argIndex++) {
        optimizer.replaceArg(line, repeatBlockIndex, argIndex, ifBlock.args[argIndex]);
    }
    // set as while and copy action 
    repeatBlock.action = "While";
    repeatBlock.subAction = getDifferentiatedActionName(ifBlock.block, ifBlock.action);
    // invert condition back to its original form
    repeatBlock.not = !ifBlock.not;

    // remove said breaker condition
    optimizer.spliceBlocks(line, ifBlockIndex, spliceEndIndex-ifBlockIndex+1);

    return true;
}