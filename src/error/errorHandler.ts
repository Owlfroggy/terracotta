import { TCError, TCStandaloneError } from "./error.ts";

//=------------------------------------------------=\\
//=- this whole file sucks and needs to be redone -=\\
//=------------------------------------------------=\\

const COLOR = {
    Red: "\x1B[0;91m",
    Yellow: "\x1B[0;93m",
    Green: "\x1B[0;92m",
    LightYellow: "\x1B[38;5;228m",
    Magenta: "\x1B[0;95m",
    BrightCyan: "\x1B[38;5;51m",
    White: "\x1B[0;37m",
    Gray: "\x1B[38;5;248m",
    DarkGray: "\x1B[38;5;240m",

    Reset: "\x1B[0m",
    Bold: "\x1B[1m",
    Italic: "\x1B[3m",
    Underline: "\x1B[4m",
    Strikethrough: "\x1B[9m",
    EndStrikethrough: "\x1B[29m",
    Blink: "\x1B[5m"
}

/** returned number will be the first character AFTER the newline */
function getLineStart(index: number, script: string): number {
    let isFirstChar = true

    while (index > 0) {
        if (script[index] == "\n" && !isFirstChar) { return index + 1 }
        isFirstChar = false
        index--
    }
    return 0
}

/** returned character will be the ending newline */
function getLineEnd(index: number, script: string): number {
    while (index < script.length) {
        if (script[index] == "\n") { return index }
        index++
    }
    return index
}

function getLineFromIndex(index: number, script: string) {
    return script.substring(0, index).split('\n').length - 1
}

export function printError(e: TCError, fileName: string) {
    process.stderr.write("   \n")
    if (e instanceof TCStandaloneError) {
        process.stderr.write(`${COLOR.Reset}Error: ${COLOR.Red}${e.message}${COLOR.Reset}\n`)
        return;
    }

    let script = e.getScriptContents();
    let startPos = e.getStartPos();
    let endPos = e.getEndPos()-1;

    let lineStartIndexes: number[] = [-1]
    let linesFromStartIndex: {[key: number]: number} = {0: -1}
    let i = 0
    for (const v of script.matchAll(/\n/g)) {
        i++
        lineStartIndexes[i] = v.index+1
        linesFromStartIndex[v.index+1] = i
    }


    let errorLineStart = getLineStart(startPos, script)
    let errorEndLineStart = getLineStart(endPos, script)

    let endLineNumLength = (linesFromStartIndex[errorEndLineStart]! + 1).toString().length
    let lineHeaderLength = endLineNumLength + 3

    // show the line(s) that had the error        
    function printCodeLine(e: TCError, line: number) {
        let lineStart = lineStartIndexes[line]
        let lineEnd = getLineEnd(lineStart, script)
        let codeLine = script.substring(lineStart,lineEnd)

        //if line contains the start of the highlight
        if (startPos > lineStart) {
            let relativeErrorPos = Math.max(startPos - lineStart,0)
            let relativeErrorEnd = relativeErrorPos + (endPos - startPos) + 1
            
            //if line also contains the end of the highlight
            if (errorLineStart == errorEndLineStart) {
                codeLine = codeLine.slice(0, relativeErrorPos) + COLOR.Red + codeLine.slice(relativeErrorPos, relativeErrorEnd) + COLOR.Gray + codeLine.slice(relativeErrorEnd)
            } 
            else {
                codeLine = codeLine.slice(0, relativeErrorPos) + COLOR.Red + codeLine.slice(relativeErrorPos) + COLOR.Gray
            }
        }
        //if the entire line is highlighted
        else if (endPos > lineEnd) {
            codeLine = COLOR.Red + codeLine + COLOR.Gray
        }
        //if the line contains the end of the highlight
        else if (endPos < lineEnd && endPos >= lineStart) {
            let relativeErrorEndPos = endPos - lineStart + 1
            codeLine = COLOR.Red + codeLine.slice(0, relativeErrorEndPos) + COLOR.Gray + codeLine.slice(relativeErrorEndPos)
        }
        process.stderr.write(COLOR.DarkGray + `${(line + 1).toString().padStart(endLineNumLength,"0")} | ` + COLOR.Gray + codeLine+"\n")
    }

    //print code lines involving the error + a few before the error for context
    let lineNum = Math.max(linesFromStartIndex[errorLineStart]!-5,0)
    while (lineStartIndexes[lineNum] <= endPos) {
        printCodeLine(e,lineNum)
        lineNum++
    }
    
    //singe line error
    if (errorLineStart == errorEndLineStart && endPos !== -1) {
        let leftSpace: number
        if (endPos - errorLineStart < 0) {
            leftSpace = startPos - startPos + lineHeaderLength
            process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(endPos - startPos + 1)+"\n")
        } else if (endPos - startPos == 0) {
            leftSpace = startPos - errorLineStart + lineHeaderLength
            process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(endPos - startPos + 1)+"\n")
        } else {
            leftSpace = startPos - errorLineStart + lineHeaderLength
            process.stderr.write(COLOR.Reset + " ".repeat(leftSpace) + "^".repeat(endPos - (startPos - 1))+"\n")
        }

        // process.stderr.write(`${" ".repeat(leftSpace)}${COLOR.Red}${e.message}${COLOR.Reset}\n`)
    }
    process.stderr.write(`${COLOR.Reset}Error in ${COLOR.White}${fileName}${COLOR.Reset} at line ${COLOR.White}${getLineFromIndex(startPos, script) + 1}${COLOR.Reset}: ${COLOR.Red}${e.message}${COLOR.Reset}\n`)
}