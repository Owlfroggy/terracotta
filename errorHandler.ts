import { SCRIPT_CONTENTS } from "./index"
import { GetLineStart, GetLineEnd, GetLineFromIndex } from "./characterUtils"

export function PrintError(e: Error | TCError) {
    if (e instanceof TCError) {
        let lineStart = GetLineStart(e.CharStart)
        let lineEnd = GetLineEnd(e.CharStart)

        //show the line that had the error
        console.log(SCRIPT_CONTENTS.substring(lineStart,lineEnd))
        
        //CharLoc -1 means the location of the error is unknown so don't draw the arrows
        if (e.CharLoc == -1){
            console.log()
        } else {
            //show the ^ thingies that point to the error
            if (e.CharLoc - lineStart < 0) {
                console.log(" ".repeat(e.CharStart-e.CharStart) + "^".repeat(e.CharLoc - e.CharStart+1))
            } else if (e.CharLoc - e.CharStart == 0) {
                console.log(" ".repeat(e.CharStart-lineStart) + "^".repeat(e.CharLoc - e.CharStart+1))
            } else {
                console.log(" ".repeat(e.CharStart-lineStart) + "^".repeat(e.CharLoc - (e.CharStart-1)))
            }
        }
        
        //show what the error actually was
        console.log(`Error at line ${GetLineFromIndex(e.CharStart)+1}: ${e.message}`)
    } else {
        throw e
    }
}

//terractotta error
export class TCError extends Error {
    constructor(message: string, code: number, charStart: number, charLoc: number, options?: ErrorOptions) {
        super(message,options)

        this.CharStart = charStart
        this.CharLoc = charLoc
        this.Code = code
    }

    CharStart: number
    CharLoc: number
    Code: number
}