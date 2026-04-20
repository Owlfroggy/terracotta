import { TypeProcessor, VariableId, VariableScope } from "../../typeProcessor/typeProcessor.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeBlockMatcher, MATCH_FAILED } from "./matcher.ts";
import { OPT_condenseSingleCondition } from "./passes/condenseSingleCondition.ts";
import { OPT_condenseSetChain } from "./passes/condenseSetChain.ts";
import { CodeValue, NumberValue, VariableValue } from "../codeValue.ts";
import { Action } from "../../df/actiondump.ts";
import { DFValueType } from "../../df/constants.ts";
import { OPT_operationToPCode } from "./passes/operationToPCode.ts";

/**
 * @returns true if the line was changed
 */
type OptimizationPass = (line: CodeBlock[], optimizer: CodeOptimizer) => boolean;

interface VariableUsage {
    blockIndex: number,
    argIndex: number,
}

const OPTIMIZATION_PASSES = [
    OPT_operationToPCode,
    OPT_condenseSetChain,
    OPT_condenseSingleCondition,
]

export class CodeOptimizer {
    public matcher: CodeBlockMatcher = new CodeBlockMatcher();

    constructor(
        public typeProcessor: TypeProcessor,
        /** This will optimize in-place, meaning the original arrays and codeblocks will be modified */
    ) {}

    /** 
     * Tries running the pass on every block in the line.
     * Will continue to loop through the array until no more changes are made.
     * */
    private runPass(line: CodeBlock[], pass: OptimizationPass) {
        let changes: number;
        do {
            changes = 0;

            for (let i = 0; i < line.length; i++) {
                this.matcher.index = i;
                try {
                    let changed = pass(line, this);
                    if (changed) changes++;
                } catch (e) {
                    if (e != MATCH_FAILED) throw e;
                }
            }

        } while (changes > 0)
    }


    isValuePCondensable(value: CodeValue, line: CodeBlock[]) {
        // this is temporary!
        // there should be much more sophisticated checking than this
        if (value instanceof VariableValue) {
            if (value.scope != VariableScope.LINE) return false;
            if (typeof value.name != "string") return false;
            return true;
        }
        else if (value instanceof NumberValue) {
            return true;
        }
        return false;
    }

    actionIsSetter(actionDef: Action): boolean {
        if (!actionDef) return false;
        if (actionDef.parameters.length == 0) return false;
        let firstParam = actionDef.parameters[0].groups[0][0];
        if (!(firstParam.type == DFValueType.VARIABLE && firstParam.description == "Variable to set")) return false;
        return true;
    }

    // TODO: also search pcodes
    /**
     * @param startIndex inclusive
     */
    findVariableUsages(line: CodeBlock[], varId: VariableId, startIndex: number): VariableUsage[] {
        let usages: VariableUsage[] = [];
        for (let i = startIndex; i < line.length; i++) {
            let block = line[i];
            if (!(block instanceof ActionBlock)) continue;
            for (let a = 0; a < block.args.length; a++) {
                let arg = block.args[a];
                if (!(arg instanceof VariableValue)) continue;
                if (arg.variableId == varId) {
                    usages.push({blockIndex: i, argIndex: a});
                }
            }
        }
        return usages;
    }

    optimize(line: CodeBlock[]) {
        this.matcher.line = line;
        for (const pass of OPTIMIZATION_PASSES) {
            this.runPass(line, pass);
        }
    }
}