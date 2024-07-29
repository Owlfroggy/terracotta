/**
 * note: "physical blocks" are minecraft blocks, so most codeblocks are two physical blocks long
 */

import { TC_HEADER } from "../util/constants";
import { ActionBlock, BracketBlock, CodeBlock, ElseBlock, EventBlock, FunctionBlock, GZIP, IfActionBlock, JSONize, NumberItem, ProcessBlock } from "./codelineCompiler";
import * as tokenizer from "../tokenizer/tokenizer"

/**the maximum number of line vars that can be shared between the parent codeline and a slice */
const MAX_LINE_VARS = 26

interface InProgressSlice {
    blocks: CodeBlock[],
    physicalLength: number,
    startIndex: number
}

interface Chunk {
    blocks: CodeBlock[],
    physicalLength: number,
    startIndex: number,
    contentRanges?: [number,number][] //start and end are INCLUSIVE!!!
}


const createtimeline = true

function pr (...data: any[]) {
    process.stderr.write(data.map(entry => entry.toString()).join(" ")+"\n")
}

/**WILL MODIFY `inputCodeLine`!!*/
export function SliceCodeLine(inputCodeLine: CodeBlock[], maxLineLength: number): CodeBlock[][] {
    let mainLine = [...inputCodeLine]
    if (createtimeline) {pr("https://dfonline.dev/edit/?template="+GZIP(JSONize(mainLine)))}
    let mainLinePhysicalLength: number = 1
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

    function getChunk(startIndex: number): Chunk {
        let mode: "block" | "bracketed" = mainLine[startIndex+1] instanceof BracketBlock && (mainLine[startIndex+1] as BracketBlock).Direction == "open" ? "bracketed" : "block"
        if (mode == "block") {
            let physicalLength = 2
            if (
                (mainLine[startIndex] instanceof BracketBlock && (mainLine[startIndex] as BracketBlock).Direction == "open")
                || (mainLine[startIndex] instanceof ActionBlock && mainLine[startIndex].Block == "repeat")
                || (mainLine[startIndex] instanceof IfActionBlock)
                || (mainLine[startIndex] instanceof ElseBlock)
            ) {
                physicalLength = 1
            }
            return {
                blocks: [mainLine[startIndex]],
                physicalLength: physicalLength,
                startIndex: startIndex
            }
        }
        
        let chunk: Chunk = {
            blocks: [mainLine[startIndex],mainLine[startIndex+1]],
            physicalLength: 2,
            startIndex: startIndex,
            contentRanges: [[startIndex+2,startIndex+2]]
        }
        
        let i = startIndex + 2
        while (i < mainLine.length && !(mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).Direction == "close")) {
            let thisChunk = getChunk(i)
            chunk.blocks.push(...thisChunk.blocks)
            chunk.physicalLength += thisChunk.physicalLength
            i += thisChunk.blocks.length
        }

        chunk.contentRanges![0][1] = i-1
        
        //add closing bracket to chunk
        chunk.blocks.push(mainLine[i])
        chunk.physicalLength += 2

        return chunk
    }

    function sliceAlgorithm(startIndex: number) {
        let currentSlice: InProgressSlice = {
            blocks: [],
            physicalLength: 0,
            startIndex: startIndex
        }
        let i = startIndex - 1

        function applyCurrentSlice() {
            if (currentSlice.blocks.length > 1) {
                let sliceName = `${TC_HEADER}SLC_${headerType}_${slices.length}_${headerName}`
    
                //edit main line
                let callBlock = new ActionBlock("call_func", sliceName)
                callBlock.ActionNameField = "data"
                mainLine.splice(currentSlice.startIndex, currentSlice.blocks.length, callBlock)
    
                i -= currentSlice.blocks.length
    
                //create new slice
                currentSlice.blocks.unshift(new FunctionBlock(sliceName, []))
                slices.push(currentSlice.blocks)    
            }
            else {
                i -= 1
            }


            currentSlice = {
                blocks: [],
                physicalLength: 0,
                startIndex: i + 1
            }
        }

        while (i < mainLine.length) {
            i++
            let chunk = getChunk(i)

            if (chunk.contentRanges) {
                //slice
                sliceAlgorithm(chunk.contentRanges[0][0])
                //redo chunk data since length and blocks and stuff have changed
                chunk = getChunk(i)
            }

            //if hitting a closing bracket, apply current slice and dont go any further
            if (mainLine[i] instanceof BracketBlock && (mainLine[i] as BracketBlock).Direction == "close") {
                applyCurrentSlice()
                return
            }
            //if this chunk by itself is unqualified to be a slice, apply current slice and skip it
            else if (chunk.physicalLength > maxLineLength - 2) {
                applyCurrentSlice()
                i += chunk.blocks.length
                currentSlice.startIndex = i + 1
            } 
            //if this chunk would invalidate the current slice but can be in its own slice, apply current slice but let offending chunk be part of the next one
            else if (currentSlice.physicalLength + chunk.physicalLength > maxLineLength - 2) {
                applyCurrentSlice()
            }
            //otherwise add this chunk to the slice
            else {
                currentSlice.blocks.push(...chunk.blocks)
                currentSlice.physicalLength += chunk.physicalLength
                i += chunk.blocks.length - 1
            }
        }
    }

    // let chun = getChunk(2)
    // pr(JSON.stringify(chun),chun.blocks.length)

    sliceAlgorithm(1)

    slices.push(mainLine)

    return slices
}