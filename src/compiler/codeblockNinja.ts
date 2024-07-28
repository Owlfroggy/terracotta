import { TC_HEADER } from "../util/constants";
import { ActionBlock, BracketBlock, CodeBlock, EventBlock, FunctionBlock, GZIP, IfActionBlock, JSONize, ProcessBlock } from "./codelineCompiler";
import * as tokenizer from "../tokenizer/tokenizer"

/**the maximum number of line vars that can be shared between the parent codeline and a slice */
const MAX_LINE_VARS = 26

function pr(...data: any[]) {
    return
    console.log(...data)
}

/**WILL MODIFY `inputCodeLine`!!*/
export function SliceCodeLine(inputCodeLine: CodeBlock[], maxLineLength: number): CodeBlock[][] {
    let parentCodeLine = [...inputCodeLine] //copy of codeline that can be freely spliced (blocks are still references though so dont change them)
    let slices: CodeBlock[][] = []

    //get header information
    if (!(parentCodeLine[0] instanceof FunctionBlock || parentCodeLine[0] instanceof ProcessBlock || parentCodeLine[0] instanceof EventBlock)) {
        throw Error("Cannot slice codeline that does not begin with a header block (process, function, or event)")
    }
    let headerName: string
    let headerType: "P" | "F" | "EE" | "PE"
    if (parentCodeLine[0] instanceof EventBlock) {
        headerName = parentCodeLine[0].Event
        headerType = parentCodeLine[0].Block == "ENTITY_EVENT" ? "EE" : "PE"
    } else {
        headerName = parentCodeLine[0].Name
        headerType = parentCodeLine[0] instanceof ProcessBlock ? "P" : "F"
    }

    /**if in bracket mode, will return the length of the entire chunk (including if/repeat block brackets)*/
    function sliceAlgorithm(startIndex: number): number | null {
        let mode: "codeline" | "bracketed" = parentCodeLine[startIndex+1] instanceof BracketBlock ? "bracketed" : "codeline"
        let elseAllowed = parentCodeLine[startIndex] instanceof IfActionBlock

        // pr(mode)

        let thisSliceCodeblocks: CodeBlock[] = []
        let thisSliceStartIndex: number = startIndex+1 //index of the first codeblock in this slice

        let i = startIndex

        // function commitSlice() {

        // }

        if (mode == "bracketed") {
            i++
            thisSliceStartIndex++
        }
        //main iteration over all the codeblocks
        while (true) {
            i++
            // pr(i,mode)

            if (i >= parentCodeLine.length) {
                return null
            }
            if (mode == "bracketed") {
                if (parentCodeLine[i] instanceof BracketBlock && (parentCodeLine[i] as BracketBlock).Direction == "close") {
                    // pr("legth is",i-startIndex,"si is",startIndex)
                    return i-startIndex
                }
            }
    
            let lengthWeight = 1
            let actualBlockLength = 1
            if (parentCodeLine[i+1] instanceof BracketBlock && (parentCodeLine[i+1] as BracketBlock).Direction == "open") {
                lengthWeight = sliceAlgorithm(i)!
                actualBlockLength = lengthWeight + 1
            }

            //if there's room for the next codeblock (and its subcode if it has any), add it to the current slice
            // pr(thisSliceCodeblocks.length, parentCodeLine.length, thisSliceStartIndex)
            if (thisSliceCodeblocks.length + lengthWeight <= maxLineLength - 1) { //subtract 1 from maxLineLength because a header must be added to the new slice
                pr(thisSliceCodeblocks.length,lengthWeight,maxLineLength-1,mode)
                thisSliceCodeblocks.push(...parentCodeLine.slice(i,i+actualBlockLength))
                i += actualBlockLength-1
            }
            //if this codeblock by itself would violate the rules of a slice, skip it
            else if (lengthWeight >= maxLineLength) {
                pr('single violation rule',mode)
                i += actualBlockLength - 1
                thisSliceCodeblocks = []
                thisSliceStartIndex = i + 1
                pr("skip to",JSON.stringify(parentCodeLine[i]))
                continue
            }
            //otherwise finalize current slice
            else {
                pr('finalize in',mode)
                let sliceName = `${TC_HEADER}SLC_${headerType}_${slices.length}_${headerName}`
    
                //edit parent line
                let callBlock = new ActionBlock("call_func", sliceName)
                callBlock.ActionNameField = "data"
                parentCodeLine.splice(thisSliceStartIndex, thisSliceCodeblocks.length, callBlock)
                
                i -= thisSliceCodeblocks.length
                
                //create new slice
                thisSliceCodeblocks.unshift(new FunctionBlock(sliceName, []))

                pr("PARENT: ",GZIP(JSONize(parentCodeLine)))
                pr("CHILD: ",GZIP(JSONize(thisSliceCodeblocks)))

                slices.push(thisSliceCodeblocks)
                thisSliceCodeblocks = []
                thisSliceStartIndex = i + 1
            }
        }
    }

    while (true) {
        let physicalLength = 0
        parentCodeLine.forEach(block => {
            if (block instanceof BracketBlock && block.Direction == "open") {
                physicalLength += 0
            } else {
                physicalLength += 1
            }
        })

        if (physicalLength <= maxLineLength) {
            break
        }
        sliceAlgorithm(0)
    }

    slices.push(parentCodeLine)

    return slices
}