import { readableStreamToArray } from "bun";
import { SCRIPT_CONTENTS } from ".";

//returns true if if a char is valid for use in an identifier
//totally not copy pasted from stack overflow
function IsCharacterValidIdentifier(char) {
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
function IsCharacterValidNumber(char) {
    let code = char.charCodeAt(0);
    if (
        !(code > 47 && code < 58) && // numeric (0-9)
        !(code == 46) //decimal (.)
    ){
        return false
    }

    return true
}

//Gets word until a special character is encountered
//IMPORTANT: index should be the first character IN TEH KEYWORD!!!
//SPACE COUNTS AS A SPECIAL CHARACTER!!!!
//returns: the word, the index of the final character in the word
function GetIdentifier(index, canStartWithNumber: boolean = false): [number, string] {
    if (SCRIPT_CONTENTS[index] == undefined) {return [index, ""]}
    let word = "";

    //dont let identifiers start with numbers
    let firstCharacterCode = SCRIPT_CONTENTS[index].charCodeAt(0)
    if (firstCharacterCode > 47 && firstCharacterCode < 58 && canStartWithNumber == false) {
        return [index, ""]
    }

    while (index < SCRIPT_CONTENTS.length) {
        if (IsCharacterValidIdentifier(SCRIPT_CONTENTS[index])) {
            word += SCRIPT_CONTENTS[index]
        } else {
            break
        }
        index++
    }
    return [index - 1, word]
}

//Get next amount of characters from CharIndex
function GetNextCharacters(index: number,charAmount: number, newlinesAreWhitespace: boolean = false) {
    let string = ""

    while (charAmount > 0) {
        index++
        let char = SCRIPT_CONTENTS[index]

        //if comment, simulate line end
        if (char == "#") {
            char = "\n"
            index = GetLineEnd(index)
        }
        //if at the end of the script
        if (char == undefined) {break}

        if (char == " ") {continue}
        if (char == "\t") {continue}
        if (char == "\n" && newlinesAreWhitespace) {continue}

        string += char
        charAmount -= 1
    }

    return string
}

//returns the line that the character at index is at
//first line = 0
function GetLineFromIndex(index: number) {
    return SCRIPT_CONTENTS.substring(0, index).split('\n').length-1
}

//returned number will be the first character AFTER the newline
function GetLineStart(index: number): number {
    let isFirstChar = true

    while (index > 0) {
        if (SCRIPT_CONTENTS[index] == "\n" && !isFirstChar) {return index+1}
        isFirstChar = false
        index--
    }
    return 0
}

//returned character will be the ending newline
function GetLineEnd(index: number): number {
    while (index < SCRIPT_CONTENTS.length) {
        if (SCRIPT_CONTENTS[index] == "\n") {return index}
        index++
    }
    return index
}

//returns the number of whitespace characters from CharIndex
function GetWhitespaceAmount(index: number,newlinesAreWhitespace = false): number {
    let count = 0

    while (index < SCRIPT_CONTENTS.length) {
        index++

        //count all characters part of a comment as whitespace
        if (SCRIPT_CONTENTS[index] == "#") {
            index += GetLineEnd(index) - index
        }

        if (
            (SCRIPT_CONTENTS[index] == "\t") ||
            (SCRIPT_CONTENTS[index] == " ")
        ) {
            count += 1
        } else {
            return count
        }
    }

    return count
}

//returns a string with every character from CharIndex until the first instance of anything in terminateAt
function GetCharactersUntil(index: number, terminateAt: Array<string>, ignoreCommentRules: boolean = false): [number, string] {
    let string = ""
    
    while (index < SCRIPT_CONTENTS.length) {
        let char = SCRIPT_CONTENTS[index]
        if (char == "#" && ignoreCommentRules == false) {
            char = "\n"
            index = GetLineEnd(index)
        }

        if (terminateAt.includes(char)) {
            return [index-1, string]
        }
        string += char
        index++
    }

    return [index-1, string]
}

function GetCharacterAtIndex(index: number) {
    if (SCRIPT_CONTENTS[index] == "#") {
        return "\n"
    }
    return SCRIPT_CONTENTS[index]
}

export {IsCharacterValidIdentifier, IsCharacterValidNumber, GetIdentifier, GetNextCharacters, GetLineFromIndex, GetLineStart, GetLineEnd, GetWhitespaceAmount, GetCharactersUntil, GetCharacterAtIndex}