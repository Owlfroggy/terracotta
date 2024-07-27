import { TC_HEADER } from "../util/constants";
import { ActionBlock, BracketBlock, CodeBlock, EventBlock, FunctionBlock, ProcessBlock } from "./codelineCompiler";

/**the maximum number of line vars that can be shared between the parent codeline and a slice */
const MAX_LINE_VARS = 26

/**MAX LINE LENGTH INCLUDING HEADER!!! */
export function SliceCodeLine(inputCodeLine: CodeBlock[], maxLineLength: number): CodeBlock[][] {
    let parentCodeLine = [...inputCodeLine] //copy of codeline that can be freely spliced (blocks are still references though so dont change them)
    let slices: CodeBlock[][] = []

    let thisSliceCodeblocks: CodeBlock[] = []
    let thisSliceStartIndex: number = 1 //index of the first codeblock in this slice

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

    let i = 0
    while (parentCodeLine.length > maxLineLength) {
        i = 0
        thisSliceCodeblocks = []
        thisSliceStartIndex = 1
        //main iteration over all the codeblocks
        while (i < parentCodeLine.length) {
            i++
    
            let block = parentCodeLine[i]
    
            let weight = 1
            //if there's room for the next codeblock (and its subcode if it has any), add it to the current slice
            // console.log(thisSliceCodeblocks.length, parentCodeLine.length, thisSliceStartIndex)
            if (thisSliceCodeblocks.length + weight <= maxLineLength -1) { //subtract 1 from maxLineLength because a header must be added to the new slice
                thisSliceCodeblocks.push(block)
            }
            //if this codeblock by itself would violate the rules of a slice, skip it
            else if (weight >= maxLineLength) {
                continue
            }
            //otherwise finalize current slice
            else {
                let sliceName = `${TC_HEADER}SLC_${headerType}_${slices.length}_${headerName}`
    
                //edit parent line
                let callBlock = new ActionBlock("call_func", sliceName)
                callBlock.ActionNameField = "data"
                parentCodeLine.splice(thisSliceStartIndex, thisSliceCodeblocks.length, callBlock)
                
                i -= thisSliceCodeblocks.length
    
                //create new slice
                thisSliceCodeblocks.unshift(new FunctionBlock(sliceName, []))
                slices.push(thisSliceCodeblocks)
                thisSliceCodeblocks = []
                thisSliceStartIndex = i + 1
            }
        }
    }

    slices.push(parentCodeLine)

    return slices
}