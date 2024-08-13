export const COLOR = {
    Red: "\x1B[0;91m",
    Yellow: "\x1B[0;93m",
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

export class CharUtils {
    constructor(script: string, commentMode: boolean) {
        this.SCRIPT_CONTENTS = script
        this.CommentMode = commentMode
    }
    SCRIPT_CONTENTS: string
    CommentMode = false

    //returns true if if a char is valid for use in an identifier
    //totally not copy pasted from stack overflow
    IsCharacterValidIdentifier(char): boolean {
        let code = char.charCodeAt(0);
        if (!(code > 47 && code < 58) && // numeric (0-9)
            !(code > 64 && code < 91) && // upper alpha (A-Z)
            !(code == 95) && //underscore
            !(code > 96 && code < 123)) { // lower alpha (a-z)
            return false;
        }
        return true;
    };

    //returns true if char is valid for use in a number
    IsCharacterValidNumber(char): boolean {
        let code = char.charCodeAt(0);
        if (
            !(code > 47 && code < 58) && // numeric (0-9)
            !(code == 46) //decimal (.)
        ) {
            return false
        }

        return true
    }

    //Gets word until a special character is encountered
    //IMPORTANT: index should be the first character IN TEH KEYWORD!!!
    //SPACE COUNTS AS A SPECIAL CHARACTER!!!!
    //returns: the word, the index of the final character in the word
    GetIdentifier(index, canStartWithNumber: boolean = false): [number, string] {
        if (this.SCRIPT_CONTENTS[index] == undefined) { return [index, ""] }
        let word = "";

        //dont let identifiers start with numbers
        let firstCharacterCode = this.SCRIPT_CONTENTS[index].charCodeAt(0)
        if (firstCharacterCode > 47 && firstCharacterCode < 58 && canStartWithNumber == false) {
            return [index, ""]
        }

        while (index < this.SCRIPT_CONTENTS.length) {
            if (this.IsCharacterValidIdentifier(this.SCRIPT_CONTENTS[index])) {
                word += this.SCRIPT_CONTENTS[index]
            } else {
                break
            }
            index++
        }
        return [index - 1, word]
    }

    //Get next amount of characters from CharIndex
    GetNextCharacters(index: number, charAmount: number, newlinesAreWhitespace: boolean = false) {
        let string = ""

        while (charAmount > 0) {
            index++
            let char = this.SCRIPT_CONTENTS[index]

            //if comment, simulate line end
            if (char == "#" && this.CommentMode) {
                //char = ";"
                index = this.GetLineEnd(index)
                continue
            }
            //if at the end of the script
            if (char == undefined) { break }

            if (char == " ") { continue }
            if (char == "\t") { continue }
            if (char == "\n") { continue }

            string += char
            charAmount -= 1
        }

        return string
    }

    //returns the line that the character at index is at
    //first line = 0
    GetLineFromIndex(index: number) {
        return this.SCRIPT_CONTENTS.substring(0, index).split('\n').length - 1
    }

    //returned number will be the first character AFTER the newline
    GetLineStart(index: number): number {
        let isFirstChar = true

        while (index > 0) {
            if (this.SCRIPT_CONTENTS[index] == "\n" && !isFirstChar) { return index + 1 }
            isFirstChar = false
            index--
        }
        return 0
    }

    //returned character will be the ending newline
    GetLineEnd(index: number): number {
        while (index < this.SCRIPT_CONTENTS.length) {
            if (this.SCRIPT_CONTENTS[index] == "\n") { return index }
            index++
        }
        return index
    }

    //returns the number of whitespace characters from CharIndex
    GetWhitespaceAmount(index: number, newlinesAreWhitespace = true): number {
        let count = 0

        while (index < this.SCRIPT_CONTENTS.length) {
            index++

            //count all characters part of a comment as whitespace
            if (this.SCRIPT_CONTENTS[index] == "#" && this.CommentMode) {
                count += this.GetLineEnd(index) - index
                index += this.GetLineEnd(index) - index
            }

            if (
                (this.SCRIPT_CONTENTS[index] == "\t") ||
                (this.SCRIPT_CONTENTS[index] == " ") ||
                (this.SCRIPT_CONTENTS[index] == "\n" && newlinesAreWhitespace)
            ) {
                count += 1
            } else {
                return count
            }
        }

        return count
    }

    //returns a string with every character from CharIndex until the first instance of anything in terminateAt
    GetCharactersUntil(index: number, terminateAt: Array<string>, ignoreCommentRules: boolean = false): [number, string] {
        let string = ""

        while (index < this.SCRIPT_CONTENTS.length) {
            let char = this.SCRIPT_CONTENTS[index]
            if (char == "#" && ignoreCommentRules == false && this.CommentMode) {
                char = ";"
                index = this.GetLineEnd(index)
            }

            if (terminateAt.includes(char)) {
                return [index - 1, string]
            }
            string += char
            index++
        }

        return [index - 1, string]
    }

    GetCharacterAtIndex(index: number) {
        // if (SCRIPT_CONTENTS[index] == "#") {
        //     return "\n"
        // }
        return this.SCRIPT_CONTENTS[index]
    }
}