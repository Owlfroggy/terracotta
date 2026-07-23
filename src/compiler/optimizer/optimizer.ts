import { TypeProcessor, VariableId, VariableScope } from "../../typeProcessor/typeProcessor.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeBlockMatcher, MATCH_FAILED } from "./matcher.ts";
import { OPT_condenseSingleCondition } from "./passes/condenseSingleCondition.ts";
import { OPT_condenseSetChain } from "./passes/condenseSetChain.ts";
import { CodeValue, NumberValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { Action, actions, isParamGroupValueSetter } from "../../df/actiondump.ts";
import { DFCodeblockName, DFValueType } from "../../df/constants.ts";
import { OPT_operationToPCode } from "./passes/operationToPCode.ts";
import { PCode, VarPCode } from "../../pcode/pcode.ts";
import { profile, profileEnd } from "node:console";
import { MultiValueTypeData, Type } from "../../typeProcessor/type.ts";
import { OPT_condenseSingleWhileCondition } from "./passes/condenseSingleWhileCondition.ts";
import { OPT_condenseSingleDoWhileCondition } from "./passes/condenseSingleDoWhileCondition.ts";
import { OPT_condenseSingleSelectFilter } from "./passes/condenseSingleSelectFilter.ts";
import { OPT_condenseSelectCreation } from "./passes/condenseSelectCreation.ts";

/**
 * @returns true if the line was changed
 */
type OptimizationPass = (line: CodeBlock[], optimizer: CodeOptimizer) => boolean;

interface VariableUsage {
    blockIndex: number,
    argIndex: number,
    pcodePath?: (string | number)[],
}

const OPTIMIZATION_PASSES = [
    OPT_operationToPCode,
    OPT_condenseSetChain,
    OPT_condenseSingleCondition,
    OPT_condenseSingleWhileCondition,
    OPT_condenseSingleDoWhileCondition,
    OPT_condenseSingleSelectFilter,
    OPT_condenseSelectCreation,
]

export class CodeOptimizer {
    public matcher: CodeBlockMatcher = new CodeBlockMatcher();

    public variableUsages: Map<VariableId, VariableUsage[]> = new Map();

    constructor(
        public typeProcessor: TypeProcessor,
        /** This will optimize in-place, meaning the original arrays and codeblocks will be modified */
    ) {}

    //=-----------------------------------=\\
    //=- codeline modification functions -=\\
    //=-----------------------------------=\\
    // passes should only modify codelines through these functions
    // so that variable usages can be properly tracked

    public replacePCode(block: ActionBlock, blockIndex: number, argIndex: number, pcodePath: (string | number)[], newPCode: PCode) {
        // remove arg usages
        this.removeArgVariableUsages(block, blockIndex, argIndex);

        let argToModify = block.args[argIndex] as NumberValue;
        let pcodeToModify: PCode[] | PCode = argToModify.value as PCode[];
        for (let i = 0; i < pcodePath.length-1; i++) {
            pcodeToModify = pcodeToModify[pcodePath[i]];
        }
        pcodeToModify[pcodePath[pcodePath.length-1]] = newPCode;

        // add new arg usages
        let newUsages = this.getArgumentVariableUsages(argToModify, blockIndex, argIndex);
        for (const [varId, newUsage] of newUsages) {
            this.variableUsages.getOrInsert(varId, []).push(newUsage);
        }
    }

    public replaceArg(line: CodeBlock[], blockIndex: number, argIndex: number, newArg: TangibleValue) {
        let block = line[blockIndex] as ActionBlock;

        // remove old variable usages
        this.removeArgVariableUsages(block, blockIndex, argIndex)

        // replace arg
        block.args[argIndex] = newArg;

        // add new variable usages
        let newUsages = this.getArgumentVariableUsages(newArg, blockIndex, argIndex);
        for (const [varId, newUsage] of newUsages) {
            this.variableUsages.getOrInsert(varId, []).push(newUsage);
        }
    }

    public spliceBlocks(line: CodeBlock[], index: number, deleteCount: number, ...replaceWith: CodeBlock[]) {
        // remove old variable usages
        for (let blockIndex = index; blockIndex < index+deleteCount; blockIndex++) {
            let block = line[blockIndex];
            if (block instanceof ActionBlock) {
                for (let argIndex = 0; argIndex < block.args.length; argIndex++) {
                    this.removeArgVariableUsages(block, blockIndex, argIndex);
                }
            }
        }

        // shift all later var usages
        for (const usages of this.variableUsages.values()) {
            for (const u of usages) {
                if (u.blockIndex >= index + deleteCount) {
                    u.blockIndex += replaceWith.length - deleteCount;
                }
            }
        }

        // add new variable usages
        for (let i = 0; i < replaceWith.length; i++) {
            let usages = this.getBlockVariableUsages(replaceWith[i], index+i);
            for (const [varId, u] of usages) {
                this.variableUsages.getOrInsert(varId,[]).push(u);
            }
        }

        // splice blocks
        line.splice(index, deleteCount, ...replaceWith);
    }

    private removeArgVariableUsages(block: ActionBlock, blockIndex: number, argIndex: number) {
        let usages = this.getArgumentVariableUsages(block.args[argIndex], blockIndex, argIndex);
        for (const [varId, _] of usages) {
            let currentUsages = this.variableUsages.getOrInsert(varId,[]);
            for (let i = currentUsages.length-1; i >= 0; i--) {
                if (currentUsages[i].blockIndex == blockIndex && currentUsages[i].argIndex == argIndex) {
                    currentUsages.splice(i,1);
                }
            }
        }
    }

    //=----------------------------=\\
    //=- variable usage internals -=\\
    //=----------------------------=\\

    private getPCodeVariableUsages(pcode: PCode | PCode[], blockIndex: number, argIndex: number): [VariableId, VariableUsage][] {
        let usages: [VariableId, VariableUsage][] = [];
        let paths: (string | number)[][] = [];
        let values: VarPCode[] = [];
        // TODO: update this condition to take user-created %vars() into account
        this.searchPCode(
            pcode, 
            pcode => (pcode instanceof VarPCode),
            paths, values
        );
        for (let i = 0; i < paths.length; i++) {
            let varId = values[i].varId;
            if (varId) {
                usages.push([varId, {blockIndex, argIndex, pcodePath: paths[i]}]);
            }
        }
        return usages;
    }

    private getArgumentVariableUsages(arg: CodeValue, blockIndex: number, argIndex: number): [VariableId, VariableUsage][] {
        let usages: [VariableId, VariableUsage][] = [];
        if (arg instanceof VariableValue) {
            usages.push([arg.getVarId(), {blockIndex, argIndex}]);
        }
        else if (arg instanceof NumberValue && typeof arg.value != "string") {
            usages.push(...this.getPCodeVariableUsages(arg.value, blockIndex, argIndex));
        }
        return usages;
    }

    private getBlockVariableUsages(block: CodeBlock, blockIndex: number): [VariableId, VariableUsage][] {
        if (block instanceof ActionBlock) {
            return block.args.flatMap((v, i) => this.getArgumentVariableUsages(v, blockIndex, i));
        } else {
            return [];
        }
    }

    private initializeVariableUsages(line: CodeBlock[]) {
        this.variableUsages.clear();
        for (let i = 0; i < line.length; i++) {
            let block = line[i];
            if (!(block instanceof ActionBlock)) continue;
            for (const [varId, usage] of this.getBlockVariableUsages(block, i)) {
                this.variableUsages.getOrInsert(varId, []).push(usage);
            }
        }
    }

    //=-------------=\\
    //=- internals -=\\
    //=-------------=\\


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

    /**
     * NOTE: if a pcode matches `filter`, its children will NOT be searched
     */
    private searchPCode(code: PCode[] | PCode, filter: (PCode) => boolean, matchPaths: (string | number)[][], matchValues: PCode[], workingPath: (string | number)[] = []) {
        if (Array.isArray(code)) {
            for (let i = 0; i < code.length; i++) {
                workingPath.push(i)
                this.searchPCode(code[i], filter, matchPaths, matchValues, workingPath);
                workingPath.pop();
            }
        } else if (code instanceof PCode) {
            if (filter(code)) {
                // match found! record its path
                matchPaths.push([...workingPath]);
                matchValues.push(code);
                return;
            } 

            for (let [key, value] of Object.entries(code)) {
                workingPath.push(key)
                this.searchPCode(value, filter, matchPaths, matchValues, workingPath);
                workingPath.pop();
            }
        }
    }

    isValuePCondensable(value: CodeValue, line: CodeBlock[]) {
        // this is temporary!
        // there should be much more sophisticated checking than this
        if (value instanceof VariableValue) {
            if (value.scope != VariableScope.LINE) return false;
            if (typeof value.name != "string") return false;
            let valType = value.getType(this.typeProcessor);
            if (!(valType.matches(Type.num) || valType.matches(Type.str))) return false;
            return true;
        }
        else if (value instanceof NumberValue) {
            return true;
        }
        return false;
    }

    slotIsSetter(block: ActionBlock, slot: number): boolean {
        if (block.block == DFCodeblockName.CALL_FUNCTION) {
            let funcDef = this.typeProcessor.getUserFuncDef(false, block.action, true)!;
            let returnType = funcDef.defaultReturnType // TODO: make this not use defaultReturnType
            if (returnType.matches(Type.void)) {
                return false;
            } else if (returnType.matches(Type.multivalue)) {
                return slot < (returnType.data as MultiValueTypeData).types.length;
            } else {
                return slot == 0;
            }
        } else {
            let actionDef = actions.get(block.block)?.[block.action];
            // handle destructure as a special case since its so special
            if (actionDef == actions.get(DFCodeblockName.SET_VARIABLE)!.DestructureList) {
                return slot > 0;
            } else if (actionDef) {
                if (actionDef.parameters.length <= slot) return false;
                let param = actionDef.parameters[slot].groups[0][0];
                return isParamGroupValueSetter(param);
            } else {
                return false;
            }
        }
    }
    
    /**
     * @param startIndex inclusive
     */
    findVariableUsages(line: CodeBlock[], varId: VariableId, startIndex: number = 0): VariableUsage[] {
        if (!this.variableUsages.has(varId)) return [];
        let usages = this.variableUsages.get(varId)!;

        if (startIndex == 0) return usages;

        return usages.filter(u => u.blockIndex >= startIndex);
    }

    optimize(line: CodeBlock[]) {
        this.initializeVariableUsages(line);
        this.matcher.line = line;
        for (const pass of OPTIMIZATION_PASSES) {
            this.runPass(line, pass);
        }
    }
}