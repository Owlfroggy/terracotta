import { SCRIPT_CONTENTS } from "./index"
import { GetLineStart, GetLineEnd, GetLineFromIndex, GetWhitespaceAmount, COLOR } from "./characterUtils"

export function PrintError(e: TCError) {
    if (e instanceof TCError) {
        let lineStart = GetLineStart(e.CharStart)
        let lineEnd = GetLineEnd(e.CharStart)

        // show the line(s) that had the error        
        function printCodeLine() {
            let codeLine = SCRIPT_CONTENTS.substring(lineStart, lineEnd)
            //if line contains the start of the highlight
            if (e.CharStart > lineStart) {
                let relativeErrorPos = Math.max(e.CharStart - lineStart,0)
                codeLine = codeLine.slice(0, relativeErrorPos) + COLOR.Red + codeLine.slice(relativeErrorPos) + COLOR.Reset
            }
            //if the entire line is highlighted
            else if (e.CharLoc > lineEnd) {
                codeLine = COLOR.Red + codeLine
            }
            //if the line contains the end of the highlight
            else if (e.CharLoc < lineEnd && e.CharLoc > lineStart) {
                let relativeErrorEndPos = e.CharLoc - lineStart + 1
                codeLine = COLOR.Red + codeLine.slice(0, relativeErrorEndPos) + COLOR.Reset + codeLine.slice(relativeErrorEndPos)
            }
            console.log(codeLine)
        }

        //if this is a multiline error
        if (e.CharLoc > lineEnd) {
            //print first line that had the error
            printCodeLine()
            //print remaining lines
            while (e.CharLoc > lineEnd) {
                lineStart = lineEnd + 1
                lineEnd = GetLineEnd(lineStart)
                printCodeLine()
            }
        //single line error
        } else {
            console.log(SCRIPT_CONTENTS.substring(lineStart, lineEnd))

            //CharLoc -1 means the location of the error is unknown so don't draw the arrows
            if (e.CharLoc == -1) {
                console.log()
            } else {
                //show the ^ thingies that point to the error
                if (e.CharLoc - lineStart < 0) {
                    console.log(" ".repeat(e.CharStart - e.CharStart) + "^".repeat(e.CharLoc - e.CharStart + 1))
                } else if (e.CharLoc - e.CharStart == 0) {
                    console.log(" ".repeat(e.CharStart - lineStart) + "^".repeat(e.CharLoc - e.CharStart + 1))
                } else {
                    console.log(" ".repeat(e.CharStart - lineStart) + "^".repeat(e.CharLoc - (e.CharStart - 1)))
                }
            }
        }

        console.log(e.CharLoc, lineEnd)

        //show what the error actually was
        console.log(`Error at line ${GetLineFromIndex(e.CharStart) + 1}: ${e.message}`)
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