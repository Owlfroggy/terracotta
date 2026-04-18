import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { VariableScope } from "../../typeProcessor/typeProcessor.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock, IfBlock } from "../codeBlock.ts";
import { NumberValue, VariableValue } from "../codeValue.ts";

export const MATCH_FAILED = Symbol("Codeblock match failed");
export const ALL_IF_BLOCK_TYPES = [DFCodeblockName.IF_ENTITY, DFCodeblockName.IF_GAME, DFCodeblockName.IF_PLAYER, DFCodeblockName.IF_VARIABLE];

export enum ValueFilterType {
    /** Matches a temporary variable (but NOT a user variable) */
    TEMP_VAR,
    /** Matches a variable (could be a user variable or a temp variable) */
    VAR,
    /** Matches a number, value can optionally be specified */
    NUM,

}

export interface TempVarValueFilter {
    accepts: ValueFilterType.TEMP_VAR,
}

export interface VarValueFilter {
    accepts: ValueFilterType.VAR,
    name?: string,
    scope?: VariableScope,
}

export interface NumValueFilter {
    accepts: ValueFilterType.NUM,
    value?: string
}

export type CodeValueFilter = TempVarValueFilter | VarValueFilter | NumValueFilter;

/** Leaving any field unset will allow any value for that field */
export interface CodeBlockFilter {
    block?: DFCodeblockName | DFCodeblockName[],
    action?: string,
    args?: CodeValueFilter[]
}

export class CodeBlockMatcher {
    constructor(
        public line: CodeBlock[] = [],
        public index: number = 0,
    ) {}

    codeblock<T extends CodeBlock>(filter: CodeBlockFilter): [blockIndex: number, block: T] {
        // console.log("asdf", filter);
        let block = this.line[this.index] as T;
        if (filter.block != undefined) {
            if (Array.isArray(filter.block)) {
                if (!(filter.block.includes(block.block))) throw MATCH_FAILED;
            } else {
                if (block.block != filter.block) throw MATCH_FAILED;
            }
        }
    
        if (filter.action != undefined) {
            if (!(block instanceof ActionBlock)) throw MATCH_FAILED;
            if (block.action != filter.action) throw MATCH_FAILED;
        }

        
        if (filter.args != undefined) {
            if (!(block instanceof ActionBlock)) throw MATCH_FAILED;
            for (let i = 0; i < filter.args.length; i++) {
                let blockArg = block.args[i];
                let argFilter = filter.args[i];
    
                if (argFilter.accepts == ValueFilterType.TEMP_VAR) {
                    if (!(blockArg instanceof VariableValue)) throw MATCH_FAILED;
                    if (!blockArg.isTempVar) throw MATCH_FAILED;
                }
                else if (argFilter.accepts == ValueFilterType.VAR) {
                    if (!(blockArg instanceof VariableValue)) throw MATCH_FAILED;
                    if (argFilter.name != undefined && blockArg.name != argFilter.name) throw MATCH_FAILED;
                    if (argFilter.scope != undefined && blockArg.scope != argFilter.scope) throw MATCH_FAILED;
                }
                else if (argFilter.accepts == ValueFilterType.NUM) {
                    if (!(blockArg instanceof NumberValue)) throw MATCH_FAILED;
                    if (argFilter.value != undefined && blockArg.value != argFilter.value) throw MATCH_FAILED;
                }
            }
        }

        let blockIndex = this.index;
        this.index++;
        return [blockIndex, block]
    }
    
    bracket(type?: BracketType, dir?: BracketDirection): [blockIndex: number, block: BracketBlock] {
        let block = this.line[this.index];
        if (!(block instanceof BracketBlock)) throw MATCH_FAILED;
        if (type != undefined && block.type != type) throw MATCH_FAILED;
        if (dir != undefined && block.direction != dir) throw MATCH_FAILED;

        let blockIndex = this.index;
        this.index++;
        return [blockIndex, block]
    }
}
