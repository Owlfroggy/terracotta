import { CharUtils, COLOR } from "./characterUtils"

export function PrintError(e: Error, SCRIPT_CONTENTS: string, fileName: string) {
    if (e instanceof TCError) {
        let lineStartIndexes: number[] = [-1]
        let linesFromStartIndex: Dict<number> = {0: -1}
        let i = 0
        for (const v of SCRIPT_CONTENTS.matchAll(/\n/g)) {
            i++
            lineStartIndexes[i] = v.index+1
            linesFromStartIndex[v.index+1] = i
        }

        let cu = new CharUtils(SCRIPT_CONTENTS,true)

        let errorLineStart = cu.GetLineStart(e.CharStart)
        let errorEndLineStart = cu.GetLineStart(e.CharLoc)

        let endLineNumLength = (linesFromStartIndex[errorEndLineStart]! + 1).toString().length
        let lineHeaderLength = endLineNumLength + 3

        // show the line(s) that had the error        
        function printCodeLine(e: TCError, line: number) {
            let lineStart = lineStartIndexes[line]
            let lineEnd = cu.GetLineEnd(lineStart)
            let codeLine = SCRIPT_CONTENTS.substring(lineStart,lineEnd)

            //if line contains the start of the highlight
            if (e.CharStart > lineStart) {
                let relativeErrorPos = Math.max(e.CharStart - lineStart,0)
                let relativeErrorEnd = relativeErrorPos + (e.CharLoc - e.CharStart) + 1
                
                //if line also contains the end of the highlight
                if (errorLineStart == errorEndLineStart) {
                    codeLine = codeLine.slice(0, relativeErrorPos) + COLOR.Red + codeLine.slice(relativeErrorPos, relativeErrorEnd) + COLOR.Gray + codeLine.slice(relativeErrorEnd)
                } 
                else {
                    codeLine = codeLine.slice(0, relativeErrorPos) + COLOR.Red + codeLine.slice(relativeErrorPos) + COLOR.Gray
                }
            }
            //if the entire line is highlighted
            else if (e.CharLoc > lineEnd) {
                codeLine = COLOR.Red + codeLine + COLOR.Gray
            }
            //if the line contains the end of the highlight
            else if (e.CharLoc < lineEnd && e.CharLoc >= lineStart) {
                let relativeErrorEndPos = e.CharLoc - lineStart + 1
                codeLine = COLOR.Red + codeLine.slice(0, relativeErrorEndPos) + COLOR.Gray + codeLine.slice(relativeErrorEndPos)
            }
            process.stderr.write(COLOR.DarkGray + `${(line + 1).toString().padStart(endLineNumLength,"0")} | ` + COLOR.Gray + codeLine+"\n")
        }

        //print code lines involving the error + a few before the error for context
        let lineNum = Math.max(linesFromStartIndex[errorLineStart]!-5,0)
        while (lineStartIndexes[lineNum] <= e.CharLoc) {
            printCodeLine(e,lineNum)
            lineNum++
        }
        
        //singe line error
        if (errorLineStart == errorEndLineStart && e.CharLoc !== -1) {
            let leftSpace: number
            if (e.CharLoc - errorLineStart < 0) {
                leftSpace = e.CharStart - e.CharStart + lineHeaderLength
                process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(e.CharLoc - e.CharStart + 1)+"\n")
            } else if (e.CharLoc - e.CharStart == 0) {
                leftSpace = e.CharStart - errorLineStart + lineHeaderLength
                process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(e.CharLoc - e.CharStart + 1)+"\n")
            } else {
                leftSpace = e.CharStart - errorLineStart + lineHeaderLength
                process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(e.CharLoc - (e.CharStart - 1))+"\n")
            }

            // process.stderr.write(`${" ".repeat(leftSpace)}${COLOR.Red}${e.message}${COLOR.Reset}\n`)
        }
        process.stderr.write(`${COLOR.Reset}Error in ${COLOR.White}${fileName}${COLOR.Reset} at line ${COLOR.White}${cu.GetLineFromIndex(e.CharStart) + 1}${COLOR.Reset}: ${COLOR.Red}${e.message}${COLOR.Reset}\n`)
    } else {
        throw e
    }
}

//terractotta error
export class TCError extends Error {
    constructor(message: string, code: number, charStart: number, charLoc: number, options?: ErrorOptions) {
        super(message, options)

        this.CharStart = charStart
        this.CharLoc = charLoc
        this.Code = code
    }

    CharStart: number
    CharLoc: number
    Code: number
}