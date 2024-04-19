//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code


import { Domain, DomainList, TargetDomain, GenericDomains, GenericTargetDomains, PublicDomains } from "./domains"
import { PrintError, TCError } from "./errorHandler"
import { DEBUG_MODE, print } from "./main"
import { IsCharacterValidIdentifier, IsCharacterValidNumber, GetIdentifier, GetNextCharacters, GetLineFromIndex, GetLineStart, GetLineEnd, GetWhitespaceAmount, GetCharactersUntil, GetCharacterAtIndex } from "./characterUtils"
import * as AD from "./actionDump"
import { UnzipPassThrough } from "fflate"

import {VALID_TYPES, VALID_PARAM_MODIFIERS, VALID_VAR_SCCOPES, VALID_ASSIGNMENT_OPERATORS, VALID_MATH_OPERATORS, VALID_COMPARISON_OPERATORS, VALID_CONTROL_KEYWORDS, VALID_TARGETS, VALID_HEADER_KEYWORDS} from "./constants"


//Current index in the file that the parser is looking at
export var SCRIPT_CONTENTS: string
var CharIndex = -1
var Running = true

var Lines: Array<Array<Token>> = []
var CurrentLine: Array<Token> = []

//==========[ constants ]=========\\

//==========[ helper functions ]=========\\

//returned number will be index of closing char
//ERR1 = string was not closed
function GetString(index: number, openingChar: string, closingChar: string = openingChar, features: Array<"ampersandConversion"> = []): [number, string] | null {
    let initIndex = index + GetWhitespaceAmount(index) + 1

    //if not a string, return
    if (GetNextCharacters(index, 1) != openingChar) { return null }

    //move to start of string contents (after opening "")
    index += 1 + GetWhitespaceAmount(index)

    let string = ""
    while (index < SCRIPT_CONTENTS.length - 1) {
        let nextChunk = GetCharactersUntil(index + 1, ["\n", "\\", "&", closingChar], true)[1]
        string += nextChunk
        index += nextChunk.length

        //if chunk stopp due to a backslash
        if (SCRIPT_CONTENTS[index + 1] == "\\") {
            //dont escape newline if a string is unclosed and ends on \
            if (SCRIPT_CONTENTS[index + 2] == "\n") {
                throw new TCError("String was never closed", 1, initIndex, index + 1)
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
        //if chunk stopped due to &
        else if (SCRIPT_CONTENTS[index + 1] == "&") {
            //insert § if that's enabled
            string += features.includes("ampersandConversion") ? "\u00A7" : "&"

            index++
        }
        //if chunk stopped due to closing char
        else if (SCRIPT_CONTENTS[index + 1] == closingChar) {
            return [index + 1, string]
        }
        //if chunk stopped due to newline
        else if (SCRIPT_CONTENTS[index + 1] == "\n") {
            throw new TCError("String was never closed", 1, initIndex, index)
        }
    }
    throw new TCError("String was never closed", 1, initIndex, index)
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

export class Token {
    constructor(metadata: [number, number]) {
        this.CharStart = metadata[0]
        this.CharEnd = metadata[1]
    }

    CharStart: number
    CharEnd: number

    itemtype: string
}

//==========[ Parser ]=========\\

//= Variables =\\
export class VariableToken extends Token {
    constructor(meta,scope: string, name: string, type: string | null) {
        super(meta)
        this.Scope = scope
        this.Name = name
        this.Type = type
    }

    Scope: string
    Name: string
    Type: string | null

    itemtype = "var"
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

    index = nameResults[0]

    let type: string | null = null
    //if theres a : after the variable, parse its type
    if (GetNextCharacters(index,1) == ":") {
        //move to :
        index += GetWhitespaceAmount(index) + 1
        let colonIndex = index //used for errors

        //move to start of type
        index += GetWhitespaceAmount(index) + 1
        
        //actually get type
        let typeResults = GetIdentifier(index)
        if (typeResults[1] == "") {
            throw new TCError("Expected type following ':'",0,initIndex,colonIndex)
        }
        //error for invalid type
        if (!VALID_TYPES.includes(typeResults[1])) {
            throw new TCError(`Invalid type '${typeResults[1]}'`,0,index,typeResults[0])
        }

        index = typeResults[0]
        type = typeResults[1]
    }

    return [index, new VariableToken([initIndex,index],scopeKeyword, nameResults[1], type)]
}
//= String =\\

export class StringToken extends Token {
    constructor(meta,value: string) {
        super(meta)
        this.String = value
    }

    String: string

    itemtype = "str"
}

//litearlly just GetString but it returns a string token
function ParseString(index: number, openingChar: string, closingChar: string = openingChar): [number, StringToken] | null {
    let results
    results = GetString(index, openingChar, closingChar,["ampersandConversion"])
    if (results) {
        return [results[0], new StringToken([index + GetWhitespaceAmount(index) + 1,results[0]],results[1])]
    }

    return null
}

//= Number =\\
export class NumberToken extends Token {
    constructor(meta,value: string) {
        super(meta)
        this.Number = value
    }
    Number: string

    itemtype = "num"
}

//ERR1 = invalid character found
//ERR2 = multiple decimal points
//returned number will be index of final character of the number
function ParseNumber(index: number): [number, NumberToken] | null {
    let initIndex = index + GetWhitespaceAmount(index) + 1

    let decimalFound = false
    let forceToBeNumber = false
    let string = ""

    //parse negative sign
    if (GetNextCharacters(index,1) == "-") {
        string = "-"
        index += GetWhitespaceAmount(index) + 1
        //dont let there be a space between the - and the number
        if (!IsCharacterValidNumber(GetCharacterAtIndex(index + 1))) { return null }
    //not a negative number
    } else {
        //if not a number, return null
        if (!IsCharacterValidNumber(GetNextCharacters(index, 1))) { return null }
    }

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
            forceToBeNumber = true
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
    if (string == "." && forceToBeNumber == false) { return null }

    //add one leading 0 if starting with decimal
    if (string == "" || string.charAt(0) == ".") { string = "0" + string }

    //remove trailing decimal if nothing's after it
    if (string[string.length - 1] == ".") { string = string.substring(0, string.length - 1) }

    return [index - 1, new NumberToken([initIndex,index - 1],string)]
}

//= Vectors =\\
export class VectorToken extends Token {
    constructor(meta,x: ExpressionToken, y: ExpressionToken, z: ExpressionToken) {
        super(meta)
        this.X = x
        this.Y = y
        this.Z = z
    }

    X: ExpressionToken
    Y: ExpressionToken
    Z: ExpressionToken

    itemtype = "vec"
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
    return [argResults[0], new VectorToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2])]
}

//= Minimessage Text =\\
export class TextToken extends Token {
    constructor(meta,text: string) {
        super(meta)
        this.Text = text
    }
    Text: string

    itemtype = "txt"
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

    return [stringResults[0], new TextToken([keywordInitIndex,stringResults[0]],stringResults[1])]
}

//= Sound =\\
export class SoundToken extends Token {
    constructor(meta,id: ExpressionToken, volume: ExpressionToken | null, pitch: ExpressionToken | null, variant: ExpressionToken | null, isCustom: boolean) {
        super(meta)
        this.SoundId = id
        this.Volume = volume
        this.Pitch = pitch
        this.Variant = variant
        this.IsCustom = isCustom
    }

    SoundId: ExpressionToken
    Variant: ExpressionToken | null
    Volume: ExpressionToken | null
    Pitch: ExpressionToken | null

    IsCustom: boolean

    itemtype = "snd"
}

function ParseSound(index: number): [number, SoundToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let keywordInitIndex = index

    //parse snd keyword
    let identifierResults = GetIdentifier(index)

    //if no snd keyword, this is not a sound
    if (identifierResults == null || !(identifierResults[1] == "snd" || identifierResults[1] == "csnd")) { return null }

    let isCustom = identifierResults[1] == "csnd"


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

    //successful sound creation
    return [argResults[0], new SoundToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2], args[3],isCustom)]
}


//= Locations =\\
export class LocationToken extends Token {
    constructor(meta,x: ExpressionToken, y: ExpressionToken, z: ExpressionToken, pitch: ExpressionToken | null = null, yaw: ExpressionToken | null = null) {
        super(meta)
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

    itemtype = "loc"
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
    return [argResults[0], new LocationToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2], args[3], args[4])]
}

//= Potions =\\
export class PotionToken extends Token {
    constructor(meta,pot: ExpressionToken, amp: ExpressionToken | null, dur: ExpressionToken | null) {
        super(meta)
        this.Potion = pot
        this.Amplifier = amp
        this.Duration = dur
    }

    Potion: ExpressionToken
    Amplifier: ExpressionToken | null
    Duration: ExpressionToken | null

    itemtype = "pot"
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

    return [argResults[0],new PotionToken([keywordInitIndex,argResults[0]],args[0],args[1],args[2])]
}

//= Items =\\
export class ItemToken extends Token {
    constructor(meta,id: ExpressionToken, count: ExpressionToken | null = null, nbt: ExpressionToken | undefined, library: ExpressionToken | undefined) {
        super(meta)
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

    itemtype = "item"
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
        return [argResults[0], new ItemToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2], undefined)]
        //library item
    } else if (identifierResults[1] == "litem") {
        return [argResults[0], new ItemToken([keywordInitIndex,argResults[0]],args[1],args[2],undefined,args[0])]
    }

    return [argResults[0],new ItemToken([keywordInitIndex,argResults[0]],args[0],args[1],args[2],args[3])]
}

//= List/Dictionary Indexer =\\
export class IndexerToken extends Token {
    constructor(meta,index: ExpressionToken) {
        super(meta)
        this.Index = index
    }

    Index: ExpressionToken
}

function ParseIndexer(index: number): [number, IndexerToken] | null {
    //if next character isn't a [ then this isnt an indexer
    if (GetNextCharacters(index,1) != "[") { return null }

    //move to [
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index

    //parse indexer expression
    let expressionResults = ParseExpression(index,["]"],true)
    if (expressionResults == null) {
        throw new TCError("Expected index value for indexer",0,initIndex, initIndex)
    }

    return [expressionResults[0],new IndexerToken([initIndex,expressionResults[0]],expressionResults[1])]
}

//= Operators =\\
export class OperatorToken extends Token {
    constructor(meta,operator: string) {
        super(meta)
        this.Operator = operator
    }

    Operator: string
}

//create lists of lengths of all operators, one entry per length
const AssignmentOperatorsLengths: Array<number> = []
for (const v of VALID_ASSIGNMENT_OPERATORS) {
    if (!AssignmentOperatorsLengths.includes(v.length)) {
        AssignmentOperatorsLengths.push(v.length)
    }
}

const MathOperatorsLengths: Array<number> = []
for (const v of VALID_MATH_OPERATORS) {
    if (!MathOperatorsLengths.includes(v.length)) {
        MathOperatorsLengths.push(v.length)
    }
}

const ComparisonOperatorsLengths: Array<number> = []
for (const v of VALID_COMPARISON_OPERATORS) {
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
            validOperators = VALID_ASSIGNMENT_OPERATORS
            lengthList = AssignmentOperatorsLengths
            break
        case "math":
            validOperators = VALID_MATH_OPERATORS
            lengthList = MathOperatorsLengths
            break
        case "comparison":
            validOperators = VALID_COMPARISON_OPERATORS
            lengthList = ComparisonOperatorsLengths
            break
    }

    //try every possible length of operator
    for (const length of lengthList) {
        let operatorString = GetNextCharacters(index, length)

        if (validOperators.includes(operatorString)) {
            return [index + length, new OperatorToken([index + 1,index+length],operatorString)]
        }
    }

    return null
}

//= Dictionary =\\
export class DictionaryToken extends Token {
    constructor(meta,keys: Array<ExpressionToken>, values: Array<ExpressionToken>) {
        super(meta)
        this.Keys = keys
        this.Values = values
    }

    Keys: Array<ExpressionToken>
    Values: Array<ExpressionToken>

    itemtype = "dict"
}

function ParseDictionary(index, openingChar: string, closingChar: string, seperatingChar: string, assignmentChar: string): [number, DictionaryToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    if (GetNextCharacters(index,1) != openingChar) { return null }
    
    //move to opening char
    index += GetWhitespaceAmount(index) + 1

    let keys: Array<ExpressionToken> = []
    let values: Array<ExpressionToken> = []
    
    while (SCRIPT_CONTENTS[index] != closingChar && index < SCRIPT_CONTENTS.length) {
        //= key =\\
        let keyInitIndex = index + GetWhitespaceAmount(index) + 1 //used for errors
        let keyResults = ParseExpression(index,[closingChar,assignmentChar],false)
        //if empty dictionary, stop
        if (keyResults == null) { break }
        //move to end of key
        index = keyResults[0]
        //add to key list
        keys.push(keyResults[1])

        //= assignment char =\\
        //throw error if missing assignment char
        if (GetNextCharacters(index,1) != assignmentChar) {
            throw new TCError(`Expected '${assignmentChar}' following key`,0,keyInitIndex,index)
        }
        //move to assignment char
        index += GetWhitespaceAmount(index) + 1
        
        //= value =\\
        let valueResults = ParseExpression(index,[closingChar,seperatingChar],false)
        if (valueResults == null) {
            throw new TCError(`Expected value following '${assignmentChar}'`,0,keyInitIndex,index)
        }
        //move to end of value
        index = valueResults[0]
        //add value to list
        values.push(valueResults[1])

        //move to seperating char or ending char
        if (GetNextCharacters(index,1) == seperatingChar || GetNextCharacters(index,1) == closingChar) {
            index += GetWhitespaceAmount(index) + 1
        }
    }

    //error if list is unclosed because of EOF
    if (index + GetWhitespaceAmount(index) + 1 >= SCRIPT_CONTENTS.length) {
        throw new TCError("Dictionary was never closed", 1, initIndex + 1, GetLineEnd(index) - 1)
    }

    return [index, new DictionaryToken([initIndex,index],keys,values)]
}

//= ListToken =\\
export class ListToken extends Token {
    constructor(meta,items: Array<ExpressionToken>) {
        super(meta)
        this.Items = items
    }
    Items: ExpressionToken[]

    itemtype = "list"
}

//ERR1 = list was never closed
function ParseList(index, openingChar: string, closingChar: string, seperatingChar: string): [number, ListToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    if (GetNextCharacters(index, 1) != openingChar) { return null }

    //move to opening char
    index += GetWhitespaceAmount(index) + 1

    let items: Array<ExpressionToken> = []

    while (SCRIPT_CONTENTS[index] != closingChar && index < SCRIPT_CONTENTS.length) {
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

    //error if list is unclosed because of EOF
    if (index >= SCRIPT_CONTENTS.length) {
        throw new TCError("List was never closed", 1, initIndex + 1, GetLineEnd(index) - 1)
    }

    return [index, new ListToken([initIndex,index],items)]
}

//= Control =\\
//break, skip, endthread, return, returnmult, wait


export class ControlBlockToken extends Token {
    constructor(meta,action: string, params: ListToken | null = null, tags: Dict<ActionTag> | null = null) {
        super(meta)
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
    if (identifierResults != null && !VALID_CONTROL_KEYWORDS.includes(identifierResults[1])) {
        return null
    }

    //return action based on what keyword was used
    if (identifierResults[1] == "break") {
        return [identifierResults[0], new ControlBlockToken([initIndex,index],"StopRepeat")]
    } 
    else if (identifierResults[1] == "continue") {
        return [identifierResults[0], new ControlBlockToken([initIndex,index],"Skip")]
    }
    else if (identifierResults[1] == "endthread") {
        return [identifierResults[0], new ControlBlockToken([initIndex,index],"End")]
    }
    else if (identifierResults[1] == "return") {
        return [identifierResults[0], new ControlBlockToken([initIndex,index],"Return")]
    }
    else if (identifierResults[1] == "returnmult") {
        //parse number for how many times to return
        let expressionResults = ParseExpression(identifierResults[0],[";"],false)
        if (expressionResults == null) {
            throw new TCError("Expected number following 'returnmult'",0,initIndex,index)
        }

        return [expressionResults[0], new ControlBlockToken([initIndex,expressionResults[0]],"ReturnNTimes",new ListToken([index,expressionResults[0]],[expressionResults[1]]))]
    }
    else if (identifierResults[1] == "wait") {
        index = identifierResults[0]
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

        return [index, new ControlBlockToken([initIndex,index],"Wait",listResults[1],tags)]
    }   

    return null
}

//= If statements!!! =\\
export class ElseToken extends Token {
    constructor(meta) {
        super(meta)
    }

    Else = "Else"
}

function ParseElse(index: number): [number, ElseToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let identifierResults = GetIdentifier(index)

    if (identifierResults != null && identifierResults[1] == "else") {
        return [identifierResults[0], new ElseToken([index,identifierResults[0]])]
    }

    return null
}

export class IfToken extends Token {
    constructor(meta,condition: ExpressionToken) {
        super(meta)
        this.Condition = condition
    }
    Condition: ExpressionToken
}

function ParseIf(index: number): [number, IfToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    let identifierResults = GetIdentifier(index)

    //make sure this is an if keyword
    if (identifierResults[1] != "if") { return null }

    index = identifierResults[0]

    //make sure theres a ( for the condition afterwards
    if (GetNextCharacters(index, 1) != "(") {
        throw new TCError("Expected condition wrapped in parentheses following 'if'",0,initIndex,identifierResults[0])
    }

    index += GetWhitespaceAmount(index) + 1

    //parse expression
    let expressionResults = ParseExpression(index,[")"],true,["comparisons"])
    if (expressionResults == null) {
        throw new TCError("Expected condition following 'if'",0,initIndex,identifierResults[0])
    }
    
    return [expressionResults[0],new IfToken([initIndex,expressionResults[0]],expressionResults[1])]
}

//= Repeat =\\
export class RepeatToken extends Token {
    constructor(meta) {
        super(meta)
    }
}

export class RepeatMultipleToken extends RepeatToken {
    constructor(meta,amount: ExpressionToken,variable: VariableToken | null) {
        super(meta)
        this.Amount = amount
        this.Variable = variable
    }
    Amount: ExpressionToken
    Variable: VariableToken | null
}

export class RepeatForeverToken extends RepeatToken {
    constructor(meta) {
        super(meta)
    }
    Amount = "Forever"
}

export class RepeatForActionToken extends RepeatToken {
    constructor(meta,variables: Array<VariableToken>, action: string, args: ListToken, tags: Dict<ActionTag>) {
        super(meta)
        this.Action = action
        this.Variables = variables
        this.Arguments = args
        this.Tags = tags
    }

    Action: string
    Arguments: ListToken
    Tags: Dict<ActionTag>
    Variables: Array<VariableToken>
}

export class RepeatForInToken extends RepeatToken {
    constructor(meta,variables: Array<VariableToken>, iterableExpression: ExpressionToken) {
        super(meta)
        this.Variables = variables
        this.IterableExpression = iterableExpression
    }
    Variables: Array<VariableToken>
    IterableExpression: ExpressionToken
}

export class RepeatWhileToken extends RepeatToken {
    constructor(meta,condition: ExpressionToken) {
        super(meta)
        this.Condition = condition
    }

    Condition: ExpressionToken
}

function ParseRepeat(index: number): [number, RepeatToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    let keywordResults = GetIdentifier(index)
    index = keywordResults[0]

    //repeat n times or repeat forever
    if (keywordResults[1] == "repeat") {
        //repeat Forever
        let foreverResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
        if (foreverResults[1] == "Forever") {
            return [foreverResults[0], new RepeatForeverToken([initIndex,foreverResults[0]])]
        }
        //anything below this is for repeat multiple

        //variable
        let variableResults = ParseVariable(index)
        if (variableResults) {
            index = variableResults[0]
            //make sure theres a 'to'
            let toResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
            if (!toResults || toResults[1] != "to") {
                throw new TCError("Expected 'to' following 'repeat <var>'",0,initIndex,index)
            }
            index = toResults[0]
        }

        //(n)
        if (GetNextCharacters(index,1) != "(") {
            if (variableResults) {
                throw new TCError("Expected '(amount)' following 'to'",0,initIndex,index)
            } else {
                throw new TCError("Expected variable, '(amount)', or 'Forever' following 'repeat'",0,initIndex,index)
            }
        }
        index += GetWhitespaceAmount(index) + 1

        //expression
        let expressionResults = ParseExpression(index,[")"],true)
        if (expressionResults == null) {
            throw new TCError("Expected an actual expression",0,initIndex,index+1)
        }

        //success
        return [expressionResults[0],new RepeatMultipleToken([initIndex,expressionResults[0]],expressionResults[1],variableResults ? variableResults[1] : null)]
    }
    //while
    else if (keywordResults[1] == "while") {
        //make sure theres a (
        if (GetNextCharacters(index,1) != "(") {
            throw new TCError("Expected condition wrapped in parentheses following 'while'",0,initIndex,keywordResults[0])
        }
        index += GetWhitespaceAmount(index) + 1

        //expression
        let expressionResults = ParseExpression(index,[")"],true,["comparisons","genericTargetComparisons"])
        if (expressionResults == null) {
            throw new TCError("Expected condition following 'while'",0,initIndex,keywordResults[0])
        }

        //success
        return [expressionResults[0],new RepeatWhileToken([initIndex,expressionResults[0]],expressionResults[1])]
    }
    //for
    else if (keywordResults[1] == "for") {
        let variables: Array<VariableToken> = []

        //in will iterate over a list or dict
        //on will do an action like on range or adjacent
        let mode: "in" | "on"

        //accumulate variables until either the 'in' or 'on' keyword
        while (true) { //scary!!
            let variableResults = ParseVariable(index)
            //error for invalid variable
            if (variableResults == null) {
                let identifierResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
                throw new TCError(`Expected variable(s) following 'for'`,0,initIndex,identifierResults[0])
            }

            //add to variables list
            variables.push(variableResults[1])

            index = variableResults[0]

            //if keyword was found
            let keywordResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
            if (keywordResults[1] == "in" || keywordResults[1] == "on") {
                mode = keywordResults[1]
                //move to end of keyword
                index = keywordResults[0]
                break
            }

            //throw error if next character isnt a comma
            if (GetNextCharacters(index,1) != ",") {
                throw new TCError("Expected comma, 'in', or 'on'",0,initIndex,index)
            }

            //move to comma
            index += GetWhitespaceAmount(index) + 1
        }

        //make sure theres a (
        if (GetNextCharacters(index,1) != "(") {
            throw new TCError(`Expected '(' following '${mode}'`,0,initIndex,index)
        }
        index += GetWhitespaceAmount(index) + 1
        let actionInitIndex = index

        let returnToken: RepeatToken

        //iterating over a dictionary
        if (mode == "in") {
            //parse expression inside the ()
            let expressionResults = ParseExpression(index,[")"],true)
            if (expressionResults == null) {
                throw new TCError("Expected list or dictionary inside parentheses",0,initIndex,index)
            }

            index = expressionResults[0]
            returnToken = new RepeatForInToken([initIndex,expressionResults[0]],variables,expressionResults[1])
        } 
        //iterating using a repeat action
        else if (mode == "on") {
            //parse action name
            let actionNameInitIndex = index + GetWhitespaceAmount(index) + 1
            let actionNameResults = GetIdentifier(actionNameInitIndex)
            //error for missing action name
            if (actionNameResults[1] == "") {
                throw new TCError("Missing action name", 0, initIndex, actionNameResults[0])
            }
            //error for invalid action name
            if (AD.ValidRepeatActions[actionNameResults[1]] == null) {
                throw new TCError(`Invalid repeat action '${actionNameResults[1]}'`, 0, actionNameInitIndex, actionNameResults[0])
            }

            //move to end of action name
            index = actionNameResults[0]

            //parse args
            let argResults = ParseList(index, "(", ")", ",")
            if (argResults == null) {
                throw new TCError("Expected arguments following action name", 0, actionNameInitIndex, index)
            }
            //move to end of args
            index = argResults[0]

            //parse tags
            let tagResults = ParseTags(index, AD.ValidRepeatActions[actionNameResults[1]]?.Tags)
            let tags
            if (tagResults) {
                index = tagResults[0]
                tags = tagResults[1]
            }

            //parse closing bracket
            if (GetNextCharacters(index, 1) != ")") {
                throw new TCError("Repeat action never closed", 0, actionInitIndex, index)
            }

            //move to closing bracket
            index += GetWhitespaceAmount(index) + 1
            
            returnToken = new RepeatForActionToken([initIndex,index],variables,actionNameResults[1],argResults[1],tags)
        }

        //return [index,new RepeatForToken([initIndex,index],variables,argResults[1],tags)]
        return [index,returnToken!]
    }
    //not a repeat statement
    else {
        return null
    }

    return null
}

//= Brackets =\\
export class BracketToken extends Token {
    constructor(meta,type: "open" | "close") {
        super(meta)
        this.Type = type
    }

    Type: "open" | "close"
}

//= Action =\\
export class ActionTag {
    constructor(name: string, value: string, variable: VariableToken | null = null) {
        this.Name = name
        this.Value = value
        this.Variable = variable
    }

    Name: string
    Value: string
    Variable: VariableToken | null
}

export class ActionToken extends Token {
    constructor(meta,domain: string, action: string, params: ListToken | null = null, isComparison: boolean = false, tags: Dict<ActionTag> = {}) {
        super(meta)
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

    if (GetNextCharacters(index, 1) == "{") {
        //move to opening <
        index += 1 + GetWhitespaceAmount(index)

        //if empty tag list
        if (GetNextCharacters(index, 1) == "}") {
            index += 1 + GetWhitespaceAmount(index)
            return null
        } else {
            let tagsListInitIndex = index

            while (SCRIPT_CONTENTS[index] != "}") {
                //move to first character of tag name
                index += 1 + GetWhitespaceAmount(index)

                //parse tag name
                let tagNameResults = GetCharactersUntil(index, ["=", "\n", "}"])
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

                //error if next char isn't =
                if (GetNextCharacters(index, 1) != "=") {
                    throw new TCError("Expected '=' following tag name", 6, index + 1, index + 1)
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
                let tagValueResults = GetCharactersUntil(index, [",", "\n", "}"])

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

function ParseAction(index: number, allowComparisons: boolean = false, genericTargetComparisons: boolean = false): [number, ActionToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index

    //= parse domain =\\
    let domainResults = GetIdentifier(index)
    if (domainResults == null) { return null }

    let validDomains = genericTargetComparisons ? GenericDomains : PublicDomains

    let domain = validDomains[domainResults[1]]
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
            throw new TCError(`'${domain.Identifier}' does not contain function '${actionResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, actionResults[0])
        }
    }

    //move to the end of the action name
    index = actionResults[0]

    //parse params
    let listInitIndex = index + GetWhitespaceAmount(index) + 1
    let paramResults = ParseList(index, "(", ")", ",")
    let params: ListToken
    if (paramResults) {
        index = paramResults[0]
        params = paramResults[1]
    } else {
        params = new ListToken([listInitIndex,-1],[])
    }

    let tagResults = ParseTags(index,actions[actionResults[1]]!.Tags)
    let tags
    if (tagResults != null) {
        tags = tagResults[1]
        index = tagResults[0]
    }

    return [index, new ActionToken([initIndex,index],domain.Identifier, actionResults[1], params, isComparison, tags!)]
}

//= Call function/start process =\\
export class CallToken extends Token {
    constructor(meta,type: "function" | "process", name: string, args: ListToken | null, tags: Dict<ActionTag> | null) {
        super(meta)
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

    return [index, new CallToken([initIndex,index],mode,name,args,tags)]
}

//= Targets =\\
export class TargetToken extends Token {
    constructor(meta,target: string) {
        super(meta)
        this.Target = target
    }

    Target: string
}

function ParseTarget(index: number): [number, TargetToken] | null {
    index += GetWhitespaceAmount(index) + 1

    let targetResults = GetIdentifier(index)
    if (targetResults == null) { return null }

    if (VALID_TARGETS.includes(targetResults[1])) {
        return [targetResults[0], new TargetToken([0,0],targetResults[1])]
    }

    return null
}


//======== SPECIAL CODE ITEMS ========\\

//= Game Values =\\
export class GameValueToken extends Token {
    constructor(meta,gameValue: string, target: string | null) {
        super(meta)
        this.Value = gameValue
        this.Target = target
    }

    Value: string
    Target: string | null
}

function ParseGameValue(index: number): [number, Token] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index

    //= parse domain =\\
    let domainResults = GetIdentifier(index)
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
            if (domain.SupportsGameValues == false) {
                //throw special error if this domain doesnt support game values
                throw new TCError(`Target '${domain.Identifier}' does not support game values`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
            } else if (domain.ActionType == "entity" && AD.InvalidEntityGameValues.includes(AD.ValidPlayerGameValues[valueResults[1]]!)) {
                //throw special error if this gv is valid for players but not entities and the target is an entity
                throw new TCError(`Invalid entity game value: '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
            } else {
                throw new TCError(`Invalid targeted game value: '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
            }
        }
        else {
            if (domain.Identifier == "game") {
                //throw special error for game game values
                throw new TCError(`Invalid game value: '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
            } else {
                throw new TCError(`'${domain.Identifier}' does not contain value '${valueResults[1]}'`, 2, index + GetWhitespaceAmount(index) + 1, valueResults[0])
            }
        }
    }

    //move to the end of the action name
    index = valueResults[0]

    return [index, new GameValueToken([initIndex,index],valueResults[1], domain.Identifier)]
}

//= Type override thingy =\\
//this is ONLY USED IN EXPRESSIONS!
//this is not used for variables, they do their own type parsing
export class TypeOverrideToken extends Token {
    constructor(meta,type: string) {
        super(meta)
        this.Type = type
    }
    Type: string
}

function ParseTypeOverride(index: number): [number, TypeOverrideToken] | null {
    //parse colon
    if (GetNextCharacters(index,1) != ":") { return null }
    //move to colon
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    
    //move to start of type
    index += GetWhitespaceAmount(index) + 1

    //parse type
    let typeResults = GetIdentifier(index)
    if (typeResults[1] == "") {throw new TCError("Expected type following ':'",0,initIndex,initIndex)}

    //error for invalid type
    if (!VALID_TYPES.includes(typeResults[1])) { throw new TCError(`Invalid type '${typeResults[1]}'`,0,index,typeResults[0])}

    return [typeResults[0],new TypeOverrideToken([initIndex,typeResults[0]],typeResults[1])]
}

//= Expressions =\\

export class ExpressionToken extends Token {
    constructor(meta,symbols: Array<any>,not: boolean) {
        super(meta)
        this.Expression = symbols
        this.Not = not
    }

    Not: boolean
    Expression: Array<Token>
}

//ERR1 = expression never closed
//ERR2 = invalid value
//ERR3 = invalid operator
//ERR4 = expression started with operator
//ERR5 = operator instead of value
//ERR6 = multiple comparisons
function ParseExpression(
    index: number, 
    terminateAt: Array<string | null> = [";"], 
    endIndexAtTerminator: boolean | undefined = true, 
    features: Array<"comparisons" | "genericTargetComparisons"> = []
    ): [number, ExpressionToken] | null 
    {

    //if it should terminate at a newline, also terminate at eof
    if (terminateAt.includes("\n")) {
        if (!terminateAt.includes(null)) { terminateAt.push(null) }
        if (!terminateAt.includes("")) { terminateAt.push("") }
    }

    let expressionSymbols: Array<any> = []
    let comparisonFound = false
    let not = false

    let initIndex = index + GetWhitespaceAmount(index) + 1

    //not parsing
    if (features.includes("comparisons")) {
        let identifierResults = GetIdentifier(initIndex)
        if (identifierResults[1] == "not") {
            index = identifierResults[0]
            not = true
        }
    }


    index += GetWhitespaceAmount(index)
    while (!terminateAt.includes(GetNextCharacters(index, 1)) && index + GetWhitespaceAmount(index) + 1 < SCRIPT_CONTENTS.length) {
        let valueInitIndex = index

        //= ERROR: expression isnt closed
        if (GetNextCharacters(index, 1) == ";" || (GetNextCharacters(index, 1) == "" && !terminateAt.includes(";"))) {
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

            //try action
            if (results == null) { results = ParseAction(index, true, features.includes("genericTargetComparisons")) }

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

            //try function
            if (results == null) { 
                results = ParseCall(index)

                if (results && (results[1] as CallToken).Type == "process") {
                    throw new TCError("Processes cannot be started from within expressions",0,valueInitIndex + GetWhitespaceAmount(valueInitIndex) + 1,results[0])
                }
            }

            //try game value
            if (results == null) { results = ParseGameValue(index) }

            //try list
            if (results == null) { results = ParseList(index, "[","]",",") }

            //try dict
            if (results == null) { results = ParseDictionary(index, "{", "}", ",", "=")}

            if (results == null) {
                //= ERROR: operator was given instead of expr
                let operatorResults = ParseOperator(index, "math")
                if (operatorResults != null) {
                    if (expressionSymbols.length == 0) {
                        throw new TCError("Expressions can't start with operators", 4, initIndex, initIndex)
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
        //otherwise, parse for operator or type override
        else {
            if (results == null) { results = ParseTypeOverride(index) }

            if (results == null) { results = ParseOperator(index, "math") }

            //indexer thingy
            if (results == null) { results = ParseIndexer(index) }

            //comparison operator
            if (results == null && features.includes("comparisons")) {
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
        return [index, new ExpressionToken([initIndex,index],expressionSymbols,not)]
    }

    return null
}

//= Headers ==\\
export class HeaderToken extends Token {
    constructor(meta) {
        super(meta)
    }
} //base class for all header thingies

export class KeywordHeaderToken extends HeaderToken {
    constructor(meta,keyword: string) {
        super(meta)
        this.Keyword = keyword
    }
    Keyword: string
}

function ParseKeywordHeaderToken(index): [number, KeywordHeaderToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let identifierResults = GetIdentifier(index)
    if (VALID_HEADER_KEYWORDS.includes(identifierResults[1])) {
        //if valid keyword
        return [identifierResults[0],new KeywordHeaderToken([index,identifierResults[0]],identifierResults[1])]
    } else {
        return null
    }
}

//functiosn and processes also use this
export class EventHeaderToken extends HeaderToken {
    constructor(meta,codeblock: string, event: string) {
        super(meta,)
        this.Codeblock = codeblock
        this.Event = event
    }

    Codeblock: string
    Event: string
}

function ParseEventHeader(index: number): [number, EventHeaderToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    
    //make sure its the right header typre
    let identifierResults = GetIdentifier(index)
    if (identifierResults == null || !AD.ValidLineStarters[identifierResults[1]]) { return null }
    index = identifierResults[0]

    let nameResults = GetComplexName(index)
    return [nameResults[0], new EventHeaderToken([initIndex,index],identifierResults[1],nameResults[1])]
}

export class ParamHeaderToken extends HeaderToken {
    constructor(meta,name: string, type: string, plural: boolean, optional: boolean, defaultValue: ExpressionToken | null) {
        super(meta)
        this.Name = name
        this.Type = type
        this.Plural = plural
        this.Optional = optional
        this.DefaultValue = defaultValue
    }
    Name: string
    Type: string
    Plural: boolean
    Optional: boolean
    DefaultValue: ExpressionToken | null
}

function ParseParamHeader(index: number): [number, ParamHeaderToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    
    //make sure its the right header typre
    let identifierResults = GetIdentifier(index)
    if (identifierResults == null || identifierResults[1] != "PARAM") { return null }
    index = identifierResults[0]

    //parse name
    let nameResults = GetComplexName(index)
    index = nameResults[0]

    //if next character isn't a ':' then finish param parsing now
    if (GetNextCharacters(index,1) != ":") {
        return [index, new ParamHeaderToken([initIndex,index],nameResults[1],"any",false,false,null)]
    }

    //move to :
    index += GetWhitespaceAmount(index) + 1
    let modifiersInitIndex = index //used for errors

    let modifiers: Array<string> = []
    let type: string | null = null
    //parse modifiers until either end of line or =
    while (!["\n","="].includes(GetNextCharacters(index,1))) {
        let modInitIndex = index + GetWhitespaceAmount(index) + 1 //used for error messages

        let identifierResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
        if (identifierResults == null) {
            throw new TCError("Malformed param type",0,index,-1)
        }

        index = identifierResults[0]

        //type has been found
        if (VALID_TYPES.includes(identifierResults[1])) {
            type = identifierResults[1]
            break

        //yet another modifier
        } else {
            //error for invalid modifier
            if (!VALID_PARAM_MODIFIERS.includes(identifierResults[1])) {
                throw new TCError(`Invalid param modifier: ${identifierResults[1]}`,0,modInitIndex,identifierResults[0])
            }

            //if valid, add it to list of mods
            modifiers.push(identifierResults[1])
        }
    }

    //throw error if theres no type after the :
    if (type == null) {
        throw new TCError("Expected type following ':'",0,modifiersInitIndex,index)
    }

    //throw error for trying to use modifiers with vars
    if (type == "var") {
        if (modifiers.includes("plural")) {
            throw new TCError("Variable parameters cannot be plural",0,initIndex,GetLineEnd(initIndex)-1)
        } else if (modifiers.includes("optional")) {
            throw new TCError("Variable parameters cannot be optional",0,initIndex,GetLineEnd(initIndex)-1)
        }
    }

    let defaultValue: ExpressionToken | null = null
    //if there is an = after the type
    if (GetNextCharacters(index,1) == "=") {
        //move to =
        index += GetWhitespaceAmount(index) + 1
        let equalSignIndex = index //used for errors

        //throw error if param is required
        if (!modifiers.includes("optional")) {
            throw new TCError("Only optional parameters can have default values",0,index,GetLineEnd(initIndex)-1)
        }
        //throw error if param is optional, but plural
        if (modifiers.includes("plural")) {
            throw new TCError("Plural parameters cannot have default values",0,index,GetLineEnd(initIndex)-1)
        }

        //parse default value
        let expressionResults = ParseExpression(index,[";"],false)
        if (expressionResults == null) {
            throw new TCError("Expected param default value following '='",0,equalSignIndex,equalSignIndex)
        }
        
        index = expressionResults[0]
        defaultValue = expressionResults[1]
    }
    //if there isn't a = but the param is optional
    else if (modifiers.includes("optional") && !modifiers.includes("plural")) {
        throw new TCError("Optional parameter must have default value",0,initIndex,GetLineEnd(initIndex)-1)
    }

    return [index, new ParamHeaderToken([initIndex,index],nameResults[1],type,modifiers.includes("plural"),modifiers.includes("optional"),defaultValue)]
}

//= Selections ==\\
export class SelectActionToken extends Token {
    constructor(meta,action: string, args: ListToken | null = null, tags: Dict<ActionTag> | null = null, conditionExpr: ExpressionToken | null = null, conditionNot: boolean = false) {
        super(meta)
        this.Action = action
        this.Arguments = args
        this.Tags = tags
        this.ConditionExpression = conditionExpr
        this.ConditionNot = conditionNot
    }

    Action: string
    ConditionExpression: ExpressionToken | null
    ConditionNot: boolean
    Arguments: ListToken | null
    Tags: Dict<ActionTag> | null
}

function ParseSelectAction(index): [number, SelectActionToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index

    //make sure theres the select or filter keyword
    let keywordResults = GetIdentifier(index)
    if (!(keywordResults[1] == "select" || keywordResults[1] == "filter")) {return null}
    let keyword = keywordResults[1]

    //move to end of select keyword
    index = keywordResults[0]
    let actionInitIndex = index + GetWhitespaceAmount(index) + 1 //used for errors

    let actionResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
    let action = actionResults[1]
    //error for no action given
    if (action == "") {
        throw new TCError("Expected action following 'select'",0,initIndex,index)
    }

    //get action data
    let actionData = (keyword == "select" ? AD.ValidCreateSelectActions : AD.ValidFilterSelectActions)[action]

    //error for invalid action
    if (!actionData) {
        throw new TCError(`Invalid select action: '${action}'`,0,index + GetWhitespaceAmount(index) + 1, actionResults[0])
    }

    index = actionResults[0]

    //parse condition (if applicable)
    if (action == "PlayersByCondition" || action == "EntitiesByCondition" || action == "ByCondition") {
        //parse expression
        let expressionResults = ParseExpression(index,[";"],false,["comparisons","genericTargetComparisons"])
        if (expressionResults == null) { 
            throw new TCError(`Expected condition following 'select ${action}'`,0,initIndex,index)
        }
        index = expressionResults[0]

        return [expressionResults[0], new SelectActionToken([initIndex,expressionResults[0]],actionResults[1],null,null,expressionResults[1])]
    } else {
        //parse arguments
        let argResults = ParseList(index, "(", ")", ",")
        let args
        if (argResults != null) {
            index = argResults[0]
            args = argResults[1]
        }

        //parse tags
        let tagResults = ParseTags(index, actionData.Tags)
        let tags
        if (tagResults != null) {
            index = tagResults[0]
            tags = tagResults[1]
        }

        return [index, new SelectActionToken([initIndex,index],actionResults[1],null,args,tags)]
    }
}


//======== DEBUG THINGIES ========\\
export class DebugPrintVarTypeToken extends Token {
    constructor(meta,variable: VariableToken) {
        super(meta)
        this.Variable = variable
    }
    Variable: VariableToken
}

function ParseDebugPrintVarType(index: number): [number,DebugPrintVarTypeToken] | null {
    index += GetWhitespaceAmount(index) + 1
    let initIndex = index
    
    let identifierResults = GetIdentifier(index)
    if (!identifierResults || identifierResults[1] != "__printvartype") { return null }
    index = identifierResults[0]

    let variableResults = ParseVariable(index)
    if (!variableResults) {
        throw new TCError("No variable provided",0,initIndex,identifierResults[0])
    }

    return [variableResults[0], new DebugPrintVarTypeToken([initIndex,variableResults[0]],variableResults[1])]
}

//======== OTHER STUFF ========\\


let symbols = "!@#$%^&*(){}[]-:;\"'~`=/*-+|\\/,.<>".split("")
let InHeaderParsingStage = true

//push current line to line list even if theres no semicolon
//will NOT move the index
function PushLineAsIs(){
    //dont push empty lines
    if (CurrentLine.length > 0) {
        Lines.push(CurrentLine)
    }

    CurrentLine = []
}

//main logic goes here
function DoTheThing(): void {
    let previousLine = Lines[Lines.length - 1]
    if (previousLine == undefined) { previousLine = [] }

    //if at the end of a line, push that line and start a new one
    if (GetNextCharacters(CharIndex, 1) == ";" || CharIndex + GetWhitespaceAmount(CharIndex) == SCRIPT_CONTENTS.length - 1 || SCRIPT_CONTENTS[CharIndex] == "#") {
        PushLineAsIs()

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
        while (GetNextCharacters(CharIndex, 1) == "\n" || GetNextCharacters(CharIndex, 1) == ";") {
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

            //else gets to be its own line
            PushLineAsIs()

            //parse opening bracket
            if (GetNextCharacters(CharIndex,1) == "{") {
                CharIndex += GetWhitespaceAmount(CharIndex) + 1
                CurrentLine.push(new BracketToken([CharIndex,CharIndex],"open"))
                //brackets are always their own lines
                PushLineAsIs()
            } else {
                throw new TCError("Else statement missing opening bracket", 0, CharIndex, -1)
            }

            return
        }
    }

    // if current line is empty
    if (CurrentLine.length == 0) {
        let results

        //headers
        if (InHeaderParsingStage) {
            //top event header e.g. 'PLAYER_EVENT LeftClick'
            if (results == null) { results = ParseEventHeader(CharIndex) }

            //params
            if (results == null) { results = ParseParamHeader(CharIndex) }

            if (results == null) { results = ParseKeywordHeaderToken(CharIndex) }
        }

        //debug
        if (DEBUG_MODE.enableDebugFunctions) {
            if (results == null) { results = ParseDebugPrintVarType(CharIndex) }
        }

        //try select
        if (results == null) { results = ParseSelectAction(CharIndex) }

        //try control
        if (results == null) { results = ParseControlBlock(CharIndex) }

        //try if
        if (results == null) { results = ParseIf(CharIndex) }

        //try repeat
        if (results == null) { results = ParseRepeat(CharIndex) }

        //try action
        if (results == null) { results = ParseAction(CharIndex) }

        //try target
        if (results == null) { results = ParseTarget(CharIndex) }

        //try variable
        if (results == null) { results = ParseVariable(CharIndex) }

        //try function/process
        if (results == null) { results = ParseCall(CharIndex) }

        //closing brackets
        if (GetNextCharacters(CharIndex, 1) == "}") {
            //push current line (since closing bracket shoudl always be treated as its own line)
            PushLineAsIs()
            //move char index to closing bracket
            CharIndex += GetWhitespaceAmount(CharIndex) + 1
            //add closing bracket to new line
            CurrentLine.push(new BracketToken([CharIndex,CharIndex],"close"))
            //push closing bracket line
            PushLineAsIs()

            return
        }

        if (results != null) {
            //if any token other than header is found, stop allowing headers
            if (!(results[1] instanceof HeaderToken)) {
                InHeaderParsingStage = false
            }

            ApplyResults(results)
            return
        }
    }

    //parse opening bracket for if and repeat
    if (CurrentLine[0] instanceof IfToken || CurrentLine[0] instanceof RepeatToken) {
        //parse opening bracket
        if (GetNextCharacters(CharIndex,1) == "{") {
            //push current line (since brackets are always treated as their own line)
            PushLineAsIs()
            //move to bracket
            CharIndex += GetWhitespaceAmount(CharIndex) + 1
            //add bracket to new line
            CurrentLine.push(new BracketToken([CharIndex,CharIndex],"open"))
            //push new line with bracket
            PushLineAsIs()
        } else {
            throw new TCError(`${CurrentLine[0] instanceof IfToken ? "If" : "Repeat"} statement missing opening bracket`, 0, GetLineStart(CharIndex), GetLineEnd(CharIndex))
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
            if (VALID_ASSIGNMENT_OPERATORS.includes(operation)) {
                //parse expression
                let expressionResults = ParseExpression(CharIndex, [";"], false)
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

    //fallback error for random identifier
    let invalidIdentifierResults = GetIdentifier(CharIndex + GetWhitespaceAmount(CharIndex) + 1,true)
    if (invalidIdentifierResults[1] != "") {
        throw new TCError(`Unexpected '${invalidIdentifierResults[1]}'`, 0, CharIndex + GetWhitespaceAmount(CharIndex) + 1, invalidIdentifierResults[0])
    }


    console.log("Current line:", CurrentLine)
    console.log("Current indx:", CharIndex)
    throw new TCError("Something's definitely wrong here (fallback error)", 0, CharIndex, CharIndex)
}

export class TokenizerResults {
    Lines: Array<Array<Token>>
}

export function Tokenize(script: string): TokenizerResults {
    CharIndex = -1
    Running = true
    Lines = []
    CurrentLine = []
    SCRIPT_CONTENTS = script

    while (Running) {
        DoTheThing()
    }

    let results = new TokenizerResults()
    results.Lines = Lines

    return results
}
