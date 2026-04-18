import { DFCodeblockName } from "../../../df/constants.ts";
import { VariableScope } from "../../../typeProcessor/typeProcessor.ts";
import { ActionBlock, BracketDirection, BracketType, CodeBlock, IfBlock } from "../../codeBlock.ts";
import { VariableValue } from "../../codeValue.ts";
import { ALL_IF_BLOCK_TYPES, CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import { CodeOptimizer } from "../optimizer.ts";

export function OPT_condenseSingleCondition(line: CodeBlock[], matcher: CodeBlockMatcher): boolean {
    let [spliceStartIndex, tempVarInitializer] = matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        action: "=",
        args: [
            {accepts: ValueFilterType.TEMP_VAR},
            {accepts: ValueFilterType.NUM, value: "0"}
        ]
    });
    const conditionTempVarPattern = {
        accepts: ValueFilterType.VAR, 
        scope: VariableScope.LINE,
        name: (tempVarInitializer.args[0] as VariableValue).name, 
    };


    let [userIfBlockIndex, userIfBlock] = matcher.codeblock<IfBlock>({
        block: ALL_IF_BLOCK_TYPES,
    }); 

    matcher.bracket(BracketType.IF, BracketDirection.OPEN);

        matcher.codeblock({
            block: DFCodeblockName.SET_VARIABLE,
            action: "=",
            args: [
                conditionTempVarPattern,
                {accepts: ValueFilterType.NUM, value: "1"}
            ]
        })

    matcher.bracket(BracketType.IF, BracketDirection.CLOSE);

    let [spliceEndIndex, internalIfBlock] = matcher.codeblock({
        block: DFCodeblockName.IF_VARIABLE,
        action: "!=",
        args: [
            conditionTempVarPattern,
            {accepts: ValueFilterType.NUM, value: "0"}
        ]
    })

    matcher.bracket(BracketType.IF, BracketDirection.OPEN);

    line.splice(spliceStartIndex, spliceEndIndex-spliceStartIndex+1, userIfBlock);
    return true;
}