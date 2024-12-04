/**
 * note: "physical blocks" are minecraft blocks, so most codeblocks are two physical blocks long
 * also, due to the nature of codeline splitting, it is not safe to use control:ReturnNTimes on a plot with split codelines
 */

import { TC_HEADER } from "../util/constants.ts";
import { ActionBlock, BracketBlock, CodeBlock, ElseBlock, EventBlock, FunctionBlock, GZIP, IfActionBlock, JSONize, NumberItem, ParamItem, ProcessBlock, StringItem, TextItem, VariableItem } from "./codelineCompiler.ts";
import * as TextCode from "../util/textCodeParser.ts"
import * as tokenizer from "../tokenizer/tokenizer.ts"
import { Dict } from "../util/dict.ts"

/**the maximum number of line vars that can be shared between the parent codeline and a slice */
const MAX_LINE_VARS = 27

interface InProgressSlice {
    blocks: CodeBlock[],
    variables: Dict<number>
    physicalLength: number,
    startIndex: number
}

interface Chunk {
    blocks: CodeBlock[],
    variables: Dict<number>,
    hasNonConstantVarNames?: boolean,
    physicalLength: number,
    startIndex: number,
    contentRanges?: [number,number][] //start and end are INCLUSIVE!!!
}

export function GetPhysicalLength(codeblock) {
    if (
        (codeblock instanceof BracketBlock && (codeblock as BracketBlock).Direction == "open")
        || (codeblock instanceof ActionBlock && codeblock.Block == "repeat")
        || (codeblock instanceof IfActionBlock)
        || (codeblock instanceof ElseBlock)
    ) {
        return 1
    } else {
        return 2
    }
}

/**WILL MODIFY `inputCodeLine`!!*/
export function SliceCodeLine(inputCodeLine: CodeBlock[], maxLineLength: number): CodeBlock[][] {
    if (maxLineLength < 14) {
        throw Error("maxLineLength cannot be less than 14")
    }

    let mainLine = [...inputCodeLine]
    let slicesByName: Dict<CodeBlock[]> = {}
    let sliceCount: number = 0

    //get header information
    if (!(mainLine[0] instanceof FunctionBlock || mainLine[0] instanceof ProcessBlock || mainLine[0] instanceof EventBlock)) {
        throw Error("Cannot slice codeline that does not begin with a header block (process, function, or event)")
    }
    let headerName: string
    let headerType: "P" | "F" | "EE" | "PE"
    if (mainLine[0] instanceof EventBlock) {
        headerName = mainLine[0].Event
        headerType = mainLine[0].Block == "ENTITY_EVENT" ? "EE" : "PE"
    } else {
        headerName = mainLine[0].Name
        headerType = mainLine[0] instanceof ProcessBlock ? "P" : "F"
    }

    /**returns true if any vars have %var() in their name */
    function addVariablesFromBlock(block: ActionBlock, to: Dict<number>): boolean {
        let hasNonConstantVarNames = false

        function addVariableName(name) {
            let tokenizedName = TextCode.TokenizeString(name)
            if (tokenizedName.Expression.length > 1 || (tokenizedName.Expression.length == 1 && !(tokenizedName.Expression[0] instanceof TextCode.StringChunkToken))) {
                hasNonConstantVarNames = true

                TextCode.GetAllVariables(name).forEach(addVariableName)
            }

            if (to[name] == undefined) {to[name] = 0}
            to[name]! += 1
        }

        if (block.Block == "call_func" || block.Block == "start_process") {
            TextCode.GetAllVariables(block.Action).forEach(addVariableName)
        }

        block.Arguments.forEach(arg => {
            if (arg instanceof VariableItem) {
                if (arg.Scope == "line") {
                    addVariableName(arg.Name)
                } else {
                    TextCode.GetAllVariables(arg.Name).forEach(addVariableName)
                }
            } 
            
            else if (arg instanceof NumberItem) {
                let parsed: TextCode.MathTextCodeToken | undefined = undefined
                try {
                    parsed = TextCode.TokenizeMath(arg.Value)
                } catch {}
                if (parsed) {
                    function recurse(token: TextCode.Token) {
                        if (token instanceof TextCode.VariableToken) {
                            addVariableName(token.Name)
                        }
                        else if (token instanceof TextCode.MathTextCodeToken) {
                            token.Expression.forEach(recurse)
                        }
                    }
                    recurse(parsed)
                }
            }

            else if (arg instanceof StringItem || arg instanceof TextItem) {
                TextCode.GetAllVariables(arg.Value).forEach(name => {
                    addVariableName(name)
                })
            }
        })

        return hasNonConstantVarNames
    }

    function getChunk(startIndex: number): Chunk {
        let mode: "block" | "bracketed" = mainLine[startIndex+1] instanceof BracketBlock && (mainLine[startIndex+1] as BracketBlock).Direction == "open" ? "bracketed" : "block"
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
            while (i < mainLine.length && !(mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).Direction == "close")) {
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
    
                let callBlock = new ActionBlock("call_func", sliceName)
                let headerBlock = new FunctionBlock(sliceName, [])

                Object.keys(currentSlice.variables).forEach(name => {
                    callBlock.Arguments.push(new VariableItem([],"line",name))
                    headerBlock.Parameters.push(new ParamItem([],name,"var",false,false))
                });

                //edit main line
                callBlock.ActionNameField = "data"
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
            if (mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).Direction == "close") {
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
                if (block.Block == "call_func") {
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
    let sliceEntriesByName: Dict<SliceEntry> = {}

    sliceEntriesByDepth[-1] = [parentSliceEntry]
    
    function addSlices(lineEntry: SliceEntry, lineDepth: number) {
        let i = -1
        for (const codeBlock of lineEntry.line) {
            i++
            if (codeBlock instanceof ActionBlock && codeBlock.Block == "call_func" && codeBlock.Action in slicesByName) {
                if (sliceEntriesByDepth[lineDepth] == undefined) {
                    sliceEntriesByDepth[lineDepth] = []
                }
                if (sliceEntriesByParent.get(lineEntry) == undefined) {
                    sliceEntriesByParent.set(lineEntry,[])
                }

                
                let [physicalLength,callBlocks] = getLineInfo(slicesByName[codeBlock.Action]!)


                let entry = {callIndex: i, name: codeBlock.Action, line: slicesByName[codeBlock.Action]!, parent: lineEntry, physicalLength: physicalLength, callBlocks: callBlocks, depth: lineDepth}
                sliceEntriesByDepth[lineDepth].push(entry)
                sliceEntriesByParent.get(lineEntry)!.push(entry)
                sliceEntriesByName[codeBlock.Action] = entry


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
                for (const childEntry of new Map<SliceEntry,number>( [...sliceSizes.entries()].sort((e1, e2) => e1[1] - e2[1]) ).keys()) {
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
                        let entryToFix = sliceEntriesByName[callBlockData[1].Action]!
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
            if (block.Block == "call_func" && sliceEntriesByName[block.Action] != undefined) {
                fixReturnBlocks(sliceEntriesByName[block.Action]!.line,depth+1)
            }
            else if (block.Block == "control") {
                if (block.Action == "ReturnNTimes") {
                    throw new Error("Codeline splitter cannot currently handle control:ReturnNTimes.")
                }
                else if (block.Action == "Return" && depth > 0) {
                    block.Action = "ReturnNTimes"
                    block.Arguments = [new NumberItem([],(depth + 1).toString())]
                }
            }
        })
    }
    fixReturnBlocks(mainLine,0)



    let slices = Object.values(sliceEntriesByName).map(entry => entry?.line) as CodeBlock[][]
    slices.unshift(mainLine)

    return slices
}