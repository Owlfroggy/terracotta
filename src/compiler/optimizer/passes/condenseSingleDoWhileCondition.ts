import { getDifferentiatedActionName } from "../../../df/actiondump.ts";
import { DFCodeblockName, TargetType } from "../../../df/constants.ts";
import { ActionBlock, BracketDirection, BracketType, CodeBlock, SubActionBlock } from "../../codeBlock.ts";
import { ALL_IF_BLOCK_TYPES, UNTARGETED_IF_BLOCK_TYPES, ValueFilterType } from "../matcher.ts";
import { CodeOptimizer } from "../optimizer.ts";

export function OPT_condenseSingleDoWhileCondition(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [runMarkerInitBlockIndex, runMarkerInitBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        action: "=",
        args: [{accepts: ValueFilterType.TEMP_VAR}, {accepts: ValueFilterType.NUM, value: "0"}]
    });
    let runMarkerVar = runMarkerInitBlock.args[0];

    let [repeatBlockIndex, repeatBlock] = optimizer.matcher.codeblock<SubActionBlock>({
        block: DFCodeblockName.REPEAT,
        action: "Forever"
    })
    optimizer.matcher.bracket(BracketType.REPEAT, BracketDirection.OPEN);

    // check for the thing around the breaker that skips the first iteration
    let [spliceStartIndex, spliceStartBlock] = optimizer.matcher.codeblock({
        block: DFCodeblockName.IF_VARIABLE,
        action: "=",
        args: [runMarkerVar, {accepts: ValueFilterType.NUM, value: "1"}],
    })
    optimizer.matcher.bracket(BracketType.IF, BracketDirection.OPEN);
        
        // check for a breaker condition that's only one condition
        let [ifBlockIndex, ifBlock] = optimizer.matcher.codeblock<ActionBlock>({
                block: ALL_IF_BLOCK_TYPES,
            }); 
        if (ifBlock.target != TargetType.UNSET) return false // targeted if blocks cannot be condensed since target information would be lost
        optimizer.matcher.bracket(BracketType.IF, BracketDirection.OPEN);
            optimizer.matcher.codeblock({
                block: DFCodeblockName.CONTROL,
                action: "StopRepeat",
            })
        optimizer.matcher.bracket(BracketType.IF, BracketDirection.CLOSE);

    optimizer.matcher.bracket(BracketType.IF, BracketDirection.CLOSE);

    // check for the thing that sets the run marker to true
    let [spliceEndIndex, spliceEndBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        action: "=",
        args: [{accepts: ValueFilterType.TEMP_VAR}, {accepts: ValueFilterType.NUM, value: "1"}]
    });


    // copy args from breaker condition to repeat block
    for (let argIndex = 0; argIndex < ifBlock.args.length; argIndex++) {
        optimizer.replaceArg(line, repeatBlockIndex, argIndex, ifBlock.args[argIndex]);
    }
    // set as while and copy action 
    repeatBlock.action = "DoWhile";
    repeatBlock.subAction = getDifferentiatedActionName(ifBlock.block, ifBlock.action);
    // invert condition back to its original form
    repeatBlock.not = !ifBlock.not;

    // remove breaker condition and the if statement enclosing it
    optimizer.spliceBlocks(line, spliceStartIndex, spliceEndIndex-spliceStartIndex+1);
    // remove run marker initializer
    optimizer.spliceBlocks(line, runMarkerInitBlockIndex, 1);


    return true;
}