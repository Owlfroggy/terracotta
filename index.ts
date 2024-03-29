//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code


import { Domain, DomainList, TargetDomain } from "./domains"
import { PrintError, TCError } from "./errorHandler"
import { IsCharacterValidIdentifier, IsCharacterValidNumber, GetIdentifier, GetNextCharacters, GetLineFromIndex, GetLineStart, GetLineEnd, GetWhitespaceAmount, GetCharactersUntil, GetCharacterAtIndex } from "./characterUtils"
import * as AD from "./actionDump"

export { }
const FILE_PATH = "testscripts/variables.tc"

export const SCRIPT_CONTENTS = await Bun.file(FILE_PATH).text()

//Current index in the file that the parser is looking at
var CharIndex = -1
var Running = true

var Lines: Array<Array<Token>> = []
var CurrentLine: Array<Token> = []

//==========[ constants ]=========\\

//==========[ helper functions ]=========\\

//none of this console.log bullshit! i mean do you seriously expect me to type that whole thing out every singel time i wanna print something!?!?!? at least its better than java but still
function print (...data: any[]) {
    console.log(...data)
}

//returned number will be index of closing char
//ERR1 = string was not closed
function GetString(index: number, openingChar: string, closingChar: string = openingChar): [number, string] | null {
    let initIndex = index

    //if not a string, return
    if (GetNextCharacters(index, 1) != openingChar) { return null }

    //move to start of string contents (after opening "")
    index += 1 + GetWhitespaceAmount(index)

    let string = ""
    while (index < SCRIPT_CONTENTS.length - 1) {
        let nextChunk = GetCharactersUntil(index + 1, ["\n", "\\", closingChar], true)[1]
        string += nextChunk
        index += nextChunk.length

        //if chunk stopp due to a backslash
        if (SCRIPT_CONTENTS[index + 1] == "\\") {
            //dont escape newline if a string is unclosed and ends on \
            if (SCRIPT_CONTENTS[index + 2] == "\n") {
                throw new TCError("String was never closed", 1, initIndex + GetWhitespaceAmount(initIndex) + 1, index + 1)
            }

            if (SCRIPT_CONTENTS[index + 2] == "n") {
                //newline from \n
                string += "\n"
            } else {
                //add char after backslash into the value without parsing it
                string += SCRIPT_CONTENTS[index + 2]
            }

            index += 2
        }
        //if chunk stopped due to closing char
        else if (SCRIPT_CONTENTS[index + 1] == closingChar) {
            return [index + 1, string]
        }
        //if chunk stopped due to newline
        else if (SCRIPT_CONTENTS[index + 1] == "\n") {
            throw new TCError("String was never closed", 1, initIndex + GetWhitespaceAmount(initIndex) + 1, index)
        }
    }
    throw new TCError("String was never closed", 1, initIndex + GetWhitespaceAmount(initIndex) + 1, index)
}

//function for names that can either be an identifier or contents of []
//ERR1: complex name never closed
//ERR2: missing name
function GetComplexName(index: number): [number, string] {
    //= parse event name =\\
    let complexNameResults
    let name

    //try [] name
    try {
        complexNameResults = GetString(index, "[", "]")
    }
    catch (e) {
        if (e.Code == 1) {
            throw new TCError("Name was never closed", 1, e.CharStart, e.CharLoc)
        }
    }

    //if theres a [, use the inside of the [] as name
    if (complexNameResults) {
        return [complexNameResults[0], complexNameResults[1]]
    }
    //otherwise, use identifier as name
    else {
        index += GetWhitespaceAmount(index)
        index++ //GetIdentifier starts first character of identifier so move 1 char to that

        //get name of variable
        let variableNameResults = GetIdentifier(index)
        if (variableNameResults == null || variableNameResults[1] == "") {
            throw new TCError(`Expected name'`, 2, index,-1)
        }

        return [variableNameResults[0], variableNameResults[1]]
    }
}

//Useful function for applying the results of most parsers
function ApplyResults(results: [number, ...any]) {
    //move cursor to the end of the variable
    CharIndex = results[0]

    //push variable token to current line
    CurrentLine.push(results[1])
}

//==========[ tokens ]=========\\

class Token {

}

class ExprOperatorToken extends Token {
    Operator: string
}

//==========[ Parser ]=========\\

//= Variables =\\
class VariableToken extends Token {
    constructor(scope: String, name: String) {
        super()
        if (scope == "global") { scope = "game" }
        this.Scope = scope
        this.Name = name
    }

    Scope: String
    Name: String
}

const VALID_VAR_SCCOPES = {
    "global": "game",
    "saved": "save",
    "local": "local",
    "line": "line"
}

//returned number will be closing ] or final character of identifier
//ERR1 = variable name never closed
function ParseVariable(index): [number, VariableToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index //used for error messages

    let keywordResults = GetIdentifier(index)
    if (keywordResults == null) { return null }

    let scopeKeyword = keywordResults[1]

    //if keyword is a var scope
    let scope = VALID_VAR_SCCOPES[scopeKeyword]
    if (scope == null) { return null }

    //move into position to parse variable name
    index = keywordResults[0]
    let keywordEndIndex = index// used for error messages

    let nameResults

    //parse variable name
    try {
        nameResults = GetComplexName(index)
    } catch (e) {
        if (e.Code == 1) {
            throw new TCError("Variable name was never closed", 1, e.CharStart, e.CharLoc)
        } else if (e.Code == 2) {
            throw new TCError(`Expected variable name following '${scopeKeyword}'`, 2, initIndex, keywordEndIndex)
        }
    }

    return [nameResults[0], new VariableToken(scopeKeyword, nameResults[1])]
}
//= String =\\

class StringToken extends Token {
    constructor(value: string) {
        super()
        this.String = value
    }

    String: string
}

//litearlly just GetString but it returns a string token
function ParseString(index: number, openingChar: string, closingChar: string = openingChar): [number, StringToken] | null {
    let results
    results = GetString(index, openingChar, closingChar)
    if (results) {
        return [results[0], new StringToken(results[1])]
    }

    return null
}

//= Number =\\
class NumberToken extends Token {
    constructor(value: string) {
        super()
        this.Number = value
    }
    Number: string
}

//ERR1 = invalid character found
//ERR2 = multiple decimal points
//returned number will be index of final character of the number
function ParseNumber(index: number): [number, NumberToken] | null {
    let initIndex = index

    //if not a number, return null
    if (!IsCharacterValidNumber(GetNextCharacters(index, 1))) { return null }

    let decimalFound = false
    let string = ""

    index += 1 + GetWhitespaceAmount(index)

    while (index < SCRIPT_CONTENTS.length) {
        //if this char is a .
        if (SCRIPT_CONTENTS[index] == ".") {
            //if there has already been a . throw error
            if (decimalFound) {
                throw new TCError("Multiple decimal points in one number", 2, index, index)
            }

            string += "."

            decimalFound = true
        }
        //if this char is a digit
        else if (IsCharacterValidNumber(SCRIPT_CONTENTS[index])) {
            //dont include any leading 0s
            if (string.length == 0 && SCRIPT_CONTENTS[index] == "0") {
                index++
                continue
            }

            string += SCRIPT_CONTENTS[index]
        }
        //if character is some other thing that shouldnt be allowed in numbers
        else if (IsCharacterValidIdentifier(SCRIPT_CONTENTS[index])) {
            throw new TCError(`'${SCRIPT_CONTENTS[index]}' is not a valid character in a number`, 1, index, index)
        }
        //if this character is the end of the number
        else {
            break
        }

        index++
    }

    //a single . on its own is not a number
    if (string == ".") { return null }

    //add one leading 0 if starting with decimal
    if (string == "") { string = "0" + string }

    //remove trailing decimal if nothing's after it
    if (string[string.length - 1] == ".") { string = string.substring(0, string.length - 1) }

    return [index - 1, new NumberToken(string)]
}

//= Vectors =\\
class VectorToken extends Token {
    constructor(x: ExpressionToken, y: ExpressionToken, z: ExpressionToken) {
        super()
        this.X = x
        this.Y = y
        this.Z = z
    }

    X: ExpressionToken
    Y: ExpressionToken
    Z: ExpressionToken
}

//ERR1 = missing arguments
//ERR2 = missing coordinate
function ParseVector(index: number): [number, VectorToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse vec keyword
    let identifierResults = GetIdentifier(index)

    //if no vec keyword, this is not a vector
    if (identifierResults == null || identifierResults[1] != "vec") { return null }

    //move to end of vec keyword
    index = identifierResults[0]

    //parse arguments
    let argResults = ParseList(index, "[", "]", ",")
    if (argResults == null) {
        throw new TCError("Expected arguments following vector constructor", 1, keywordInitIndex, index)
    }
    let args = argResults[1].Items

    //error for too many args
    if (args.length > 3) {
        throw new TCError(`Vector takes at most 3 arguments, ${args.length} were provided instead`, 3, keywordInitIndex, argResults[0])
    }

    //error for missing args
    if (args[0] == null) {
        throw new TCError("Vector is missing X coordinate", 2, keywordInitIndex, argResults[0])
    }

    if (args[1] == null) {
        throw new TCError("Vector is missing Y coordinate", 2, keywordInitIndex, argResults[0])
    }

    if (args[2] == null) {
        throw new TCError("Vector is missing Z coordinate", 2, keywordInitIndex, argResults[0])
    }

    //successful vector creation
    return [argResults[0], new VectorToken(args[0], args[1], args[2])]
}

//= Minimessage Text =\\
class TextToken extends Token {
    constructor(text: string) {
        super()
        this.Text = text
    }
    Text: string
}

//ERR1 = missing string
function ParseText(index: number): [number, TextToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse txt keyword
    let identifierResults = GetIdentifier(index)

    //if no txt keyword, this is not a text
    if (identifierResults == null || identifierResults[1] != "txt") { return null }

    //move to end of txt keyword
    index = identifierResults[0]

    //parse value (string)
    let stringResults = GetString(index, '"', '"')
    if (stringResults == null) {
        throw new TCError("Expected string following 'txt' keyword", 1, keywordInitIndex, index)
    }

    return [stringResults[0], new TextToken(stringResults[1])]
}

//= Sound =\\
class SoundToken extends Token {
    constructor(id: ExpressionToken, volume: ExpressionToken | null, pitch: ExpressionToken | null, variant: ExpressionToken | null) {
        super()
        this.SoundId = id
        this.Volume = volume
        this.Pitch = pitch
        this.Variant = variant
    }

    SoundId: ExpressionToken
    Variant: ExpressionToken | null
    Volume: ExpressionToken | null
    Pitch: ExpressionToken | null
}

function ParseSound(index: number): [number, SoundToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse snd keyword
    let identifierResults = GetIdentifier(index)

    //if no snd keyword, this is not a sound
    if (identifierResults == null || identifierResults[1] != "snd") { return null }

    //move to end of snd keyword
    index = identifierResults[0]

    //parse arguments
    let argResults = ParseList(index, "[", "]", ",")
    if (argResults == null) {
        throw new TCError("Expected arguments following sound constructor", 1, keywordInitIndex, index)
    }

    let args = argResults[1].Items

    //error for too many args
    if (args.length > 4) {
        throw new TCError(`Sound takes at most 4 arguments, ${args.length} were provided instead`, 3, keywordInitIndex, argResults[0])
    }

    //error for missing args
    if (args[0] == null) {
        throw new TCError("Sound is missing ID", 2, keywordInitIndex, argResults[0])
    }

    //successful location creation
    return [argResults[0], new SoundToken(args[0], args[1], args[2], args[3])]
}


//= Locations =\\
class LocationToken extends Token {
    constructor(x: ExpressionToken, y: ExpressionToken, z: ExpressionToken, pitch: ExpressionToken | null = null, yaw: ExpressionToken | null = null) {
        super()
        this.X = x
        this.Y = y
        this.Z = z
        this.Pitch = pitch
        this.Yaw = yaw
    }

    X: ExpressionToken
    Y: ExpressionToken
    Z: ExpressionToken
    Pitch: ExpressionToken | null
    Yaw: ExpressionToken | null
}

//ERR1 = missing arguments
//ERR2 = missing coordinate
//ERR3 = too many args
function ParseLocation(index: number): [number, LocationToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse loc keyword
    let identifierResults = GetIdentifier(index)

    //if no loc keyword, this is not a location
    if (identifierResults == null || identifierResults[1] != "loc") { return null }

    //move to end of loc keyword
    index = identifierResults[0]

    //parse arguments
    let argResults = ParseList(index, "[", "]", ",")
    if (argResults == null) {
        throw new TCError("Expected arguments following location constructor", 1, keywordInitIndex, index)
    }
    let args = argResults[1].Items

    //error for too many args
    if (args.length > 5) {
        throw new TCError(`Location takes at most 5 arguments, ${args.length} were provided instead`, 3, keywordInitIndex, argResults[0])
    }

    //error for missing args
    if (args[0] == null) {
        throw new TCError("Location is missing X coordinate", 2, keywordInitIndex, argResults[0])
    }

    if (args[1] == null) {
        throw new TCError("Location is missing Y coordinate", 2, keywordInitIndex, argResults[0])
    }

    if (args[2] == null) {
        throw new TCError("Location is missing Z coordinate", 2, keywordInitIndex, argResults[0])
    }

    //successful location creation
    return [argResults[0], new LocationToken(args[0], args[1], args[2], args[3], args[4])]
}

//= Potions =\\
class PotionToken extends Token {
    constructor(pot: ExpressionToken, amp: ExpressionToken | null, dur: ExpressionToken | null) {
        super()
        this.Potion = pot
        this.Amplifier = amp
        this.Duration = dur
    }

    Potion: ExpressionToken
    Amplifier: ExpressionToken | null
    Duration: ExpressionToken | null
}

function ParsePotion(index): [number, PotionToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse pot keyword
    let identifierResults = GetIdentifier(index)

    //if no pot keyword, this is not a potion
    if (identifierResults == null || identifierResults[1] != "pot") { return null }

    //move to end of pot keyword
    index = identifierResults[0]

    //parse arguments
    let argResults = ParseList(index, "[", "]", ",")
    if (argResults == null) {
        throw new TCError("Expected arguments following potion constructor", 1, keywordInitIndex, index)
    }
    let args = argResults[1].Items

    return [argResults[0],new PotionToken(args[0],args[1],args[2])]
}

//= Items =\\
class ItemToken extends Token {
    constructor(id: ExpressionToken, count: ExpressionToken | null = null, nbt: ExpressionToken | undefined, library: ExpressionToken | undefined) {
        super()
        this.Id = id
        this.Count = count
        this.Nbt = nbt
        this.Library = library

        if (this.Library) {
            this.Mode = "library"
        } else {
            this.Mode = "basic"
        }
    }

    Id: ExpressionToken
    Library: ExpressionToken | undefined
    Count: ExpressionToken | null
    Nbt: ExpressionToken | undefined

    Mode: "basic" | "library"
}

//BASIC ITEM SYNTAX: item [id,count,nbt]
//LIB ITEM SYNTAX: litem [library, id, count]
function ParseItem(index: number): [number, ItemToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse item keyword
    let identifierResults = GetIdentifier(index)

    //if no item keyword, this is not an item
    if (identifierResults == null || !(identifierResults[1] == "item" || identifierResults[1] == "litem")) { return null }

    //move to end of item keyword
    index = identifierResults[0]

    //parse arguments
    let argResults = ParseList(index, "[", "]", ",")
    if (argResults == null) {
        throw new TCError("Expected arguments following item constructor", 1, keywordInitIndex, index)
    }
    let args = argResults[1].Items

    //basic item
    if (identifierResults[1] == "item") {
        return [argResults[0], new ItemToken(args[0], args[1], args[3], undefined)]
        //library item
    } else if (identifierResults[1] == "litem") {
        return [argResults[0], new ItemToken(args[1],args[2],undefined,args[0])]
    }

    return [argResults[0],new ItemToken(args[0],args[1],args[2],args[3])]
}

//= Operators =\\
const ValidAssignmentOperators = ["=", "+=", "-=", "*=", "/="]
const ValidMathOperators = ["+", "-", "*", "/", "^"]
const ValidComparisonOperators = ["==", "!=", "<", ">", "<=", ">="]

class OperatorToken extends Token {
    constructor(operator: string) {
        super()
        this.Operator = operator
    }

    Operator: string
}

//create lists of lengths of all operators, one entry per length
const AssignmentOperatorsLengths: Array<number> = []
for (const v of ValidAssignmentOperators) {
    if (!AssignmentOperatorsLengths.includes(v.length)) {
        AssignmentOperatorsLengths.push(v.length)
    }
}

const MathOperatorsLengths: Array<number> = []
for (const v of ValidMathOperators) {
    if (!MathOperatorsLengths.includes(v.length)) {
        MathOperatorsLengths.push(v.length)
    }
}

const ComparisonOperatorsLengths: Array<number> = []
for (const v of ValidComparisonOperators) {
    if (!ComparisonOperatorsLengths.includes(v.length)) {
        ComparisonOperatorsLengths.push(v.length)
    }
}

//returned number is final character in the operator
function ParseOperator(index: number, operatorType: "assignment" | "math" | "comparison"): [number, OperatorToken] | null {
    index += GetWhitespaceAmount(index)

    let validOperators
    let lengthList
    switch (operatorType) {
        case "assignment":
            validOperators = ValidAssignmentOperators
            lengthList = AssignmentOperatorsLengths
            break
        case "math":
            validOperators = ValidMathOperators
            lengthList = MathOperatorsLengths
            break
        case "comparison":
            validOperators = ValidComparisonOperators
            lengthList = ComparisonOperatorsLengths
            break
    }

    //try every possible length of operator
    for (const length of lengthList) {
        let operatorString = GetNextCharacters(index, length)

        if (validOperators.includes(operatorString)) {
            return [index + length, new OperatorToken(operatorString)]
        }
    }

    return null
}

//= ListToken =\\
class ListToken extends Token {
    constructor(items: Array<ExpressionToken>) {
        super()
        this.Items = items
    }
    Items: Array<ExpressionToken>
}

//ERR1 = list was never closed
function ParseList(index, openingChar: string, closingChar: string, seperatingChar: string): [number, ListToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    if (GetNextCharacters(index, 1) != openingChar) { return null }

    //move to opening char
    index += GetWhitespaceAmount(index) + 1

    let items: Array<ExpressionToken> = []

    while (SCRIPT_CONTENTS[index] != closingChar) {
        let expressionResults
        try {
            expressionResults = ParseExpression(index, [seperatingChar, closingChar], false)
        } catch (e) {
            if (e.message == "Expression was never closed") {
                throw new TCError("List was never closed", 1, initIndex + 1, GetLineEnd(index) - 1)
            } else {
                throw e
            }
        }
        if (expressionResults == null) {
            //the only situation this can happen is when the list is empty eg. ()
            //move to closing char so loop finishes:
            index += GetWhitespaceAmount(index) + 1
        }
        else if (expressionResults != null) {
            index = expressionResults[0] + GetWhitespaceAmount(expressionResults[0]) + 1
            items.push(expressionResults[1])
        }
    }

    return [index, new ListToken(items)]
}

//= Control =\\
//break, skip, endthread, return, returnmult, wait
const ValidControlKeywords = ["break","continue","return","returnmult","wait","endthread"]
const ValidWaitUnits = {
    "ticks": "Ticks",
    "seconds": "Seconds",
    "minutes": "Minutes",

    "t": "Ticks",
    "s": "Seconds",
    "m": "Minutes"
}

class ControlBlockToken extends Token {
    constructor(action: string, params: ListToken | null = null, tags: Dict<ActionTag> | null = null) {
        super()
        this.Action = action
        this.Params = params
        this.Tags = tags
    }

    Action: string
    Params: ListToken | null
    Tags: Dict<ActionTag> | null
}

function ParseControlBlock(index: number): [number, ControlBlockToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index

    //get keyword
    let identifierResults = GetIdentifier(index)
    if (identifierResults != null && !ValidControlKeywords.includes(identifierResults[1])) {
        return null
    }

    index = identifierResults[0]

    //return action based on what keyword was used
    if (identifierResults[1] == "break") {
        return [index, new ControlBlockToken("StopRepeat")]
    } 
    else if (identifierResults[1] == "continue") {
        return [index, new ControlBlockToken("Skip")]
    }
    else if (identifierResults[1] == "endthread") {
        return [index, new ControlBlockToken("End")]
    }
    else if (identifierResults[1] == "return") {
        return [index, new ControlBlockToken("Return")]
    }
    else if (identifierResults[1] == "returnmult") {
        //parse number for how many times to return
        let expressionResults = ParseExpression(index,["\n"],false)
        if (expressionResults == null) {
            throw new TCError("Expected number following 'returnmult'",0,initIndex,index)
        }

        return [expressionResults[0], new ControlBlockToken("ReturnNTimes",new ListToken([expressionResults[1]]))]
    }
    else if (identifierResults[1] == "wait") {
        let listResults = ParseList(index,"(",")",",")
        if (listResults == null) {
            throw new TCError("Expected arguments following 'wait'",0,initIndex,index)
        }
        index = listResults[0]

        let tagResults = ParseTags(index, {"Time Unit":["Ticks", "Seconds", "Minutes"]})
        let tags
        if (tagResults) {
            index = tagResults[0]
            tags = tagResults[1]
        }

        return [index, new ControlBlockToken("Wait",listResults[1],tags)]
    }   

    return null
}

//= If statements!!! =\\
class ElseToken extends Token {
    Else = "Else"
}

function ParseElse(index: number): [number, ElseToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let identifierResults = GetIdentifier(index)

    if (identifierResults != null && identifierResults[1] == "else") {
        return [identifierResults[0], new ElseToken()]
    }

    return null
}

class IfToken extends Token {
    constructor(not: boolean) {
        super()
        if (not != null) { this.Not = not }
    }

    If = "If"
    Not: boolean = false
}

function ParseIf(index: number): [number, IfToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let identifierResults = GetIdentifier(index)
    let not = false

    //if this is an "if" keyword
    if (identifierResults != null && identifierResults[1] == "if") {
        index = identifierResults[0]

        //try for not
        let notResults = GetIdentifier(index + 1 + GetWhitespaceAmount(index))
        if (notResults != null && notResults[1] == "not") {
            not = true
            index = notResults[0]
        }

        return [index, new IfToken(not)]
    }

    return null
}

//= Brackets =\\
class BracketToken extends Token {
    constructor(type: "open" | "close") {
        super()
        this.Type = type
    }

    Type: "open" | "close"
}

//= Action =\\
class ActionTag {
    constructor(name: string, value: string, variable: VariableToken | null = null) {
        this.Name = name
        this.Value = value
        this.Variable = variable
    }

    Name: string
    Value: string
    Variable: VariableToken | null
}

class ActionToken extends Token {
    constructor(domain: string, action: string, params: ListToken | null = null, isComparison: boolean = false, tags: Dict<ActionTag> = {}) {
        super()
        this.DomainId = domain
        this.Action = action
        this.Params = params
        this.Tags = tags
        if (isComparison) { this.Type = "comparison" }
    }

    Params: ListToken | null
    Tags: Dict<ActionTag>
    DomainId: string
    Action: string
    Type: "comparison" | "action" = "action"
}

function ParseTags(index, validTags): [number,Dict<ActionTag>] | null {
    let tags = {}

    if (GetNextCharacters(index, 1) == "[") {
        //move to opening <
        index += 1 + GetWhitespaceAmount(index)

        //if empty tag list
        if (GetNextCharacters(index, 1) == "]") {
            index += 1 + GetWhitespaceAmount(index)
            return null
        } else {
            let tagsListInitIndex = index

            while (SCRIPT_CONTENTS[index] != "]") {
                //move to first character of tag name
                index += 1 + GetWhitespaceAmount(index)

                //parse tag name
                let tagNameResults = GetCharactersUntil(index, [":", "\n", "]"])
                if (tagNameResults[1] == "") {
                    throw new TCError("Missing tag name", 3, index, index)
                }
                //remove trailing whitespace from tag name
                let tagName = tagNameResults[1].trim()

                //error if invalid tag name
                if (validTags[tagName] == undefined) {
                    throw new TCError(`Invalid tag name: '${tagName}'`, 4, index, index + tagName.length - 1)
                }

                //move to end of tag name
                index = tagNameResults[0]

                //error if next char isn't :
                if (GetNextCharacters(index, 1) != ":") {
                    throw new TCError("Expected ':' following tag name", 6, index + 1, index + 1)
                }

                //move to :
                index += 1 + GetWhitespaceAmount(index)

                //parse variable
                let variableResults = ParseVariable(index)
                let variable: VariableToken | null = null
                if (variableResults) {
                    let variableInitIndex = index
                    //move to end of variable
                    index = variableResults[0]

                    //throw error if next character isn't a ?
                    if (GetNextCharacters(index, 1) != "?") {
                        throw new TCError(`Expected '?' following variable '${variableResults[1].Name}'`, 9, index + 1, index + 1)
                    }

                    variable = variableResults[1]

                    //move to ?
                    index += 1 + GetWhitespaceAmount(index)
                }
                let lastCharIndex = index

                //move to first character of value
                index += 1 + GetWhitespaceAmount(index)

                //parse tag value
                let tagValueResults = GetCharactersUntil(index, [",", "\n", "]"])

                //error if missing tag value
                if (tagValueResults[1] == "") {
                    if (variable) {
                        throw new TCError("Expected tag value following '?'", 7, lastCharIndex, lastCharIndex)
                    } else {
                        throw new TCError("Expected variable or tag value", 7, index, index)
                    }
                }
                //remove trailing whitespace from tag value
                let tagValue = tagValueResults[1].trim()

                //error if invalid tag value
                if (!validTags[tagName].includes(tagValue)) {
                    throw new TCError(`Invalid tag value: '${tagValue}'`, 8, index, index + tagValue.length - 1)
                }

                //move to end of tag value
                index = tagValueResults[0]

                //throw error if next character is end of line
                if (GetNextCharacters(index, 1) == "\n" || index + 1 + GetWhitespaceAmount(index) >= SCRIPT_CONTENTS.length) {
                    throw new TCError("Tags list never closed", 5, tagsListInitIndex, GetLineEnd(index) - 1)
                }

                //move to next character (, or >)
                index += 1 + GetWhitespaceAmount(index)

                //add to tag list
                tags[tagName] = new ActionTag(tagName, tagValue, variable)
            }

            return [index,tags]
        }
    }

    return null
}

//ERR1 = missing function
//ERR2 = invalid function
//ERR3 = missing tag name
//ERR4 = invalid tag name
//ERR5 = tags never closed
//ERR6 = missing : after tag name
//ERR7 = missing tag value
//ERR8 = invalid tag value
//ERR9 = missing ? after tag value variable

function ParseAction(index: number, allowComparisons: boolean = false): [number, ActionToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    //= parse domain =\\
    let domainResults = GetIdentifier(index + 1)
    if (domainResults == null) { return null }

    let domain = DomainList[domainResults[1]]
    if (!domain) { return null }

    //move to end of domain
    index = domainResults[0]

    //= only progress if calling an action =\\
    let accessor = GetNextCharacters(index, 1)
    if (
        !(accessor == ":") &&
        !(accessor == "?" && allowComparisons)
    ) {
        return null
    }
    let isComparison = false
    let actions = domain.Actions
    if (accessor == "?") {
        isComparison = true
        actions = domain.Comparisons
    }

    //move to the accessor
    index += 1 + GetWhitespaceAmount(index)

    //= parse action =\\
    let actionResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
    //error for missing action
    if (actionResults == null || actionResults[1] == "") {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Expected name for ${domain.ActionType} action`, 1, initIndex + 1, index)
        }
        else {
            throw new TCError(`Expected function name`, 1, initIndex + 1, index)
        }
    }

    //error for invalid action
    if (actions[actionResults[1]] == undefined) {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Invalid ${isComparison == true ? 'if ' : ''}${domain.ActionType} action: '${actionResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, actionResults[0])
        }
        else if (domain.Identifier == "game") {
            throw new TCError(`Invalid ${isComparison == true ? 'if ' : ''}game action: '${actionResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, actionResults[0])
        }
        else {
            throw new TCError(`${domain.Identifier} does not contain function '${actionResults[1]}`, 2, index + GetWhitespaceAmount(index) + 1, actionResults[0])
        }
    }

    //move to the end of the action name
    index = actionResults[0]

    //parse params
    let paramResults = ParseList(index, "(", ")", ",")
    let params: ListToken
    if (paramResults) {
        index = paramResults[0]
        params = paramResults[1]
    } else {
        params = new ListToken([])
    }

    let tagResults = ParseTags(index,actions[actionResults[1]]!.Tags)
    let tags
    if (tagResults != null) {
        tags = tagResults[1]
        index = tagResults[0]
    }

    return [index, new ActionToken(domain.Identifier, actionResults[1], params, isComparison, tags!)]
}

//= Call function/start process =\\
class CallToken extends Token {
    constructor(type: "function" | "process", name: string, args: ListToken | null, tags: Dict<ActionTag> | null) {
        super()
        this.Type = type
        this.Name = name
        this.Arguments = args
        this.Tags = tags
    }

    Type: "function" | "process"
    Name: string
    Arguments: ListToken | null
    Tags: Dict<ActionTag> | null
}

function ParseCall(index: number): [number, CallToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    let mode

    //parse keyword
    let keywordResults = GetIdentifier(index)
    if (keywordResults[1] == "call") {
        mode = "function"
    } else if (keywordResults[1] == "start") {
        mode = "process"
    } else {
        return null
    }

    //parse function name (totally not copy pasted from ParseVariable)
    let name
    //move into position to parse function name
    index = keywordResults[0]

    let keywordEndIndex = index// used for error messages

    //get name
    let nameResults
    try {
        nameResults = GetComplexName(index)
    }
    catch (e) {
        if (e.Code == 1) {
            throw new TCError(`${mode == "function" ? "Function" : "Process"} name was never closed`, 1, e.CharStart, e.CharLoc)
        } else if (e.Code == 2) {
            throw new TCError(`Expected function name`, 2, initIndex, keywordEndIndex)
        }
    }

    index = nameResults[0]
    name = nameResults[1]

    let args
    let tags

    //parse arguments
    if (mode == "function") {
        let argsResults = ParseList(index,"(",")",",")
        if (argsResults) {
            index = argsResults[0]
            args = argsResults[1]
        }
    }

    //parse tags
    if (mode == "process") {
        let tagsResults = ParseTags(index,{"Local Variables":["Don't copy", "Copy", "Share"],"Target Mode":["With current targets", "With current selection", "With no targets", "For each in selection"]})
        if (tagsResults) {
            index = tagsResults[0]
            tags = tagsResults[1]
        }
    }

    return [index, new CallToken(mode,name,args,tags)]
}

//= Identifier ==\\
class IdentifierToken extends Token {
    constructor(identifier: string) {
        super()
        this.Identifier = identifier
    }

    Identifier: string
}

//= Targets =\\
class TargetToken extends Token {
    constructor(target: string) {
        super()
        this.Target = target
    }

    Target: string
}

const ValidTargets = ["default", "defaultEntity", "selection", "selectionEntity", "killer", "killerEntity", "damager", "damagerEntity", "victim", "victimEntity", "shooter", "shooterEntity", "lastEntity", "projectile"]

function ParseTarget(index: number): [number, TargetToken] | null {
    index += GetWhitespaceAmount(index) + 1

    let targetResults = GetIdentifier(index)
    if (targetResults == null) { return null }

    if (ValidTargets.includes(targetResults[1])) {
        return [targetResults[0], new TargetToken(targetResults[1])]
    }

    return null
}


//======== SPECIAL CODE ITEMS ========\\

//= Game Values =\\
class GameValueToken extends Token {
    constructor(gameValue: string, target: string | null) {
        super()
        this.Value = gameValue
        this.Target = target
    }

    Value: string
    Target: string | null
}

function ParseGameValue(index: number): [number, Token] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    //= parse domain =\\
    let domainResults = GetIdentifier(index + 1)
    if (domainResults == null) { return null }

    let domain = DomainList[domainResults[1]]
    if (!domain) { return null }

    //move to end of domain
    index = domainResults[0]

    //= only progress if accessing a game value
    if (GetNextCharacters(index, 1) != ".") { return null }

    //move to the accessor
    index += 1 + GetWhitespaceAmount(index)

    //= parse value =\\
    let valueResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
    //error for missing action
    if (valueResults == null || valueResults[1] == "") {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Expected name for game value`, 1, initIndex + 1, index)
        }
        else {
            throw new TCError(`Expected value name`, 1, initIndex + 1, index)
        }
    }

    //error for invalid value
    if (domain.Values[valueResults[1]] == undefined) {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Invalid targeted game value: '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
        }
        else {
            throw new TCError(`'${domain.Identifier} does not contain value '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
        }
    }

    //move to the end of the action name
    index = valueResults[0]

    return [index, new GameValueToken(valueResults[1], domain.Identifier)]
}

//= Expressions =\\
class ExpressionToken extends Token {
    constructor(symbols: Array<any>) {
        super()
        this.Expression = symbols
    }

    Expression: Array<ExprOperatorToken | StringToken>
}

//ERR1 = expression never closed
//ERR2 = invalid value
//ERR3 = invalid operator
//ERR4 = expression started with operator
//ERR5 = operator instead of value
//ERR6 = multiple comparisons
function ParseExpression(index: number, terminateAt: Array<string | null> = ["\n"], endIndexAtTerminator: boolean = true, allowComparisons: boolean = false): [number, ExpressionToken] | null {
    //if it should terminate at a newline, also terminate at eof
    if (terminateAt.includes("\n")) {
        if (!terminateAt.includes(null)) { terminateAt.push(null) }
        if (!terminateAt.includes("")) { terminateAt.push("") }
    }

    let expressionSymbols: Array<any> = []
    let comparisonFound = false

    let initIndex = index
    index += GetWhitespaceAmount(index)
    while (!terminateAt.includes(GetNextCharacters(index, 1, false))) {
        let valueInitIndex = index

        //= ERROR: expression isnt closed
        if (GetNextCharacters(index, 1) == "\n" || (GetNextCharacters(index, 1) == "" && !terminateAt.includes("\n"))) {
            throw new TCError("Expression was never closed", 1, initIndex, index)
        }

        let results: [number, Token] | null = null
        // parse next token!!

        //if previous token is an operator or this is the first token in the expression, parse for value
        if (expressionSymbols[expressionSymbols.length - 1] instanceof OperatorToken || expressionSymbols.length == 0) {
            //try nested expression
            if (GetNextCharacters(index, 1) == "(") {
                results = ParseExpression(index + GetWhitespaceAmount(index) + 1, [")"])
            }

            //try string
            if (results == null) { results = ParseString(index, "\"") }

            //try number
            if (results == null) { results = ParseNumber(index) }

            //try location
            if (results == null) { results = ParseLocation(index) }

            //try vector
            if (results == null) { results = ParseVector(index) }

            //try text
            if (results == null) { results = ParseText(index) }

            //try sound
            if (results == null) { results = ParseSound(index) }

            //try potion
            if (results == null) { results = ParsePotion(index) }

            //try variable
            if (results == null) { results = ParseVariable(index) }

            //try item
            if (results == null) { results = ParseItem(index) }

            //try action
            if (results == null) { results = ParseAction(index, true) }

            //try function
            if (results == null) { 
                results = ParseCall(index)

                if (results && (results[1] as CallToken).Type == "process") {
                    throw new TCError("Processes cannot be started from within expressions",0,valueInitIndex + GetWhitespaceAmount(valueInitIndex) + 1,results[0])
                }
            }

            //try game value
            if (results == null) { results = ParseGameValue(index) }

            if (results == null) {
                //= ERROR: operator was given instead of expr
                let operatorResults = ParseOperator(index, "math")
                if (operatorResults != null) {
                    if (expressionSymbols.length == 0) {
                        throw new TCError("Expressions can't start with operators", 4, initIndex + GetWhitespaceAmount(initIndex) + 1, initIndex + GetWhitespaceAmount(initIndex) + 1)
                    } else {
                        throw new TCError("Expected value or expression following operator", 5, index + GetWhitespaceAmount(index) + 1, index + GetWhitespaceAmount(index) + 1)
                    }
                }

                let identifierResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)!
                if (identifierResults[1] == "") {
                    throw new TCError(`Invalid character: '${GetNextCharacters(index, 1)}'`, 2, valueInitIndex + GetWhitespaceAmount(index) + 1, valueInitIndex + GetWhitespaceAmount(index) + 1)
                }
                else {
                    throw new TCError(`Invalid value: '${GetIdentifier(index + GetWhitespaceAmount(index) + 1)![1]}'`, 2, valueInitIndex + GetWhitespaceAmount(index) + 1, identifierResults[0])
                }
            }
        }
        //otherwise, parse for operator 
        else {
            results = ParseOperator(index, "math")

            //comparison operator
            if (results == null && allowComparisons) {
                results = ParseOperator(index, "comparison")

                //error if this is the not the first comparison operator in this expression
                if (results != null && comparisonFound) {
                    throw new TCError("Cannot have more than one comparison per statement", 6, valueInitIndex + GetWhitespaceAmount(valueInitIndex) + 1, results[0])
                }

                comparisonFound = true
            }

            //= ERROR: invalid operator
            if (results == null) {
                let identifierResults = GetCharactersUntil(index + GetWhitespaceAmount(index) + 1, [" ", "\n"])
                throw new TCError(`Expected operator, got '${identifierResults[1]}'`, 3, index + GetWhitespaceAmount(index) + 1, identifierResults[0])
            }
        }


        if (results) {
            expressionSymbols.push(results[1])
            index = results[0]
            continue
        } else {
            throw Error("y'all, that expression dont look right")
        }
    } //end of value while loop

    //= ERROR: throw err if expression ends with operator
    if (expressionSymbols[expressionSymbols.length - 1] instanceof OperatorToken) {
        throw new TCError("Expression cannot end on an operator", 1, index, index)
    }

    //if this expression has a terminator, move index to that terminate if told to
    if (terminateAt.includes(GetNextCharacters(index, 1)) && endIndexAtTerminator) {
        //dont move if expression ended because of eof
        if (GetNextCharacters(index, 1) != "") {
            index += 1 + GetWhitespaceAmount(index)
        }
    }

    if (expressionSymbols.length > 0) {
        return [index, new ExpressionToken(expressionSymbols)]
    }

    return null
}

//= Metadata Headers ==\\
class MetadataToken extends Token {} //base class for all metadata thingies

//functiosn and processes also use this
class EventMetadataToken extends MetadataToken {
    constructor(codeblock: string, event: string) {
        super()
        this.Codeblock = codeblock
        this.Event = event
    }

    Codeblock: string
    Event: string
}

function ParseEventMetadata(index: number): [number, EventMetadataToken] | null {
    index += GetWhitespaceAmount(index) + 1
    
    //make sure its the right metadata typre
    let identifierResults = GetIdentifier(index)
    if (identifierResults == null || !AD.ValidLineStarters[identifierResults[1]]) { return null }
    index = identifierResults[0]

    let nameResults = GetComplexName(index)

    return [nameResults[0], new EventMetadataToken(identifierResults[1],nameResults[1])]
}

let symbols = "!@#$%^&*(){}[]-:;\"'~`=/*-+|\\/,.<>".split("")
let InMetadataParsingStage = true

//main logic goes here
function DoTheThing(): void {
    let previousLine = Lines[Lines.length - 1]
    if (previousLine == undefined) { previousLine = [] }

    //if at the end of a line, push that line and start a new one
    if (GetNextCharacters(CharIndex, 1) == "\n" || CharIndex + GetWhitespaceAmount(CharIndex) == SCRIPT_CONTENTS.length - 1 || SCRIPT_CONTENTS[CharIndex] == "#") {
        //dont push empty lines
        if (CurrentLine.length > 0) {
            Lines.push(CurrentLine)
        }

        CurrentLine = []

        //if this is a line whos entire purpose is to be a comment
        if (SCRIPT_CONTENTS[CharIndex] == "#") {
            //skip to end of comment
            CharIndex = GetLineEnd(CharIndex)
        }

        //if at the end of the file, stop running
        if (CharIndex + GetWhitespaceAmount(CharIndex) >= SCRIPT_CONTENTS.length - 1) {
            Running = false
            return
        }

        //keep skipping blank lines
        while (GetNextCharacters(CharIndex, 1) == "\n") {
            CharIndex++

            //if this is just a stray newline before the end of the file, dont bother parsing next line. stop runnign immediately instead
            if (CharIndex + 1 >= SCRIPT_CONTENTS.length) {
                Running = false
                return
            }
        }

        return
    }

    //else parsing
    if (
        (previousLine[0] instanceof BracketToken && previousLine[0].Type == "close") ||
        (CurrentLine[CurrentLine.length - 1] instanceof BracketToken && (CurrentLine[CurrentLine.length - 1] as BracketToken).Type == "close")
    ) {
        let results = ParseElse(CharIndex)
        if (results) {
            //apply else token
            ApplyResults(results)

            //parse opening bracket
            if (GetCharacterAtIndex(CharIndex + GetWhitespaceAmount(CharIndex) + 1) == "{") {
                CharIndex += GetWhitespaceAmount(CharIndex) + 1
                CurrentLine.push(new BracketToken("open"))
            } else {
                throw new TCError("Else statement missing opening bracket", 0, CharIndex, -1)
            }

            return
        }
    }

    // if current line is empty
    if (CurrentLine.length == 0) {
        let results

        //metadata
        if (InMetadataParsingStage) {
            //top event metadata e.g. 'PLAYER_EVENT LeftClick'
            if (results == null) { results = ParseEventMetadata(CharIndex)}
        }

        //try control
        if (results == null) { results = ParseControlBlock(CharIndex) }

        //try closing bracket
        if (GetNextCharacters(CharIndex, 1) == "}") { results = [CharIndex + 1 + GetWhitespaceAmount(CharIndex), new BracketToken("close")] }

        //try if
        if (results == null) { results = ParseIf(CharIndex) }

        //try action
        if (results == null) { results = ParseAction(CharIndex) }

        //try target
        if (results == null) { results = ParseTarget(CharIndex) }

        //try variable
        if (results == null) { results = ParseVariable(CharIndex) }

        //try function/process
        if (results == null) { results = ParseCall(CharIndex) }

        //error
        if (results == null) {
            let result = GetCharactersUntil(CharIndex + 1 + GetWhitespaceAmount(CharIndex), [" ", "\n"])
            throw new TCError(`Unexpected '${result[1]}'`, 0, CharIndex + 1 + GetWhitespaceAmount(CharIndex), result[0])
        }

        //if any token other than metadata is found, stop allowing metadata
        if (!(results[1] instanceof MetadataToken)) {
            InMetadataParsingStage = false
        }

        ApplyResults(results)
        return
    }

    //if current line is an if statement
    if (CurrentLine[0] instanceof IfToken) {
        //parse condition
        try {
            let expressionResults = ParseExpression(CharIndex, ["{"], undefined, true)!

            if (expressionResults == null) { throw new TCError("expr results somehow returned null", 0, CharIndex, -1) }
            ApplyResults(expressionResults)
        }
        catch (e) {
            //missing opening bracket
            if (e.Code == 1) {
                throw new TCError("If statement missing opening bracket", 0, CharIndex, -1)
            } else {
                throw e
            }
        }

        //parse opening bracket
        if (GetCharacterAtIndex(CharIndex) == "{") {
            CurrentLine.push(new BracketToken("open"))
        }

        return
    }

    //if current line starts with a variable
    if (CurrentLine[0] instanceof VariableToken) {
        //if the only thing in the line is a variable
        if (CurrentLine.length == 1) {
            //check for an operator
            let operatorResults = ParseOperator(CharIndex, "assignment")
            if (operatorResults) {
                ApplyResults(operatorResults)
                return
            }
        }

        //if line is <variable> <operator>
        if (CurrentLine[1] instanceof OperatorToken) {
            let operation = CurrentLine[1].Operator
            //<variable> =
            //must be followed by an expression
            if (ValidAssignmentOperators.includes(operation)) {
                //parse expression
                let expressionResults = ParseExpression(CharIndex, ["\n"], false)
                if (expressionResults) {
                    ApplyResults(expressionResults)
                    return
                }
            }
        }
    }

    //fallback error for random symbols
    if (symbols.includes(GetNextCharacters(CharIndex, 1))) {
        throw new TCError(`Unexpected ${GetNextCharacters(CharIndex, 1)}`, 0, CharIndex + GetWhitespaceAmount(CharIndex) + 1, CharIndex + GetWhitespaceAmount(CharIndex) + 1)
    }

    console.log("Current line:", CurrentLine)
    console.log("Current indx:", CharIndex)
    throw new TCError("Something's definitely wrong here (fallback error)", 0, CharIndex, CharIndex)
}

//==========[ other code ]=========\\
let WasErrorThrown = false

while (Running) {
    try {
        DoTheThing()
    } catch (e) {
        PrintError(e)
        WasErrorThrown = true
        break
    }
}

if (!WasErrorThrown) {
    console.log(JSON.stringify(Lines, null, "  "))
}