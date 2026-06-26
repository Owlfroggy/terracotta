/**
 * note: "physical blocks" are minecraft blocks, so most codeblocks are two physical blocks long
 * also, due to the nature of codeline splitting, it is not safe to use control:ReturnNTimes on a plot with split codelines
 */

import { checkPrime } from "node:crypto";
import { DFCodeblockName, TC_HEADER } from "../df/constants.ts";
import { EntryPCode, IndexPCode, MathPCode, PCode, SegmentPCode, VarPCode } from "../pcode/pcode.ts";
import { PCodeParser } from "../pcode/pcodeParser.ts";
import { VariableScope } from "../typeProcessor/typeProcessor.ts";
import { ActionBlock, BracketBlock, BracketDirection, CodeBlock, ElseBlock, EventBlock } from "./codeBlock.ts";
import { NumberValue, ParameterValue, StringValue, StyledTextValue, VariableValue } from "./codeValue.ts";

/**the maximum number of line vars that can be shared between the parent codeline and a slice */
export const MAX_LINE_VARS = 26;
export const pcodeParser = new PCodeParser();

interface InProgressSlice {
    blocks: CodeBlock[],
    variables: {[key: string]: number},
    physicalLength: number,
    startIndex: number
}

interface Chunk {
    blocks: CodeBlock[],
    variables: {[key: string]: number},
    hasNonConstantVarNames?: boolean,
    physicalLength: number,
    startIndex: number,
    contentRanges?: [number,number][] //start and end are INCLUSIVE!!!
}

export function GetPhysicalLength(codeblock) {
    if (
        (codeblock instanceof BracketBlock && (codeblock as BracketBlock).direction == BracketDirection.OPEN)
        || (codeblock instanceof ActionBlock 
            && (
                codeblock.block == DFCodeblockName.REPEAT
                || codeblock.block == DFCodeblockName.IF_ENTITY
                || codeblock.block == DFCodeblockName.IF_GAME
                || codeblock.block == DFCodeblockName.IF_PLAYER
                || codeblock.block == DFCodeblockName.IF_VARIABLE
            )
        )
        || (codeblock instanceof ElseBlock)
    ) {
        return 1;
    } else {
        return 2;
    }
}

export function GetAllVariables(pcode: PCode[] | string): string[] {
    if (typeof pcode == "string") {
        let [errors, parsed] = pcodeParser.parse(pcode)
        pcode = parsed;
    }
    else if (pcode instanceof MathPCode) {
        pcode = pcode.expr;
    }
    let results: string[] = [];

    // if (pcode.length > 1 || !(pcode[0] instanceof SegmentPCode)) console.log(`> ${pcode.join("")}`)
    for (const c of pcode) {
        if (c instanceof VarPCode) {
            // console.log(`adding var! ${c.name.join("")}`);
            results.push(c.name.join(""));
        }
        else if (c instanceof MathPCode) {
            results.push(...GetAllVariables(c.expr));
        }
        else if (c instanceof IndexPCode || c instanceof EntryPCode) {
            if (c.args.length >= 1) {
                results.push(c.args[0].join(""));
                // console.log(`adding var! ${c.args[0].join("")}`);
                for (let i = 1; i < c.args.length; i++) {
                    results.push(...GetAllVariables(c.args[i]))
                }
            }
        }
    };

    return results;
}

/**WILL MODIFY `inputCodeLine`!!*/
export function SliceCodeLine(inputCodeLine: CodeBlock[], maxLineLength: number): CodeBlock[][] {
    if (maxLineLength < 14) {
        throw Error("maxLineLength cannot be less than 14");
    }

    let mainLine = [...inputCodeLine];
    let slicesByName: {[key: string]: CodeBlock[]} = {};
    let sliceCount: number = 0;

    //get header information
    let firstBlock = mainLine[0] as EventBlock | ActionBlock;
    let firstBlockType = firstBlock.block;

    if (!(firstBlockType == DFCodeblockName.FUNCTION || firstBlockType == DFCodeblockName.PROCESS || firstBlock instanceof EventBlock)) {
        throw Error("Cannot slice codeline that does not begin with a header block (process, function, or event)");
    }
    let headerName: string;
    let headerType: "P" | "F" | "EE" | "PE" | "GE";
    if (firstBlock instanceof EventBlock) {
        headerName = firstBlock.action;
        headerType = (
            firstBlock.block == DFCodeblockName.PLAYER_EVENT ? "PE"
            : firstBlock.block == DFCodeblockName.ENTITY_EVENT ? "EE"
            : "GE"
        );
    } else {
        headerName = firstBlock.action;
        headerType = firstBlock.block == DFCodeblockName.PROCESS ? "P" : "F";
    }

    /**returns true if any vars have %var() in their name */
    function addVariablesFromBlock(block: ActionBlock, to: {[key: string]: number}): boolean {
        let hasNonConstantVarNames = false;

        function addVariableName(name: string | PCode[]) {
            let pcodeName: PCode[];
            let stringName: string;
            if (typeof name == "string") {
                let [errors, tokenizedName] = pcodeParser.parse(name);
                pcodeName = tokenizedName;
                stringName = name;
            } else {
                pcodeName = name;
                stringName = pcodeName.join("");
            }

            if (pcodeName.length > 1 || (pcodeName.length == 1 && !(pcodeName[0] instanceof SegmentPCode))) {
                hasNonConstantVarNames = true;

                GetAllVariables(name).forEach(addVariableName);
            }

            if (to[stringName] == undefined) { to[stringName] = 0; }
            to[stringName]! += 1;
        }

        if (block.block == DFCodeblockName.CALL_FUNCTION || block.block == DFCodeblockName.START_PROCESS) {
            GetAllVariables(block.action).forEach(addVariableName);
        }

        block.args.forEach(arg => {
            if (arg instanceof VariableValue) {
                if (arg.scope == VariableScope.LINE) {
                    addVariableName(arg.name);
                } else {
                    GetAllVariables(arg.name).forEach(addVariableName);
                }
            } 
            
            else if (arg instanceof NumberValue || arg instanceof StringValue || arg instanceof StyledTextValue) {
                // if (Array.isArray(arg)) {
                //     function recurse(token: PCode) {
                //         if (token instanceof VarPCode) {
                //             addVariableName(token.name);
                //         }
                //         else if (token instanceof MathPCode) {
                //             token.expr.forEach(recurse);
                //         }
                //     }
                //     arg.forEach(recurse);
                // }
                GetAllVariables(arg.value).forEach(addVariableName);
            }
        })

        return hasNonConstantVarNames;
    }

    function getChunk(startIndex: number): Chunk {
        let mode: "block" | "bracketed" = mainLine[startIndex+1] instanceof BracketBlock && (mainLine[startIndex+1] as BracketBlock).direction == BracketDirection.OPEN ? "bracketed" : "block"
        if (mode == "block") {          
            let variables = {}
            let hasNonConstantVarNames: boolean = false
            if (mainLine[startIndex] instanceof ActionBlock) {
                hasNonConstantVarNames = addVariablesFromBlock(mainLine[startIndex],variables)
            }
            return {
                blocks: [mainLine[startIndex]],
                variables: variables,
                hasNonConstantVarNames: hasNonConstantVarNames,
                physicalLength: GetPhysicalLength(mainLine[startIndex]),
                startIndex: startIndex
            }
        }
        

        let variables = {}
        let hasNestedVarCodes: boolean = false
        if (mainLine[startIndex] instanceof ActionBlock) {
            hasNestedVarCodes = addVariablesFromBlock(mainLine[startIndex],variables)
        }

        let chunk: Chunk = {
            blocks: [mainLine[startIndex],mainLine[startIndex+1]],
            variables: variables,
            hasNonConstantVarNames: hasNestedVarCodes,
            physicalLength: 2,
            startIndex: startIndex,
            contentRanges: []
        }
        
        let rangeNum = 0
        let i = startIndex + 2
        let going = true
        while (going) {
            chunk.contentRanges![rangeNum] = [i,i]
            while (i < mainLine.length && !(mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).direction == BracketDirection.CLOSE)) {
                let thisChunk = getChunk(i)
                chunk.blocks.push(...thisChunk.blocks)
                chunk.physicalLength += thisChunk.physicalLength
                if (thisChunk.hasNonConstantVarNames) {chunk.hasNonConstantVarNames = true}
                Object.keys(thisChunk.variables).forEach(name => {
                    if (chunk.variables[name] == undefined) {chunk.variables[name] = 0}
                    chunk.variables[name] += thisChunk.variables[name]!
                })
                i += thisChunk.blocks.length
            }

            //add closing bracket to chunk
            chunk.blocks.push(mainLine[i])
            chunk.physicalLength += 2
            chunk.contentRanges![rangeNum][1] = i-1

            //add else and its opening bracket to chunk
            if (mainLine[i+1] instanceof ElseBlock) {
                going = true
                chunk.blocks.push(mainLine[i+1],mainLine[i+2])
                chunk.physicalLength += 2
                i += 3
            } else {
                going = false
            }

            rangeNum++
        }

        return chunk
    }

    function sliceAlgorithm(startIndex: number) {
        let currentSlice: InProgressSlice = {
            blocks: [],
            variables: {},
            physicalLength: 0,
            startIndex: startIndex
        }
        let i = startIndex - 1

        function applyCurrentSlice() {
            if (currentSlice.blocks.length > 1) {
                let sliceName = `${TC_HEADER}SLC_${headerType}_${sliceCount}_${headerName}`
    
                let callBlock = new ActionBlock(DFCodeblockName.CALL_FUNCTION, {action: sliceName});
                let headerBlock = new ActionBlock(DFCodeblockName.FUNCTION, {action: sliceName});

                Object.keys(currentSlice.variables).forEach(name => {
                    callBlock.args.push(new VariableValue(name, VariableScope.LINE))
                    headerBlock.args.push(new ParameterValue(name,"var",false,false,null))
                });

                //edit main line
                mainLine.splice(currentSlice.startIndex, currentSlice.blocks.length, callBlock)
    
                i -= currentSlice.blocks.length
    
                //create new slice
                currentSlice.blocks.unshift(headerBlock)
                sliceCount++
                slicesByName[sliceName] = currentSlice.blocks
            }
            else {
                i -= 1
            }


            currentSlice = {
                blocks: [],
                variables: {},
                physicalLength: 0,
                startIndex: i + 1
            }
        }

        while (i < mainLine.length) {
            i++
            let chunk = getChunk(i)

            if (chunk.contentRanges) {
                //slice
                for (let chunkNum = 0; chunkNum < chunk.contentRanges!.length; chunkNum++) {
                    sliceAlgorithm(chunk.contentRanges![chunkNum][0])
                    //redo chunk data since length and blocks and stuff have changed
                    chunk = getChunk(i)
                }
            }

            //if hitting a closing bracket, apply current slice and dont go any further
            if (mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).direction == BracketDirection.CLOSE) {
                applyCurrentSlice()
                return
            }
            //if this chunk by itself is unqualified to be a slice, apply current slice and skip it
            else if (chunk.physicalLength > maxLineLength - 2 || Object.keys(chunk.variables).length > MAX_LINE_VARS || chunk.hasNonConstantVarNames) {
                applyCurrentSlice()
                i += chunk.blocks.length
                currentSlice.startIndex = i + 1
            } 
            //if this chunk would invalidate the current slice but can be in its own slice, apply current slice but let offending chunk be part of the next one
            else if (currentSlice.physicalLength + chunk.physicalLength > maxLineLength - 2 || Object.keys(currentSlice.variables).length + Object.keys(chunk.variables).length > MAX_LINE_VARS) {
                applyCurrentSlice()
            }
            //otherwise add this chunk to the slice
            else {
                currentSlice.blocks.push(...chunk.blocks)
                currentSlice.physicalLength += chunk.physicalLength
                Object.keys(chunk.variables).forEach(name => {
                    if (currentSlice.variables[name] == undefined) {currentSlice.variables[name] = 0}
                    currentSlice.variables[name] += 1
                })
                i += chunk.blocks.length - 1
            }
        }
    }

    //returns: [physicalLength, callBlocks]
    function getLineInfo(line: CodeBlock[]): [number, [number,ActionBlock][]] {
        let callBlocks: [number,ActionBlock][] = []
        let physicalLength = 0
        let blockIndex = 0
        line.forEach(block => {
            if (block instanceof ActionBlock) {
                if (block.block == DFCodeblockName.CALL_FUNCTION) {
                    callBlocks.push([blockIndex,block])
                }
            }
            physicalLength += GetPhysicalLength(block)
            blockIndex++
        })
        
        return [physicalLength, callBlocks]
    }
    
    //= aggressively compress as much as possible =\\
    let lastSliceCount = 0
    let parentPhysicalLength: number
    let parentCallBlocks: [number,ActionBlock][]
    while (true) {
        parentPhysicalLength = 0
        let blockIndex = 0

        ;[parentPhysicalLength, parentCallBlocks] = getLineInfo(mainLine)

        if (parentPhysicalLength <= maxLineLength) { break }

        sliceAlgorithm(1)

        if (sliceCount == lastSliceCount) {
            throw new Error("Could not automatically split line")
        }
        lastSliceCount = sliceCount
    }

    //= re-inflate templates back on to higher lines if said higher lines have space for them =\\

    type SliceEntry = {
        callIndex: number, 
        name: string, 
        line: CodeBlock[], 
        callBlocks: [number,ActionBlock][], //number is index in the slice that this block appears
        parent?: SliceEntry, 
        physicalLength: number, 
        depth: number,
    }
    
    let parentSliceEntry: SliceEntry = {name: headerName, line: mainLine, callIndex: 0, physicalLength: parentPhysicalLength, callBlocks: parentCallBlocks, depth: -1}

    let sliceEntriesByDepth: SliceEntry[][] = []
    let sliceEntriesByParent: Map<SliceEntry,SliceEntry[]> = new Map()
    let sliceEntriesByName: {[key: string]: SliceEntry} = {}

    sliceEntriesByDepth[-1] = [parentSliceEntry]
    
    function addSlices(lineEntry: SliceEntry, lineDepth: number) {
        let i = -1
        for (const codeBlock of lineEntry.line) {
            i++
            if (codeBlock instanceof ActionBlock && codeBlock.block == DFCodeblockName.CALL_FUNCTION && codeBlock.action in slicesByName) {
                if (sliceEntriesByDepth[lineDepth] == undefined) {
                    sliceEntriesByDepth[lineDepth] = []
                }
                if (sliceEntriesByParent.get(lineEntry) == undefined) {
                    sliceEntriesByParent.set(lineEntry,[])
                }

                
                let [physicalLength,callBlocks] = getLineInfo(slicesByName[codeBlock.action]!)


                let entry = {callIndex: i, name: codeBlock.action, line: slicesByName[codeBlock.action]!, parent: lineEntry, physicalLength: physicalLength, callBlocks: callBlocks, depth: lineDepth}
                sliceEntriesByDepth[lineDepth].push(entry)
                sliceEntriesByParent.get(lineEntry)!.push(entry)
                sliceEntriesByName[codeBlock.action] = entry


                addSlices(entry, lineDepth + 1)
            }
        }
    }

    addSlices(parentSliceEntry, 0)


    lastSliceCount = Object.keys(sliceEntriesByName).length

    //repeat the expansion algorithm until it stops having any effect
    while (true) {
        //-2 since we're iterating over the parent entries and the greatest depth cannot have children
        for (let i = sliceEntriesByDepth.length - 2; i >= -1; i--) {
            for (const parentEntry of sliceEntriesByDepth[i]) {
                let parentSlices = sliceEntriesByParent.get(parentEntry)
                if (!parentSlices) { continue }
    
                //map slices to their sizes
                let sliceSizes = new Map<SliceEntry,number>()
                for (const childEntry of parentSlices) {
                    sliceSizes.set(childEntry,childEntry.line.length)
                }
    
                //go from smallest slices to largest since the goal is to remove as many call funcs as possible
                for (const [childEntry] of [...sliceSizes.entries()].sort((a, b) => a[1] - b[1])) {
                    if (parentEntry.physicalLength + (childEntry.physicalLength - 2) > maxLineLength) {
                        break
                    }
    
                    //replace call func block with actual line contents
                    parentEntry.line.splice(childEntry.callIndex,1,...childEntry.line.slice(1))
                    parentEntry.physicalLength += childEntry.physicalLength - 2
                    parentSlices.splice(parentSlices.findIndex(value => value == childEntry),1)
                    delete sliceEntriesByName[childEntry.name]

                    
                    //fix callIndex of other child slices
                    for (const entryToFix of sliceEntriesByParent.get(parentEntry)!) {
                        if (entryToFix.callIndex > childEntry.callIndex) {
                            entryToFix.callIndex += childEntry.line.length - 2
                        }
                    }
                    
                    //update data of slices whose call blocks were just absorbed
                    for (const callBlockData of childEntry.callBlocks) {
                        let entryToFix = sliceEntriesByName[callBlockData[1].action]!
                        if (entryToFix == undefined) { continue }
                       
                        //fix slicesByParent map
                        let parentArrayToFix = sliceEntriesByParent.get(entryToFix.parent!)!
                        parentArrayToFix.splice(parentArrayToFix.findIndex(value => value == entryToFix),1)
                        parentSlices.push(entryToFix)

                        //fix slicesByDepth map
                        let depthArrayToFix = sliceEntriesByDepth[entryToFix.depth]
                        depthArrayToFix.splice(depthArrayToFix.findIndex(value => value == entryToFix),1)
                        sliceEntriesByDepth[parentEntry.depth+1].push(entryToFix)

                        entryToFix.parent = parentEntry
                        entryToFix.depth = parentEntry.depth + 1
                        entryToFix.callIndex += childEntry.callIndex - 1
                    }
                }
            }
        }
        let sliceCount = Object.keys(sliceEntriesByName).length
        if (lastSliceCount == sliceCount) {
            break
        }
        lastSliceCount = sliceCount
    }

    //= adjust return blocks to return the proper number of levels =\\
    function fixReturnBlocks(line: CodeBlock[], depth: number) {
        line.forEach(block => {
            if (!(block instanceof ActionBlock)) {return}
            if (block.block == DFCodeblockName.CALL_FUNCTION && sliceEntriesByName[block.action] != undefined) {
                fixReturnBlocks(sliceEntriesByName[block.action]!.line,depth+1)
            }
            else if (block.block == DFCodeblockName.CONTROL) {
                if (block.action == "ReturnNTimes") {
                    throw new Error("Codeline splitter cannot currently handle control:ReturnNTimes.")
                }
                else if (block.action == "Return" && depth > 0) {
                    block.action = "ReturnNTimes"
                    block.args = [new NumberValue((depth + 1).toString())]
                }
            }
        })
    }
    fixReturnBlocks(mainLine,0)

    //= make sure theres no gaps in slice ids =\\
    let nextNewId = 0;
    for (const entry of Object.values(sliceEntriesByName)) {
        if (!entry?.parent) { continue; }
        let header = entry.line[0]! as ActionBlock
        let caller = entry.parent.line[entry.callIndex] as ActionBlock
        let newName = `${TC_HEADER}SLC_${headerType}_${nextNewId}_${headerName}`
        header.action = newName
        caller.action = newName
        nextNewId++
    }

    let slices = Object.values(sliceEntriesByName).map(entry => entry?.line) as CodeBlock[][]
    slices.unshift(mainLine)

    return slices
}