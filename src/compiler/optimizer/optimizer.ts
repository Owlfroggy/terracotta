import { TypeProcessor, VariableId, VariableScope } from "../../typeProcessor/typeProcessor.ts";
import { CodeBlock } from "../codeBlock.ts";
import { CodeBlockMatcher, MATCH_FAILED } from "./matcher.ts";
import { OPT_condenseSingleCondition } from "./passes/condenseSingleCondition.ts";
import { OPT_condenseSetChain } from "./passes/condenseSetChain.ts";
import { VariableValue } from "../codeValue.ts";
import { Action } from "../../df/actiondump.ts";
import { DFValueType } from "../../df/constants.ts";

/**
 * @returns true if the line was changed
 */
type OptimizationPass = (line: CodeBlock[], optimizer: CodeOptimizer) => boolean;

const OPTIMIZATION_PASSES = [
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


    isVarPCondensable(variable: VariableValue, line: CodeBlock[]) {
        // this is temporary!
        // there should be much more sophisticated checking than this
        if (variable.scope != VariableScope.LINE) return false;
        if (typeof variable.name != "string") return false;
        return true;
    }

    actionIsSetter(actionDef: Action): boolean {
        if (!actionDef) return false;
        if (actionDef.parameters.length == 0) return false;
        let firstParam = actionDef.parameters[0].groups[0][0];
        if (!(firstParam.type == DFValueType.VARIABLE && firstParam.description == "Variable to set")) return false;
        return true;
    }

    optimize(line: CodeBlock[]) {
        this.matcher.line = line;
        for (const pass of OPTIMIZATION_PASSES) {
            this.runPass(line, pass);
        }
    }
}