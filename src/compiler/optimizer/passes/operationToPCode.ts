import { DFCodeblockName, DFValueType } from "../../../df/constants.ts";
import { ActionBlock, CodeBlock } from "../../codeBlock.ts";
import { CodeBlockMatcher, ValueFilterType } from "../matcher.ts";
import * as AD from "../../../df/actiondump.ts";
import { CodeOptimizer } from "../optimizer.ts";
import { NumberValue, VariableValue } from "../../codeValue.ts";
import { MathPCode, OperationPCode, PCode, PCodeOperation, SegmentPCode, VarPCode } from "../../../pcode/pcode.ts";
import { ensurePCodeness } from "../../../util/utils.ts";

/** Maps codeblock actions to their %code operators */
const numOprMap: Map<string, PCodeOperation> = new Map([
    ["+",PCodeOperation["+"]],
    ["-",PCodeOperation["-"]],
    ["x",PCodeOperation["*"]],
    ["/",PCodeOperation["/"]],
    ["%",PCodeOperation["%"]],
]);

export function OPT_operationToPCode(line: CodeBlock[], optimizer: CodeOptimizer): boolean {
    let [setBlockIndex, setBlock] = optimizer.matcher.codeblock<ActionBlock>({
        block: DFCodeblockName.SET_VARIABLE,
        args: [
            {accepts: ValueFilterType.TEMP_VAR}
        ]
    });


    // make sure this is a setter action that can be pcodeified
    let actionDef = AD.actions.get(setBlock.block)![setBlock.action];
    if (!optimizer.actionIsSetter(actionDef)) return false;

    let pcodeOpr = numOprMap.get(setBlock.action);
    if (pcodeOpr == undefined) return false;
    if (setBlock.action == "%" && !(
        setBlock.tags.length == 0
        || setBlock.tags[0].option == "Remainder"
    )) {
        return false;
    }

    // make sure all arguments are condensible
    for (const arg of setBlock.args) {
        if (!optimizer.isValuePCondensable(arg, line)) return false;
    }

    let varToReplace = setBlock.args[0];
    if (!(varToReplace instanceof VariableValue)) return false;
    let usages = optimizer.findVariableUsages(line, varToReplace.variableId, setBlockIndex+1);
    if (usages.length != 1) return false; //only condense if the var is used only once

    let codes: PCode[] = [];
    for (let i = 1; i < setBlock.args.length; i++) {
        let arg = setBlock.args[i];
        let expr: PCode[];
        if (arg instanceof NumberValue) {
            expr = ensurePCodeness(arg.value);
        }
        else if (arg instanceof VariableValue) {
            expr = [new VarPCode(ensurePCodeness(arg.name))];
        }
        else {
            throw new Error(`Cannot convert ${arg.constructor.name} to pcode`);
        }
        codes.push(...expr);
        if (i != setBlock.args.length-1) {
            codes.push(new OperationPCode(pcodeOpr));
        }
    }

    let replacement = new MathPCode(codes);
    let usage = usages[0];
    (line[usage.blockIndex] as ActionBlock).args[usage.argIndex] = new NumberValue([replacement]);
    line.splice(setBlockIndex,1);

    return true;
}