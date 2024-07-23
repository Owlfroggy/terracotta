import { CharUtils, COLOR } from "./characterUtils"

export function PrintError(e: Error, SCRIPT_CONTENTS) {
    let cu = new CharUtils(SCRIPT_CONTENTS,true)
    if (e instanceof TCError) {
        let lineStart = cu.GetLineStart(e.CharStart)
        let lineEnd = cu.GetLineEnd(e.CharStart)

        // show the line(s) that had the error        
        function printCodeLine(e: TCError) {
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
            process.stderr.write(codeLine+"\n")
        }

        //if this is a multiline error
        if (e.CharLoc > lineEnd) {
            //print first line that had the error
            printCodeLine(e)
            //print remaining lines
            while (e.CharLoc > lineEnd) {
                lineStart = lineEnd + 1
                lineEnd = cu.GetLineEnd(lineStart)
                printCodeLine(e)
            }
        //single line error
        } else {
            process.stderr.write(SCRIPT_CONTENTS.substring(lineStart, lineEnd)+"\n")

            //CharLoc -1 means the location of the error is unknown so don't draw the arrows
            if (e.CharLoc == -1) {
                process.stderr.write("\n")
            } else {
                //show the ^ thingies that point to the error
                if (e.CharLoc - lineStart < 0) {
                    process.stderr.write(" ".repeat(e.CharStart - e.CharStart) + "^".repeat(e.CharLoc - e.CharStart + 1)+"\n")
                } else if (e.CharLoc - e.CharStart == 0) {
                    process.stderr.write(" ".repeat(e.CharStart - lineStart) + "^".repeat(e.CharLoc - e.CharStart + 1)+"\n")
                } else {
                    process.stderr.write(" ".repeat(e.CharStart - lineStart) + "^".repeat(e.CharLoc - (e.CharStart - 1))+"\n")
                }
            }
        }
        
        //show what the error actually was
        process.stderr.write(`\nError at line ${cu.GetLineFromIndex(e.CharStart) + 1}: ${e.message}\n`)
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