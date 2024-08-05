/**
 * note: "physical blocks" are minecraft blocks, so most codeblocks are two physical blocks long
 */

import { TC_HEADER } from "../util/constants";
import { ActionBlock, BracketBlock, CodeBlock, ElseBlock, EventBlock, FunctionBlock, GZIP, IfActionBlock, JSONize, NumberItem, ParamItem, ProcessBlock, StringItem, TextItem, VariableItem } from "./codelineCompiler";
import * as TextCode from "../util/textCodeParser"
import * as tokenizer from "../tokenizer/tokenizer"

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
    let slices: CodeBlock[][] = []

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
                let sliceName = `${TC_HEADER}SLC_${headerType}_${slices.length}_${headerName}`
    
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
                slices.push(currentSlice.blocks)    
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

    let lastSliceCount = 0

    while (true) {
        let physicalLength = 0
        mainLine.forEach(block => {
            physicalLength += GetPhysicalLength(block)
        })
        if (physicalLength <= maxLineLength) { break }

        sliceAlgorithm(1)

        if (slices.length == lastSliceCount) {
            throw new Error("Could not automatically split line")
        }
        lastSliceCount = slices.length
    }

    slices.push(mainLine)

    return slices
}