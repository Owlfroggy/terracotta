//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code


import { Domain, DomainList, TargetDomain, GenericDomains, GenericTargetDomains, PublicDomains } from "../util/domains.ts"
import { PrintError, TCError } from "../util/errorHandler.ts"
import { DEBUG_MODE, print } from "../main.ts"
import { CharUtils } from "../util/characterUtils.ts"
import * as AD from "../util/actionDump.ts"
import {VALID_PARAM_MODIFIERS, VALID_VAR_SCOPES, VALID_ASSIGNMENT_OPERATORS, VALID_MATH_OPERATORS, VALID_COMPARISON_OPERATORS, VALID_CONTROL_KEYWORDS, VALID_HEADER_KEYWORDS, ValueType, VALID_LINE_STARTERS, CREATE_SELECTION_ACTIONS, FILTER_SELECTION_ACTIONS, VALID_FORMATTING_CODES} from "../util/constants.ts"
import { Dict } from "../util/dict.ts"
import { SelectionContext, AssigneeContext, DictionaryContext, CodeContext, CodelineContext, ConditionContext, ConstructorContext, ContextDictionaryLocation, ContextDomainAccessType, DomainAccessContext, EventContext, ForLoopContext, ListContext, NumberContext, ParameterContext, StandaloneFunctionContext, TagsContext, TypeContext, UserCallContext, VariableContext, RepeatContext } from "../languageServer/codeContext.ts";
import { slog } from "../languageServer/languageServer.ts";
import { TargetDomains } from "../util/domains.ts";

type ExpressionList = (ExpressionToken | null)[]

//==========[ tokens ]=========\\
export class Token {
    constructor(metadata: [number, number]) {
        this.CharStart = metadata[0]
        this.CharEnd = metadata[1]
    }

    CharStart: number
    CharEnd: number
    Segments: Dict<[number,number]> = {}

    itemtype: string
}

export class TypeCreationToken extends Token {
    constructor(meta, rawArgs: any[] = []) {
        super(meta)
        this.RawArgs = rawArgs
    }
    RawArgs: any[]
}

export class VariableToken extends Token {
    constructor(meta,scope, name: string, type: string | null) {
        super(meta)
        this.Scope = scope
        this.Name = name
        this.Type = type
    }

    Scope: "global" | "saved" | "local" | "line"
    Name: string
    Type: string | null

    itemtype = "var"
}

export class StringToken extends Token {
    constructor(meta,value: string) {
        super(meta)
        this.String = value
    }

    String: string

    itemtype = "str"
}

export class NumberToken extends Token {
    constructor(meta,value: string) {
        super(meta)
        this.Number = value
    }
    Number: string

    itemtype = "num"
}
export class VectorToken extends TypeCreationToken {
    constructor(meta,x: ExpressionToken | null, y: ExpressionToken | null, z: ExpressionToken | null, rawArgs: any[]) {
        super(meta, rawArgs)
        this.X = x
        this.Y = y
        this.Z = z
    }

    X: ExpressionToken | null
    Y: ExpressionToken | null
    Z: ExpressionToken | null

    itemtype = "vec"
}
export class TextToken extends Token {
    constructor(meta,text: string) {
        super(meta)
        this.Text = text
    }
    Text: string

    itemtype = "txt"
}
export class SoundToken extends TypeCreationToken {
    constructor(meta,id: ExpressionToken | null, pitch: ExpressionToken | null, volume: ExpressionToken | null, variant: ExpressionToken | null, isCustom: boolean, rawArgs: any[]) {
        super(meta,rawArgs)
        this.SoundId = id
        this.Pitch = pitch
        this.Volume = volume
        this.Variant = variant
        this.IsCustom = isCustom
    }

    SoundId: ExpressionToken | null
    Pitch: ExpressionToken | null
    Volume: ExpressionToken | null
    Variant: ExpressionToken | null

    IsCustom: boolean

    itemtype = "snd"
}
export class LocationToken extends TypeCreationToken {
    constructor(meta,x: ExpressionToken | null, y: ExpressionToken | null, z: ExpressionToken | null, pitch: ExpressionToken | null = null, yaw: ExpressionToken | null = null, rawArgs: any[]) {
        super(meta,rawArgs)
        this.X = x
        this.Y = y
        this.Z = z
        this.Pitch = pitch
        this.Yaw = yaw
    }

    X: ExpressionToken | null
    Y: ExpressionToken | null
    Z: ExpressionToken | null
    Pitch: ExpressionToken | null
    Yaw: ExpressionToken | null

    itemtype = "loc"
}
export class PotionToken extends TypeCreationToken {
    constructor(meta,pot: ExpressionToken | null, amp: ExpressionToken | null, dur: ExpressionToken | null, rawArgs: any[]) {
        super(meta,rawArgs)
        this.Potion = pot
        this.Amplifier = amp
        this.Duration = dur
    }

    Potion: ExpressionToken | null
    Amplifier: ExpressionToken | null
    Duration: ExpressionToken | null

    itemtype = "pot"
}
export class ItemToken extends TypeCreationToken {
    constructor(meta,id: ExpressionToken | null, count: ExpressionToken | null = null, library: ExpressionToken | null, mode: "library" | "basic", rawArgs: any[]) {
        super(meta, rawArgs)
        this.Id = id
        this.Count = count
        this.Library = library
        this.Mode = mode
    }

    Id: ExpressionToken | null
    Library: ExpressionToken | null
    Count: ExpressionToken | null

    Mode: "basic" | "library"

    itemtype = "item"
}

export class ParticleToken extends TypeCreationToken {
    constructor(meta, type: ExpressionToken | null, data: ExpressionToken | null, rawArgs: any[]) {
        super(meta, rawArgs)
        this.Type = type
        this.Data = data
    }

    Type: ExpressionToken | null
    Data: ExpressionToken | null

    itemtype = "par"
}

export class IndexerToken extends Token {
    constructor(meta,index: ExpressionToken) {
        super(meta)
        this.Index = index
    }

    Index: ExpressionToken
}

export class OperatorToken extends Token {
    constructor(meta,operator: string) {
        super(meta)
        this.Operator = operator
    }

    Operator: string
}
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
export class ListToken extends Token {
    constructor(meta,items: ExpressionList) {
        super(meta)
        this.Items = items
    }
    Items: ExpressionList

    itemtype = "list"
}
export class ControlBlockToken extends Token {
    constructor(meta,action: string, params: ListToken | null = null, tags: Dict<ActionTag> | null = null, returnValue: ExpressionToken | null = null) {
        super(meta)
        this.Action = action
        this.Params = params
        this.Tags = tags
        this.ReturnValue = returnValue
    }

    Action: string
    Params: ListToken | null
    Tags: Dict<ActionTag> | null
    ReturnValue: ExpressionToken | null
}
export class ElseToken extends Token {
    constructor(meta) {
        super(meta)
    }

    Else = "Else"
}

export class IfToken extends Token {
    constructor(meta,condition: ExpressionToken) {
        super(meta)
        this.Condition = condition
    }
    Condition: ExpressionToken
}
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

export class BracketToken extends Token {
    constructor(meta,type: "open" | "close") {
        super(meta)
        this.Type = type
    }

    Type: "open" | "close"
}

//= Action =\\
export class ActionTag {
    constructor(name: string, value: string, variable: VariableToken | null = null, charStart: number = -1, charEnd: number = -1) {
        this.Name = name
        this.Value = value
        this.Variable = variable
        this.CharStart = charStart
        this.CharEnd = charEnd
    }

    Name: string
    Value: string
    Variable: VariableToken | null

    CharStart: number
    CharEnd: number
}

//possible segments: "actionName"
export class ActionToken extends Token {
    constructor(meta,domain: string, action: string, params: ListToken | null = null, isComparison: boolean = false, tags: Dict<ActionTag> = {}) {
        super(meta)
        this.DomainId = domain
        this.Action = action
        this.Params = params
        this.Tags = tags
        if (isComparison) { this.Type = "comparison" }
        if (meta[2] != null && meta[3] != null) {
            this.Segments.actionName = [meta[2],meta[3]]
        }
    }

    Params: ListToken | null
    Tags: Dict<ActionTag>
    DomainId: string
    Action: string
    Type: "comparison" | "action" = "action"
}
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

//possible segments: "valueName"
export class GameValueToken extends Token {
    constructor(meta,gameValue: string, target: string | null) {
        super(meta)
        this.Value = gameValue
        this.Target = target
        if (meta[2] && meta[3]) {
            this.Segments.valueName = [meta[2],meta[3]]
        }
    }

    Value: string
    Target: string | null
}
export class TypeOverrideToken extends Token {
    constructor(meta,type: string) {
        super(meta)
        this.Type = type
    }
    Type: string
}
export class ExpressionToken extends Token {
    constructor(meta,symbols: Array<any>,not: boolean) {
        super(meta)
        this.Expression = symbols
        this.Not = not
    }

    Not: boolean
    Expression: Array<Token>
}
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

export class ReturnsHeaderToken extends HeaderToken {
    constructor(meta,type: string) {
        super(meta)
        this.Type = type
    }
    Type: string
}
export class EventHeaderToken extends HeaderToken {
    constructor(meta,codeblock: string, event: string) {
        super(meta,)
        this.Codeblock = codeblock
        this.Event = event
    }

    Codeblock: string
    Event: string
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
export class DescriptionHeaderToken extends HeaderToken {
    constructor(meta,description?: string) {
        super(meta)
        this.Description = description
    }
    Description?: string
}
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
export class DebugPrintVarTypeToken extends Token {
    constructor(meta,variable: VariableToken) {
        super(meta)
        this.Variable = variable
    }
    Variable: VariableToken
}

//==========[ other stuff ]=========\\

export class TokenizerResults {
    Lines: Array<Array<Token>>
}

export interface TokenizeMode {
    "mode": "getTokens" | "getContext" | "getVariables" | "getHeaders",

    //starts at startFromLine, moving up until it reaches goThroughLine
    "startFromLine"?: number,
    "goUntilLine"?: number //inclusive
    
    // if mode is getContext, the char index to look for
    "contextTestPosition"?: number

    //if true, will take extra precautions to avoid breaking the langauge server
    "fromLanguageServer"?: boolean
}


//returns a dictionary where
//key: line number
//value: character index right before the first char of that line ()
export function GetLineIndexes(text: string): number[] {
    // text = text.replaceAll(/\r\n/g, "\n")
    let result: number[] = [-1]

    let i = 0;
    for (const v of text.matchAll(/\n/g)) {
        i++
        result[i] = v.index
    }

    result[result.length] = text.length

    return result
}

//THIS FUNCTION WILL NEVER RETURN UNDEFINED! IT JUST SAYS THAT BECAUSE TYPESCRIPT IS SPECIAL
//also assumes that script encoding is in LF and NOT CRLF
export function Tokenize(script: string, mode: TokenizeMode): TokenizerResults | CodeContext | Dict<VariableToken[]> | undefined {
    //==========[ constants ]=========\\

    let LineIndexes = GetLineIndexes(script)
    let CharIndex = mode.startFromLine == null ? -1 : LineIndexes[mode.startFromLine]!
    let Running = true
    let Lines: Array<Array<Token>> = []
    let CurrentLine: Array<Token> = []
    let SCRIPT_CONTENTS = script
    let CurrentlyGrabbingContexts: boolean = false
    let TopLevelContext: CodeContext = new CodelineContext()
    let BottomLevelContext: CodeContext = TopLevelContext

    let cu: CharUtils = new CharUtils(SCRIPT_CONTENTS,true)

    //==========[ helper functions ]=========\\

    //does nothing by default, implemented down at the bottom if in get vars mode
    let ReportVariable = function (variable: VariableToken) {}

    function OfferContext(currentIndex: number, autoExtend: "whitespace" | "whitespaceAndIdentifier" | false = "whitespace") {
        if (!CurrentlyGrabbingContexts) { return }
        if (autoExtend == "whitespaceAndIdentifier") {   
            currentIndex += cu.GetWhitespaceAmount(currentIndex) + 1
            currentIndex += cu.GetIdentifier(currentIndex,true)[1].length
        } else if (autoExtend == "whitespace") {
            currentIndex += cu.GetWhitespaceAmount(currentIndex) + 1
        }
        if (currentIndex >= mode.contextTestPosition!) {
            BottomLevelContext.from = currentIndex
            //utilizing error throwing to stop parsing and send the context up 
            //to the top is possibly the most sinful thing i've ever done
            throw BottomLevelContext
        }
    }

    function DiscardContextBranch(branch: CodeContext) {
        let newBottomLevel = branch.discardBranch()
        if (newBottomLevel) {
            BottomLevelContext = newBottomLevel
        }
    }

    const escapableCharacters = ["'","\"","n","\\","&"]
    //returned number will be index of closing char
    //ERR1 = string was not closed
    function GetString(index: number, features: Array<"ampersandConversion"> = [], ignoreContexts: boolean = false): [number, string] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        let openingChar = cu.GetNextCharacters(index, 1)
        let closingChar = openingChar
        //if not a string, return
        if (!["'",'"'].includes(openingChar)) { return null }

        //move to start of string contents (after opening "")
        index += 1 + cu.GetWhitespaceAmount(index)

        let string = ""
        while (index < SCRIPT_CONTENTS.length - 1) {

            let nextChunk = cu.GetCharactersUntil(index + 1, ["\n", "\\", "&", closingChar], true)[1]
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
                } else if (SCRIPT_CONTENTS[index + 2] == "u") {
                    let initIndex = index + 1
                    let sequence: string

                    //unicode character with variable number of digits
                    if (SCRIPT_CONTENTS[index+3] == "{") {
                        let sequenceResults = cu.GetCharactersUntil(index+4,["}","\"","\n"],true)
                        sequence = sequenceResults[1]
                        if (SCRIPT_CONTENTS[sequenceResults[0]+1] != "}") {
                            throw new TCError("Unicode escape sequence was never closed",-1,initIndex,initIndex+1)
                        }
                        if (sequence.length == 0) {
                            throw new TCError("Expected hexadecimal digits inside unicode escape brackets",-1,initIndex,initIndex + 3)
                        }
                        index += sequence.length+2
                    //unicode character with only 4 digits
                    } else {
                        sequence = cu.GetNextCharacters(index+2,4,false)
                        index += 4
                    }
                    
                    //throw error for non-hexadecimal characters
                    if (sequence.match(/[^A-f0-9]/g)) {
                        throw new TCError(`Invalid unicode codepoint: '${sequence}'`,-1,initIndex,index + 2)
                    }

                    try {
                        string += String.fromCodePoint(parseInt(sequence,16))
                    } catch {
                        throw new TCError(`Invalid unicode character: '${sequence}'`,-1,initIndex,index + 2)
                    }
                } else if (escapableCharacters.includes(SCRIPT_CONTENTS[index + 1])) {
                    string += SCRIPT_CONTENTS[index + 2]
                } else {
                    throw new TCError(`Invalid escape sequence: '\\${SCRIPT_CONTENTS[index+2]}'`,-1,index+1,index+2)
                }

                index += 2
            }
            //if chunk stopped due to formatting code
            else if (SCRIPT_CONTENTS[index + 1] == "&") {
                //insert § if that's enabled
                string += features.includes("ampersandConversion") && VALID_FORMATTING_CODES.includes(SCRIPT_CONTENTS[index + 2]) ? "\u00A7" : "&"

                index++
            }
            //if chunk stopped due to closing char
            else if (SCRIPT_CONTENTS[index + 1] == closingChar) {
                if (index + 1 >= mode.contextTestPosition!) {
                    BottomLevelContext.stringInfo = {startIndex: initIndex, endIndex: index + 1, openingChar: openingChar, value: string}
                }
                OfferContext(index + 1)
                return [index + 1, string]
            }
            //if chunk stopped due to newline
            else if (SCRIPT_CONTENTS[index + 1] == "\n") {
                if (index + 1 >= mode.contextTestPosition!) {
                    BottomLevelContext.stringInfo = {startIndex: initIndex, endIndex: index, openingChar: openingChar, value: string, unclosed: true}
                }
                OfferContext(index + 1)
                throw new TCError("String was never closed", 1, initIndex, index)
            }
        }
        if (index >= mode.contextTestPosition!) {
            BottomLevelContext.stringInfo = {startIndex: initIndex, endIndex: index, value: string, openingChar: openingChar, unclosed: true}
        }
        OfferContext(index)
        throw new TCError("String was never closed", 1, initIndex, index)
    }

    //function for names that can either be an identifier or contents of []
    //ERR1: complex name never closed
    //ERR2: missing name
    function GetComplexName(index: number): [number, string] {
        //if theres a (, use the inside of the () as name
        if (cu.GetNextCharacters(index,1) == "(") {
            index += cu.GetWhitespaceAmount(index) + 1
                BottomLevelContext.inComplexName = true
            OfferContext(index)
            let initIndex = index

            let nameResults = GetString(index)
            
            if (nameResults == null) {
                BottomLevelContext.inComplexName = false
                throw new TCError("Expected string following '('",0,index,index)
            }

            index = nameResults[0]
            OfferContext(nameResults[0])
            BottomLevelContext.inComplexName = false
            if (cu.GetNextCharacters(index,1) != ")") {
                throw new TCError("Name was never closed",1,initIndex,index)
            }
            
            index += cu.GetWhitespaceAmount(index) + 1
            
            OfferContext(index,false)
            return [index, nameResults[1]]
        }
        //otherwise, use identifier as name
        else {
            index += cu.GetWhitespaceAmount(index)
            index++ //GetIdentifier starts first character of identifier so move 1 char to that

            //get name of variable
            let variableNameResults = cu.GetIdentifier(index)
            if (variableNameResults == null || variableNameResults[1] == "") {
                OfferContext(index)
                throw new TCError(`Expected name`, 2, index,index)
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

    //==========[ Parser ]=========\\

    //= Variables =\\
    //returned number will be closing ] or final character of identifier
    //ERR1 = variable name never closed
    function ParseVariable(index): [number, VariableToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index //used for error messages

        let keywordResults = cu.GetIdentifier(index)
        if (keywordResults == null) { return null }

        
        let scopeKeyword = keywordResults[1]
        
        //if keyword is a var scope
        let scope = VALID_VAR_SCOPES[scopeKeyword]
        if (scope == null) { return null }
        
        //move into position to parse variable name
        index = keywordResults[0]

        
        let keywordEndIndex = index// used for error messages
        
        let context = new VariableContext()
        BottomLevelContext = BottomLevelContext.setChild(context)
        context.scope = scope
        let nameResults
        
        //parse variable name
        try {
            nameResults = GetComplexName(index)
        } catch (e: any) {
            if (e instanceof CodeContext) {throw e}
            DiscardContextBranch(context)
            if (e.Code == 1) {
                throw new TCError("Variable name was never closed", 1, e.CharStart, e.CharLoc)
            } else if (e.Code == 2) {
                throw new TCError(`Expected variable name following '${scopeKeyword}'`, 2, initIndex, keywordEndIndex)
            } else {
                throw e
            }
        }
        
        index = nameResults[0]
        context.name = nameResults[1]
        OfferContext(index+1,false)

        let type: string | null = null
        //if theres a : after the variable, parse its type
        if (cu.GetNextCharacters(index,1) == ":") {
            //move to :
            index += cu.GetWhitespaceAmount(index) + 1
            let colonIndex = index //used for errors
            let typeContext = new TypeContext()
            BottomLevelContext = BottomLevelContext.setChild(typeContext)

            
            //move to start of type
            index += cu.GetWhitespaceAmount(index) + 1
            
            //actually get type
            let typeResults = cu.GetIdentifier(index)
            if (typeResults[1] == "") {
                OfferContext(index,"whitespaceAndIdentifier")
                DiscardContextBranch(context)
                throw new TCError("Expected type following ':'",0,initIndex,colonIndex)
            }

            OfferContext(typeResults[0]+1,false)
            DiscardContextBranch(typeContext)

            //error for invalid type
            if (!ValueType[typeResults[1]]) {
                DiscardContextBranch(context)
                throw new TCError(`Invalid type '${typeResults[1]}'`,0,index,typeResults[0])
            }

            index = typeResults[0]
            type = typeResults[1]
        }

        //im making a new one cuz im scared that some funny reference shenanigans will happen if i use the one thats returned
        ReportVariable(new VariableToken([initIndex,index],scopeKeyword, nameResults[1], type))
        DiscardContextBranch(context)
        return [index, new VariableToken([initIndex,index],scopeKeyword, nameResults[1], type)]
    }
    
    //= String =\\

    //litearlly just GetString but it returns a string token
    function ParseString(index: number, openingChar: string, closingChar: string = openingChar): [number, StringToken] | null {
        let results
        results = GetString(index, ["ampersandConversion"])
        if (results) {
            return [results[0], new StringToken([index + cu.GetWhitespaceAmount(index) + 1,results[0]],results[1])]
        }

        return null
    }

    //= Number =\\
    

    //ERR1 = invalid character found
    //ERR2 = multiple decimal points
    //returned number will be index of final character of the number
    function ParseNumber(index: number): [number, NumberToken] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        let decimalFound = false
        let forceToBeNumber = false
        let string = ""

        //parse negative sign
        if (cu.GetNextCharacters(index,1) == "-") {
            string = "-"
            index += cu.GetWhitespaceAmount(index) + 1
            //dont let there be a space between the - and the number
            if (!cu.IsCharacterValidNumber(cu.GetCharacterAtIndex(index + 1))) { return null }
        //not a negative number
        } else {
            //if not a number, return null
            if (!cu.IsCharacterValidNumber(cu.GetNextCharacters(index, 1))) { return null }
        }

        index += 1 + cu.GetWhitespaceAmount(index)

        let context = new NumberContext()
        BottomLevelContext = BottomLevelContext.setChild(context)

        while (index < SCRIPT_CONTENTS.length) {
            //if this char is a .
            if (SCRIPT_CONTENTS[index] == ".") {
                //if there has already been a . throw error
                if (decimalFound) {
                    DiscardContextBranch(context)
                    throw new TCError("Multiple decimal points in one number", 2, index, index)
                }

                string += "."

                decimalFound = true
            }
            //if this char is a digit
            else if (cu.IsCharacterValidNumber(SCRIPT_CONTENTS[index])) {
                forceToBeNumber = true
                //dont include any leading 0s
                if (string.length == 0 && SCRIPT_CONTENTS[index] == "0") {
                    index++
                    continue
                }

                string += SCRIPT_CONTENTS[index]
            }
            //allow underscores to seperate digits
            else if (SCRIPT_CONTENTS[index] == "_") {
                if (string.length == 0) {
                    DiscardContextBranch(context)
                    return null
                }
                if (SCRIPT_CONTENTS[index+1] == "." || SCRIPT_CONTENTS[index-1] == "." || SCRIPT_CONTENTS[index-1] == "-") {
                    OfferContext(index+1)
                    DiscardContextBranch(context)
                    throw new TCError(`Underscores are only allowed in numbers when seperating digits`, 1, index, index)
                }
                index++
                continue
            }
            //if character is some other thing that shouldnt be allowed in numbers
            else if (cu.IsCharacterValidIdentifier(SCRIPT_CONTENTS[index])) {
                OfferContext(index)
                DiscardContextBranch(context)
                throw new TCError(`'${SCRIPT_CONTENTS[index]}' is not a valid character in a number`, 1, index, index)
            }
            //if this character is the end of the number
            else {
                break
            }

            index++
        }

        //a single . on its own is not a number
        if (string == "." && forceToBeNumber == false) { 
            DiscardContextBranch(context)
            return null 
        }

        //add one leading 0 if starting with decimal
        if (string == "" || string.charAt(0) == ".") { string = "0" + string }

        //remove trailing decimal if nothing's after it
        if (string[string.length - 1] == ".") { string = string.substring(0, string.length - 1) }

        OfferContext(index,false)
        DiscardContextBranch(context)

        return [index - 1, new NumberToken([initIndex,index - 1],string)]
    }

    //= Vectors =\\
    

    //ERR1 = missing arguments
    //ERR2 = missing coordinate
    function ParseVector(index: number): [number, VectorToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse vec keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no vec keyword, this is not a vector
        if (identifierResults == null || identifierResults[1] != "vec") { return null }

        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext("vec")
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse arguments
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")
        
        DiscardContextBranch(context)
        if (argResults == null) {
            throw new TCError("Expected arguments following vector constructor", 1, keywordInitIndex, index)
        }
        let args = argResults[1].Items
        
        //successful vector creation
        OfferContext(argResults[0])
        return [argResults[0], new VectorToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2],args)]
    }

    //= Minimessage Text =\\
    

    //ERR1 = missing string
    function ParseText(index: number): [number, TextToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse txt keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no txt keyword, this is not a text
        if (identifierResults == null || identifierResults[1] != "s") { return null }

        index = identifierResults[0]

        //parse value (string)
        let stringResults = GetString(index)
        if (stringResults == null) {
            throw new TCError("Expected string following 'txt' keyword", 1, keywordInitIndex, index)
        }

        return [stringResults[0], new TextToken([keywordInitIndex,stringResults[0]],stringResults[1])]
    }

    //= Sound =\\
    

    function ParseSound(index: number): [number, SoundToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse snd keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no snd keyword, this is not a sound
        if (identifierResults == null || !(identifierResults[1] == "snd" || identifierResults[1] == "csnd")) { return null }

        let isCustom = identifierResults[1] == "csnd"

        //move to end of snd keyword
        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext(identifierResults[1])
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse arguments
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

        DiscardContextBranch(context)
        if (argResults == null) {
            throw new TCError("Expected arguments following sound constructor", 1, keywordInitIndex, index)
        }

        let args = argResults[1].Items

        //successful sound creation
        OfferContext(argResults[0])
        return [argResults[0], new SoundToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2], args[3],isCustom,args)]
    }


    //= Locations =\\
    

    //ERR1 = missing arguments
    //ERR2 = missing coordinate
    //ERR3 = too many args
    function ParseLocation(index: number): [number, LocationToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse loc keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no loc keyword, this is not a location
        if (identifierResults == null || identifierResults[1] != "loc") { return null }

        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext("loc")
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse arguments
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

        DiscardContextBranch(context)
        if (argResults == null) {
            throw new TCError("Expected arguments following location constructor", 1, keywordInitIndex, index)
        }
        let args = argResults[1].Items

        //successful location creation
        OfferContext(argResults[0])
        return [argResults[0], new LocationToken([keywordInitIndex,argResults[0]],args[0], args[1], args[2], args[3], args[4],args)]
    }

    //= Potions =\\
    

    function ParsePotion(index): [number, PotionToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse pot keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no pot keyword, this is not a potion
        if (identifierResults == null || identifierResults[1] != "pot") { return null }
        
        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext("pot")
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse arguments
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

        DiscardContextBranch(context)
        if (argResults == null) {
            throw new TCError("Expected arguments following potion constructor", 1, keywordInitIndex, index)
        }
        let args = argResults[1].Items
        
        OfferContext(argResults[0])
        return [argResults[0],new PotionToken([keywordInitIndex,argResults[0]],args[0],args[1],args[2],args)]
    }

    //= Items =\\
    

    //BASIC ITEM SYNTAX: item [id,count,nbt]
    //LIB ITEM SYNTAX: litem [library, id, count]
    function ParseItem(index: number): [number, ItemToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse item keyword
        let identifierResults = cu.GetIdentifier(index)

        //if no item keyword, this is not an item
        if (identifierResults == null || !(identifierResults[1] == "item" || identifierResults[1] == "litem")) { return null }

        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext(identifierResults[1])
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse arguments
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

        DiscardContextBranch(context)
        if (argResults == null) {
            throw new TCError("Expected arguments following item constructor", 1, keywordInitIndex, index)
        }
        let args = argResults[1].Items

        OfferContext(argResults[0])
        //basic item
        if (identifierResults[1] == "item") {
            return [argResults[0], new ItemToken([keywordInitIndex,argResults[0]],args[0], args[1], null, "basic", args)]
        //library item
        } else if (identifierResults[1] == "litem") {
            return [argResults[0], new ItemToken([keywordInitIndex,argResults[0]],args[1],args[2],args[0], "library", args)]
        }
        return null
    }

    //= Particles =\\

    function ParseParticle(index: number): [number, ParticleToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let keywordInitIndex = index

        //parse par keyword
        let identifierResults = cu.GetIdentifier(index)
        if (identifierResults == null || identifierResults[1] != "par") { return null }


        index = identifierResults[0]
        OfferContext(index)
        let context = new ConstructorContext(identifierResults[1])
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse args
        let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

        if (argResults == null) {
            DiscardContextBranch(context)
            throw new TCError("Expected arguments following particle constructor",1,keywordInitIndex,index)
        }
        DiscardContextBranch(context)
        OfferContext(argResults[0])
        let args = argResults[1].Items
        
        return [argResults[0],new ParticleToken([keywordInitIndex,argResults[0]],args[0],args[1],args)]
    }

    //= List/Dictionary Indexer =\\
   
    function ParseIndexer(index: number): [number, IndexerToken] | null {
        //if next character isn't a [ then this isnt an indexer
        if (cu.GetNextCharacters(index,1) != "[") { return null }

        //move to [
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //parse indexer expression
        let expressionResults = ParseExpression(index,["]",";"],true)
        if (expressionResults == null) {
            throw new TCError("Expected index value for indexer",0,initIndex, initIndex)
        }

        return [expressionResults[0],new IndexerToken([initIndex,expressionResults[0]],expressionResults[1])]
    }

    //= Operators =\\
   

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
        index += cu.GetWhitespaceAmount(index)

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
            let operatorString = cu.GetNextCharacters(index, length)

            if (validOperators.includes(operatorString)) {
                return [index + length, new OperatorToken([index + 1,index+length],operatorString)]
            }
        }

        return null
    }

    //= Dictionary =\\
    

    function ParseDictionary(index, openingChar: string, closingChar: string, seperatingChar: string, assignmentChar: string): [number, DictionaryToken] | null {
        index += cu.GetWhitespaceAmount(index)
        let initIndex = index

        if (cu.GetNextCharacters(index,1) != openingChar) { return null }
        
        //move to opening char
        index += cu.GetWhitespaceAmount(index) + 1
        let context = new DictionaryContext()
        BottomLevelContext = BottomLevelContext.setChild(context)

        let keys: Array<ExpressionToken> = []
        let values: Array<ExpressionToken> = []
        
        while (SCRIPT_CONTENTS[index] != closingChar && index < SCRIPT_CONTENTS.length) {
            context.in = ContextDictionaryLocation.Key
            //= key =\\
            let keyInitIndex = index + cu.GetWhitespaceAmount(index) + 1 //used for errors
            let keyResults: [number, ExpressionToken] | null = ParseExpression(index,[closingChar,assignmentChar,";"],false) 

            
            OfferContext(index,"whitespaceAndIdentifier")
            //if empty dictionary, stop
            if (keyResults == null) { 
                index += cu.GetWhitespaceAmount(index) + 1
                break 
            }
            
            //move to end of key
            index = keyResults[0]
            OfferContext(index,"whitespaceAndIdentifier")

            //add to key list
            keys.push(keyResults[1])

            //= assignment char =\\
            //throw error if missing assignment char
            if (cu.GetNextCharacters(index,1) != assignmentChar) {
                DiscardContextBranch(context)
                throw new TCError(`Expected '${assignmentChar}' following key`,0,keyInitIndex,index)
            }
            //move to assignment char
            index += cu.GetWhitespaceAmount(index) + 1
            context.in = ContextDictionaryLocation.Value
            
            //= value =\\
            let valueResults = ParseExpression(index,[closingChar,seperatingChar,";"],false)
            if (valueResults == null) {
                OfferContext(index,"whitespaceAndIdentifier")
                DiscardContextBranch(context)
                throw new TCError(`Expected value following '${assignmentChar}'`,0,keyInitIndex,index)
            }
            //move to end of value
            index = valueResults[0]
            OfferContext(index,"whitespaceAndIdentifier")

            //add value to list
            values.push(valueResults[1])

            //move to seperating char or ending char
            if (cu.GetNextCharacters(index,1) == seperatingChar || cu.GetNextCharacters(index,1) == closingChar) {
                index += cu.GetWhitespaceAmount(index) + 1
            }
        }

        DiscardContextBranch(context)
        OfferContext(index,"whitespaceAndIdentifier")

        //error if dict is unclosed because of EOF
        if (index + cu.GetWhitespaceAmount(index) >= SCRIPT_CONTENTS.length) {
            throw new TCError("Dictionary was never closed", 1, initIndex + 1, cu.GetLineEnd(index) - 1)
        }

        return [index, new DictionaryToken([initIndex,index],keys,values)]
    }

    //= ListToken =\\
    
    //ERR1 = list was never closed
    function ParseList(index, openingChar: string, closingChar: string, seperatingChar: string): [number, ListToken] | null {
        index += cu.GetWhitespaceAmount(index)
        let initIndex = index

        if (cu.GetNextCharacters(index, 1) != openingChar) { return null }

        //move to opening char
        index += cu.GetWhitespaceAmount(index) + 1
        let context = new ListContext()
        BottomLevelContext = BottomLevelContext.setChild(context)
        
        let items: ExpressionList = []
        context.prevoiusElements = items

        let i = 0
        while (SCRIPT_CONTENTS[index] != closingChar && index < SCRIPT_CONTENTS.length) {
            context.elementIndex = i
            //error for unclosed list if theres a semicolon in the middle of it
            if (SCRIPT_CONTENTS[index] == ";") {
                OfferContext(index-1)
                throw new TCError("List was never closed",1,initIndex + 1,index - 1)
            }
            let expressionResults
            try {
                expressionResults = ParseExpression(index, [seperatingChar, closingChar,";"], false,[])
            } catch (e: any) {
                if (e instanceof CodeContext) { throw e }
                OfferContext(index)
                DiscardContextBranch(context)
                if (e.message == "Expression was never closed") {
                    throw new TCError("List was never closed", 1, initIndex + 1, cu.GetLineEnd(index) - 1)
                }
                else {
                    throw e
                }
            }
            
            if (expressionResults == null) {
                //the only situation this can happen is when the list is empty eg. ()
                //move to closing char so loop finishes:
                index += cu.GetWhitespaceAmount(index) + 1
                OfferContext(index-1)
                if (cu.GetNextCharacters(index,1) == seperatingChar) {
                    items.push(null)
                    i++
                }
            } 
            else {
                i++
                index = expressionResults[0] + cu.GetWhitespaceAmount(expressionResults[0]) + 1
                OfferContext(index-1)
                items.push(expressionResults[1])
            }
        }

        DiscardContextBranch(context)

        //remove trailing nulls
        while (items[items.length-1] === null) {
            items.pop()
        }

        //error if list is unclosed because of EOF
        if (index >= SCRIPT_CONTENTS.length) {
            throw new TCError("List was never closed", 1, initIndex + 1, cu.GetLineEnd(index) - 1)
        }

        return [index, new ListToken([initIndex,index],items)]
    }

    //= Control =\\
    //break, skip, endthread, return, returnmult, wait


   

    function ParseControlBlock(index: number): [number, ControlBlockToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //get keyword
        let identifierResults = cu.GetIdentifier(index)
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
            index = identifierResults[0]
            let expressionResults = ParseExpression(index,[";"],false)
            if (expressionResults) {
                return [expressionResults[0], new ControlBlockToken([initIndex,expressionResults[0]],"Return",null,null,expressionResults[1])]
            } else {
                return [identifierResults[0], new ControlBlockToken([initIndex,identifierResults[0]],"Return")]
            }
        }
        // else if (identifierResults[1] == "returnmult") {
        //     //parse number for how many times to return
        //     let expressionResults = ParseExpression(identifierResults[0],[";"],false)
        //     if (expressionResults == null) {
        //         throw new TCError("Expected number following 'returnmult'",0,initIndex,index)
        //     }
        //
        //     return [expressionResults[0], new ControlBlockToken([initIndex,expressionResults[0]],"ReturnNTimes",new ListToken([index,expressionResults[0]],[expressionResults[1]]))]
        // }
        else if (identifierResults[1] == "wait") {
            index = identifierResults[0]
            OfferContext(index)
            let context = new StandaloneFunctionContext("wait")
            BottomLevelContext = BottomLevelContext.setChild(context)

            let listInitIndex = index + cu.GetWhitespaceAmount(index) + 1
            let listResults: [number, ListToken] | null = ParseList(index,"(",")",",")
            let args: ListToken
            if (listResults) {
                index = listResults[0]
                args = listResults[1]
            } else {
                args = new ListToken([listInitIndex, -1], [])
            }

            let tagResults = ParseTags(index, AD.DFActionMap.control!.Wait!.Tags)
            let tags
            if (tagResults) {
                index = tagResults[0]
                tags = tagResults[1]
            }
            DiscardContextBranch(context)
            return [index, new ControlBlockToken([initIndex,index],"Wait",args,tags)]
        }   

        return null
    }

    //= If statements!!! =\\
   
    function ParseElse(index: number): [number, ElseToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let identifierResults = cu.GetIdentifier(index)

        if (identifierResults != null && identifierResults[1] == "else") {
            return [identifierResults[0], new ElseToken([index,identifierResults[0]])]
        }

        return null
    }

   

    function ParseIf(index: number): [number, IfToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        let identifierResults = cu.GetIdentifier(index)

        //make sure this is an if keyword
        if (identifierResults[1] != "if") { return null }

        index = identifierResults[0]

        //make sure theres a ( for the condition afterwards
        if (cu.GetNextCharacters(index, 1) != "(") {
            throw new TCError("Expected condition wrapped in parentheses following 'if'",0,initIndex,identifierResults[0])
        }

        index += cu.GetWhitespaceAmount(index) + 1
        let context = new ConditionContext()
        BottomLevelContext = BottomLevelContext.setChild(context)

        //parse expression
        let expressionResults = ParseExpression(index,[")",";"],true,["comparisons"])
        if (expressionResults == null) {
            throw new TCError("Expected condition following 'if'",0,initIndex,identifierResults[0])
        }
        
        DiscardContextBranch(context)
        return [expressionResults[0],new IfToken([initIndex,expressionResults[0]],expressionResults[1])]
    }

    //= Repeat =\\
    

    function ParseRepeat(index: number): [number, RepeatToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        let keywordResults = cu.GetIdentifier(index)
        index = keywordResults[0]

        //repeat n times or repeat forever
        if (keywordResults[1] == "repeat") {
            //repeat Forever
            // let foreverResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)
            if (cu.GetNextCharacters(index + cu.GetWhitespaceAmount(index),1) == "{") {
                return [index + cu.GetWhitespaceAmount(index), new RepeatForeverToken([initIndex,index + cu.GetWhitespaceAmount(index)])]
            }
            //anything below this is for repeat multiple
            //(n)
            if (cu.GetNextCharacters(index,1) != "(") {
                throw new TCError("Expected '(' or '{' following 'repeat'",0,initIndex,index)
            }
            OfferContext(index)
            index += cu.GetWhitespaceAmount(index) + 1
            let context = new RepeatContext()
            BottomLevelContext = BottomLevelContext.setChild(context)
            OfferContext(index)

            //variable
            let variableResults = ParseVariable(index)
            if (variableResults) {
                OfferContext(variableResults[0])
                let toResults = cu.GetIdentifier(variableResults[0] + cu.GetWhitespaceAmount(variableResults[0]) + 1)
                
                //if there's a "to", use this variable as the index getter
                if (toResults && toResults[1] == "to") {
                    index = toResults[0]
                } 
                //otherwise throw it out here and let the following expression parsing scoop it up
                else {
                    variableResults = null
                }
            }

            //expression
            OfferContext(index)
            let expressionResults = ParseExpression(index,[")",";"],true)
            
            if (expressionResults == null) {
                DiscardContextBranch(context)
                throw new TCError("Expected an actual expression",0,initIndex,index+1)
            }


            //success
            return [expressionResults[0],new RepeatMultipleToken([initIndex,expressionResults[0]],expressionResults[1],variableResults ? variableResults[1] : null)]
        }
        //while
        else if (keywordResults[1] == "while") {
            //make sure theres a (
            if (cu.GetNextCharacters(index,1) != "(") {
                throw new TCError("Expected condition wrapped in parentheses following 'while'",0,initIndex,keywordResults[0])
            }
            
            index += cu.GetWhitespaceAmount(index) + 1
            let context = new ConditionContext(true)
            BottomLevelContext = BottomLevelContext.setChild(context)
            //expression
            let expressionResults = ParseExpression(index,[")",";"],true,["comparisons","genericTargetComparisons"])
            OfferContext(expressionResults?.[0] ?? index,"whitespaceAndIdentifier")
            DiscardContextBranch(context)
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
            //make sure theres a (
            if (cu.GetNextCharacters(index,1) != "(") {
                throw new TCError(`Expected '(' following 'for'`,0,initIndex,index)
            }
            
            index += cu.GetWhitespaceAmount(index) + 1
            let context = new ForLoopContext()
            context.variables = variables
            BottomLevelContext = BottomLevelContext.setChild(context)
            
            //accumulate variables until either the 'in' or 'on' keyword
            while (true) { //scary!!
                let variableResults = ParseVariable(index)
                //error for invalid variable
                if (variableResults == null) {
                    let identifierResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)
                    OfferContext(identifierResults[0])
                    DiscardContextBranch(context)
                    throw new TCError(`Expected variable(s) following 'for'`,0,initIndex,identifierResults[0])
                }

                //add to variables list
                variables.push(variableResults[1])

                index = variableResults[0]

                //if keyword was found
                let keywordResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)
                if (keywordResults[1] == "in" || keywordResults[1] == "on") {
                    mode = keywordResults[1]
                    context.mode = mode
                    index = keywordResults[0]
                    break
                }

                //throw error if next character isnt a comma
                if (cu.GetNextCharacters(index,1) != ",") {
                    OfferContext(index,"whitespaceAndIdentifier")
                    DiscardContextBranch(context)
                    throw new TCError("Expected comma, 'in', or 'on'",0,initIndex,index)
                }

                //move to comma
                index += cu.GetWhitespaceAmount(index) + 1
            }

            let actionInitIndex = index

            let returnToken: RepeatToken

            //iterating over a dictionary
            if (mode == "in") {
                //parse expression inside the ()
                let expressionResults = ParseExpression(index,[")",";"],true)
                if (expressionResults == null) {
                    OfferContext(index,"whitespaceAndIdentifier")
                    DiscardContextBranch(context)
                    throw new TCError("Expected list or dictionary inside parentheses",0,initIndex,index)
                }

                index = expressionResults[0]
                returnToken = new RepeatForInToken([initIndex,expressionResults[0]],variables,expressionResults[1])
            } 
            //iterating using a repeat action
            else if (mode == "on") {
                //parse action name
                let actionNameInitIndex = index + cu.GetWhitespaceAmount(index) + 1
                let actionNameResults = cu.GetIdentifier(actionNameInitIndex)
                //error for missing action name
                if (actionNameResults[1] == "") {
                    OfferContext(actionNameResults[0],"whitespaceAndIdentifier")
                    DiscardContextBranch(context)
                    throw new TCError("Missing action name", 0, initIndex, actionNameResults[0])
                }

                //move to end of action name
                index = actionNameResults[0]
                context.action = actionNameResults[1]
                OfferContext(index)

                //parse args
                let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")
                if (argResults == null) {
                    DiscardContextBranch(context)
                    throw new TCError("Expected arguments following action name", 0, actionNameInitIndex, index)
                }
                //move to end of args
                index = argResults[0]

                //parse tags
                let tags
                let tagResults = ParseTags(index, AD.TCActionMap.repeat![actionNameResults[1]] != null ? AD.TCActionMap.repeat![actionNameResults[1]]!.Tags : {})
                if (tagResults) {
                    index = tagResults[0]
                    tags = tagResults[1]
                }

                
                //parse closing bracket
                if (cu.GetNextCharacters(index, 1) != ")") {
                    OfferContext(index)
                    DiscardContextBranch(context)
                    throw new TCError("Repeat action never closed", 0, actionInitIndex, index)
                }

                //move to closing bracket
                index += cu.GetWhitespaceAmount(index) + 1
                
                returnToken = new RepeatForActionToken([initIndex,index],variables,actionNameResults[1],argResults[1],tags)
            }

            OfferContext(index)
            DiscardContextBranch(context)
            return [index,returnToken!]
        }
        //not a repeat statement
        else {
            return null
        }
    }

    //= Brackets =\\
    

    function ParseTags(index, validTags: Dict<AD.Tag>): [number,Dict<ActionTag>] | null {
        let tags = {}

        if (cu.GetNextCharacters(index, 1) == "{") {
            let context = new TagsContext()
            BottomLevelContext = BottomLevelContext.setChild(context)

            //move to opening {
            index += 1 + cu.GetWhitespaceAmount(index)

            //if empty tag list
            if (cu.GetNextCharacters(index, 1) == "}") {
                context.in = ContextDictionaryLocation.Key
                OfferContext(index,"whitespaceAndIdentifier")
                DiscardContextBranch(context)
                index += 1 + cu.GetWhitespaceAmount(index)
                return [index,{}]
            } else {
                let tagsListInitIndex = index

                while (SCRIPT_CONTENTS[index] != "}") {
                    context.in = ContextDictionaryLocation.Key
                    context.keyName = undefined
                    OfferContext(index,"whitespaceAndIdentifier")

                    let tagInitIndex = index + 1 + cu.GetWhitespaceAmount(index)

                    //parse tag name
                    //try catch is to prevent the string context from getting offered
                    let tagNameResults = GetString(index,[],true)

                    if (tagNameResults == null) {
                        // let tags have trailing comma
                        if (cu.GetNextCharacters(index,1) == "}") { 
                            index += cu.GetWhitespaceAmount(index) + 1
                            break 
                        }
                        OfferContext(index,"whitespaceAndIdentifier")
                        DiscardContextBranch(context)
                        throw new TCError("Missing tag name", 3, index, index)
                    }


                    let tagName = tagNameResults[1]
                    
                    //move to end of tag name
                    index = tagNameResults[0]
                    context.keyName = tagName
                    OfferContext(index)
                    
                    //error if next char isn't =
                    if (cu.GetNextCharacters(index, 1) != "=") {
                        DiscardContextBranch(context)
                        throw new TCError("Expected '=' following tag name", 6, index + 1, index + 1)
                    }

                    //move to =
                    index += 1 + cu.GetWhitespaceAmount(index)
                    context.in = ContextDictionaryLocation.Value
                    OfferContext(index,"whitespaceAndIdentifier")

                    //parse variable
                    let variableResults = ParseVariable(index)
                    let variable: VariableToken | null = null
                    if (variableResults) {
                        context.isVariable = true
                        //move to end of variable
                        index = variableResults[0]

                        //throw error if next character isn't a ?
                        if (cu.GetNextCharacters(index, 1) != "?") {
                            OfferContext(index,"whitespaceAndIdentifier")
                            DiscardContextBranch(context)
                            throw new TCError(`Expected '?' following variable '${variableResults[1].Name}'`, 9, index + 1, index + 1)
                        }

                        variable = variableResults[1]

                        //move to ?
                        index += 1 + cu.GetWhitespaceAmount(index)

                    }
                    let lastCharIndex = index

                    let valueInitIndex = index + cu.GetWhitespaceAmount(index) + 1
                    //parse tag value
                    let tagValueResults = GetString(index,[],true)

                    if (tagValueResults == null) {
                        OfferContext(index,"whitespaceAndIdentifier")
                        DiscardContextBranch(context)
                        if (variable) {
                            throw new TCError("Expected tag value following '?'", 7, lastCharIndex, lastCharIndex)
                        } else {
                            throw new TCError("Expected variable or tag value", 7, index, index)
                        }
                    }
                    let tagValue = tagValueResults[1]

                    //move to end of tag value
                    index = tagValueResults[0]

                    //throw error if next character is end of line
                    if (cu.GetNextCharacters(index, 1) == "\n" || index + 1 + cu.GetWhitespaceAmount(index) >= SCRIPT_CONTENTS.length) {
                        DiscardContextBranch(context)
                        throw new TCError("Tags list never closed", 5, tagsListInitIndex, cu.GetLineEnd(index) - 1)
                    }

                    //add to tag list
                    tags[tagName] = new ActionTag(tagName, tagValue, variable, tagInitIndex, index)

                    //move to next character (, or })
                    index += 1 + cu.GetWhitespaceAmount(index)
                }

                OfferContext(index)
                DiscardContextBranch(context)

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
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //= parse domain =\\
        let domainResults = cu.GetIdentifier(index)
        if (domainResults == null) { return null }

        let validDomains = genericTargetComparisons ? GenericDomains : PublicDomains

        let domain = validDomains[domainResults[1]]
        if (!domain) { return null }

        //move to end of domain
        index = domainResults[0]

        //= only progress if calling an action =\\
        let accessor = cu.GetNextCharacters(index, 1)
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
            actions = domain.Conditions
        }

        //move to the accessor
        index += 1 + cu.GetWhitespaceAmount(index)
        let context = new DomainAccessContext(isComparison ? ContextDomainAccessType.Condition : ContextDomainAccessType.Action,domain.Identifier) 
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(index,"whitespaceAndIdentifier")

        //= parse action =\\
        let actionNameInitIndex = index + cu.GetWhitespaceAmount(index) + 1
        let actionResults = cu.GetIdentifier(actionNameInitIndex)
        //error for missing action
        if (actionResults == null || actionResults[1] == "") {
            OfferContext(index,"whitespaceAndIdentifier")
            DiscardContextBranch(context)
            if (domain instanceof TargetDomain) {
                throw new TCError(`Expected name for ${domain.ActionType} action`, 1, initIndex, index)
            }
            else {
                throw new TCError(`Expected function name`, 1, initIndex + 1, index)
            }
        }
        
        //move to the end of the action name
        index = actionResults[0]
        context.name = actionResults[1]
        OfferContext(index)

        try {
            //parse params
            let listInitIndex = index + cu.GetWhitespaceAmount(index) + 1
            let paramResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")
            let params: ListToken
            if (paramResults) {
                index = paramResults[0]
                params = paramResults[1]
            } else {
                params = new ListToken([listInitIndex,-1],[])
            }
    
            let tags
            let tagResults = ParseTags(index, actions[actionResults[1]] != undefined ? actions[actionResults[1]]!.Tags : {})
            if (tagResults != null) {
                tags = tagResults[1]
                index = tagResults[0]
            }
    
            DiscardContextBranch(context)
            OfferContext(index)
            return [index, new ActionToken([initIndex,index,actionNameInitIndex,actionResults[0]],domain.Identifier, actionResults[1], params, isComparison, tags!)]
        } catch (e) {
            if (e instanceof TCError) { throw e }
            if (e instanceof CodeContext) { throw e }
            DiscardContextBranch(context)
            return null
        }
    }

    //= Call function/start process =\\
    

    function ParseCall(index: number): [number, CallToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        let mode

        //parse keyword
        let keywordResults = cu.GetIdentifier(index)
        if (keywordResults[1] == "call") {
            mode = "function"
        } else if (keywordResults[1] == "start") {
            mode = "process"
        } else {
            return null
        }

        //move into position to parse function name
        index = keywordResults[0]
        OfferContext(index+1,false)
        let context = new UserCallContext(mode)
        BottomLevelContext = BottomLevelContext.setChild(context)
        let keywordEndIndex = index// used for error messages
        
        
        //parse function name (totally not copy pasted from ParseVariable)
        let nameResults
        try {
            nameResults = GetComplexName(index)
        }
        catch (e: any) {
            if (e instanceof CodeContext) { throw e }
            DiscardContextBranch(context)
            if (e.Code == 1) {
                throw new TCError(`${mode == "function" ? "Function" : "Process"} name was never closed`, 1, e.CharStart, e.CharLoc)
            } else if (e.Code == 2) {
                throw new TCError(`Expected function name`, 2, initIndex, keywordEndIndex)
            }
        }

        index = nameResults[0]
        context.name = nameResults[1]
        OfferContext(index+1,false)
        
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
            let tagsResults = ParseTags(index,AD.DFActionMap.start_process!.dynamic!.Tags)
            if (tagsResults) {
                index = tagsResults[0]
                tags = tagsResults[1]
            }
        }
        
        OfferContext(index,false)
        DiscardContextBranch(context)
        return [index, new CallToken([initIndex,index],mode,nameResults[1],args,tags)]
    }

    //======== SPECIAL CODE ITEMS ========\\

    //= Game Values =\\
    

    function ParseGameValue(index: number): [number, Token] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //= parse domain =\\
        let domainResults = cu.GetIdentifier(index)
        if (domainResults == null) { return null }

        let domain = DomainList[domainResults[1]]
        if (!domain) { return null }

        //move to end of domain
        index = domainResults[0]

        //= only progress if accessing a game value
        if (cu.GetNextCharacters(index, 1) != ".") { return null }

        //move to the accessor
        index += 1 + cu.GetWhitespaceAmount(index)
        let context = new DomainAccessContext(ContextDomainAccessType.Value,domain.Identifier)
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(index,"whitespaceAndIdentifier")

        //= parse value =\\
        let valueInitIndex = index + cu.GetWhitespaceAmount(index) + 1
        let valueResults = cu.GetIdentifier(valueInitIndex)

        DiscardContextBranch(context)
        OfferContext(valueResults[0])
        //error for missing action
        if (valueResults == null || valueResults[1] == "") {
            if (domain instanceof TargetDomain) {
                throw new TCError(`Expected name for game value`, 1, initIndex + 1, index)
            }
            else {
                throw new TCError(`Expected value name`, 1, initIndex + 1, index)
            }
        }

        //move to the end of the action name
        index = valueResults[0]
        return [index, new GameValueToken([initIndex,index,valueInitIndex,index],valueResults[1], domain.Identifier)]
    }

    //= Type override thingy =\\
    //this is ONLY USED IN EXPRESSIONS!
    //this is not used for variables, they do their own type parsing
    

    function ParseTypeOverride(index: number): [number, TypeOverrideToken] | null {
        //parse colon
        if (cu.GetNextCharacters(index,1) != ":") { return null }
        //move to colon
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        
        //move to start of type
        index += cu.GetWhitespaceAmount(index) + 1
        let context = new TypeContext()
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(index,"whitespaceAndIdentifier")
        
        //parse type
        let typeResults = cu.GetIdentifier(index)
        OfferContext(index[0])
        DiscardContextBranch(context)
        if (typeResults[1] == "") {throw new TCError("Expected type following ':'",0,initIndex,initIndex)}

        //error for invalid type
        if (!ValueType[typeResults[1]]) { throw new TCError(`Invalid type '${typeResults[1]}'`,0,index,typeResults[0])}

        return [typeResults[0],new TypeOverrideToken([initIndex,typeResults[0]],typeResults[1])]
    }

    //= Expressions =\\

   

    //ERR1 = expression never closed
    //ERR2 = invalid value
    //ERR3 = invalid operator
    //ERR4 = expression started with operator
    //ERR5 = operator instead of value
    //ERR6 = multiple comparisons
    function ParseExpression(
        index: number, 
        terminateAt: Array<string | null> = [], 
        endIndexAtTerminator: boolean | undefined = true, 
        features: Array<"comparisons" | "genericTargetComparisons" | "lineTolerance" | "selectionActions"> = [],
        extraArgs: {"stopAtEndOfLine"?: number} = {},
        ): [number, ExpressionToken] | null 
    {
        //if it should terminate at a newline, also terminate at eof
        if (terminateAt.includes("\n")) {
            if (!terminateAt.includes(null)) { terminateAt.push(null) }
            if (!terminateAt.includes("")) { terminateAt.push("") }
        }
        let expressionSymbols: Array<any> = []
        let not = false

        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        //not parsing
        if (features.includes("comparisons")) {
            let symbolResults = SCRIPT_CONTENTS[initIndex];
            if (symbolResults == "!") {
                index = initIndex + cu.GetWhitespaceAmount(initIndex)
                not = true
            }
        }

        let lastErrorEnd = -1

        index += cu.GetWhitespaceAmount(index)
        while (!terminateAt.includes(cu.GetNextCharacters(index, 1)) && index + cu.GetWhitespaceAmount(index) + 1 < SCRIPT_CONTENTS.length) {
            OfferContext(index,"whitespace")
            try {
                let valueInitIndex = index

                if (features.includes("lineTolerance") && extraArgs.stopAtEndOfLine != undefined && index > LineIndexes[extraArgs.stopAtEndOfLine+1!]) {
                    break
                }

                //= ERROR: expression isnt closed
                if ((cu.GetNextCharacters(index, 1) == ";" && !features.includes("lineTolerance")) || (cu.GetNextCharacters(index, 1) == "" && !terminateAt.includes(";"))) {
                    throw new TCError("Expression was never closed", 1, initIndex, index)
                }

                let results: [number, Token] | null = null
                // parse next token!!

                //try nested expression
                if (cu.GetNextCharacters(index, 1) == "(") {
                    results = ParseExpression(index + cu.GetWhitespaceAmount(index) + 1, [")",";"])
                }

                //try indexer thingy if last token isn't an operator
                //(if last token is an operator, the square brackets should be parsed as a list later down)
                if (results == null && expressionSymbols[expressionSymbols.length - 1] && !(expressionSymbols[expressionSymbols.length - 1] instanceof OperatorToken)) { results = ParseIndexer(index) }

                //try action
                if (results == null) { results = ParseAction(index, true, features.includes("genericTargetComparisons")) }

                //try select action
                if (results == null && (features.includes("selectionActions") || mode.mode == "getContext")) { results = ParseSelectAction(index) }
                
                //try a bunch of stuff for autocomplete's sake
                if (mode.mode == "getContext") {
                    //keep results local to here so that tokens aren't added to the actual expressions
                    //since none of these tokens are made for that
                    let results
                    if (results == null) { results = ParseRepeat(index) }
                    if (results == null) { results = ParseControlBlock(index) }
                }

                //try string
                if (results == null) { results = ParseString(index, "\"") }

                //try number first if last token is operator or this is the first token so negative numbers are possible
                if (expressionSymbols.length == 0 || (expressionSymbols[expressionSymbols.length - 1] && expressionSymbols[expressionSymbols.length - 1] instanceof OperatorToken)) {
                    if (results == null) { results = ParseNumber(index) }
                    if (results == null) { results = ParseOperator(index, "math") }
                } else {
                    if (results == null) { results = ParseOperator(index, "math") }
                    if (results == null) { results = ParseNumber(index) }
                }

                //try comparison operator
                if (results == null && features.includes("comparisons")) { results = ParseOperator(index, "comparison") }

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
                
                //try particle
                if (results == null) { results = ParseParticle(index) }

                //try function
                if (results == null) { results = ParseCall(index) }

                //try game value
                if (results == null) { results = ParseGameValue(index) }

                //try list
                if (results == null) { results = ParseList(index, "[","]",",") }

                //try dict
                if (results == null) { results = ParseDictionary(index, "{", "}", ",", "=")}

                //try type override
                if (results == null) { results = ParseTypeOverride(index) }

                if (results == null) {
                    let identifierResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)!
                    if (identifierResults[1] == "") {
                        throw new TCError(`Invalid character: '${cu.GetNextCharacters(index, 1)}'`, 2, valueInitIndex + cu.GetWhitespaceAmount(index) + 1, valueInitIndex + cu.GetWhitespaceAmount(index) + 1)
                    }
                    else {
                        if (features.includes("genericTargetComparisons") && identifierResults[1] in TargetDomains) {
                            throw new TCError(`Only generic target conditions are supported here. Try replacing '${identifierResults[1]}' with '${(TargetDomains[identifierResults[1]] as TargetDomain).ActionType}'.`, 2, valueInitIndex + cu.GetWhitespaceAmount(index) + 1, identifierResults[0])
                        } else {
                            throw new TCError(`Invalid value: '${identifierResults[1]}'`, 2, valueInitIndex + cu.GetWhitespaceAmount(index) + 1, identifierResults[0])
                        }
                    }
                }


                if (results) {
                    expressionSymbols.push(results[1])
                    index = results[0]
                    continue
                } else {
                    throw Error("y'all, that expression dont look right")
                }
            }
            catch (e) {
                if (mode.mode == "getTokens") { throw e }
                if (e instanceof TCError) {
                    index = e.CharLoc
                    lastErrorEnd = index
                    if (lastErrorEnd == index) {
                        index += cu.GetWhitespaceAmount(index)
                        lastErrorEnd = index
                    }
                } else {
                    throw e
                }
            }
        } //end of value while loop

        //if this expression has a terminator, move index to that terminate if told to
        if (terminateAt.includes(cu.GetNextCharacters(index, 1)) && endIndexAtTerminator) {
            //dont move if expression ended because of eof
            if (cu.GetNextCharacters(index, 1) != "") {
                index += 1 + cu.GetWhitespaceAmount(index)
            }
        }
        
        if (expressionSymbols.length > 1 && not) {
            throw new TCError(`Only if-block style conditions (e.g. default?HasItem) can be inverted using the '!' operator.`,0,initIndex,index)
        }

        if (expressionSymbols.length > 0) {
            return [index, new ExpressionToken([initIndex,index],expressionSymbols,not)]
        }

        return null
    }

    //= Headers ==\\
    function ParseKeywordHeaderToken(index): [number, KeywordHeaderToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let identifierResults = cu.GetIdentifier(index)
        if (VALID_HEADER_KEYWORDS.includes(identifierResults[1])) {
            //if valid keyword
            return [identifierResults[0],new KeywordHeaderToken([index,identifierResults[0]],identifierResults[1])]
        } else {
            return null
        }
    }

    function ParseDescriptionHeaderToken(index): [number, DescriptionHeaderToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        let identifierResults = cu.GetIdentifier(index)
        if (identifierResults[1] == "DESC") {
            index = identifierResults[0]
            let stringResults = GetString(index)
            let desc: string | undefined = undefined
            if (stringResults) {
                index = stringResults[0]
                desc = stringResults[1]
            }
            return [index,new DescriptionHeaderToken([initIndex,index],desc)]
        } else {
            return null
        }
    }

    function ParseReturnsHeaderToken(index: number): [number, ReturnsHeaderToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //make sure its the right header type
        let identifierResults = cu.GetIdentifier(index)
        if (identifierResults[1] != "RETURNS") { return null }
        index = identifierResults[0]

        OfferContext(identifierResults[0]+1,false)
        let context = new TypeContext(true)
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(identifierResults[0]+1,"whitespaceAndIdentifier")
        DiscardContextBranch(context)

        index += cu.GetWhitespaceAmount(index) + 1

        // error for missing type
        let typeResults = cu.GetIdentifier(index)
        if (typeResults[1].length == 0) { throw new TCError("Expected type following 'RETURNS'",0,initIndex,identifierResults[0]) }

        // error for invalid type
        if (!ValueType[typeResults[1]]) { throw new TCError(`Invalid type '${typeResults[1]}'`,0,index,typeResults[0])}

        return [typeResults[0], new ReturnsHeaderToken([initIndex,typeResults[0]],typeResults[1])]
    }

    //functiosn and processes also use this
    function ParseEventHeader(index: number): [number, EventHeaderToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        
        //make sure its the right header typre
        let identifierResults = cu.GetIdentifier(index)
        if (identifierResults == null || !VALID_LINE_STARTERS.includes(identifierResults[1])) { return null }
        index = identifierResults[0]
        
        
        // if (!(identifierResults[1] == "PLAYER_EVENT" || identifierResults[1] == "ENTITY_EVENT")) { return null }
        
        OfferContext(identifierResults[0]+1,false)
        let context = new EventContext(
              identifierResults[1] == "PLAYER_EVENT" ? "player"
            : identifierResults[1] == "ENTITY_EVENT" ? "entity"
            : identifierResults[1] == "FUNCTION" ? "function"
            : "process"
        )
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(identifierResults[0]+1,"whitespaceAndIdentifier")
        DiscardContextBranch(context)
        
        let nameResults = GetComplexName(index)
        return [nameResults[0], new EventHeaderToken([initIndex,nameResults[0]],identifierResults[1],nameResults[1])]
    }

   

    function ParseParamHeader(index: number): [number, ParamHeaderToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        
        //make sure its the right header typre
        let identifierResults = cu.GetIdentifier(index)
        if (identifierResults == null || identifierResults[1] != "PARAM") { return null }
        
        index = identifierResults[0]
        let context = new ParameterContext()
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(index,"whitespaceAndIdentifier")
        
        //parse name
        let nameResults = GetComplexName(index)
        index = nameResults[0]
        context.name = nameResults[1]
        OfferContext(index)

        //if next character isn't a ':' then finish param parsing now
        if (cu.GetNextCharacters(index,1) != ":") {
            DiscardContextBranch(context)
            return [index, new ParamHeaderToken([initIndex,index],nameResults[1],"any",false,false,null)]
        }

        //move to :
        index += cu.GetWhitespaceAmount(index) + 1
        
        let typeContext = new TypeContext()
        BottomLevelContext = BottomLevelContext.setChild(typeContext)
        OfferContext(index,"whitespaceAndIdentifier")
        
        let modifiersInitIndex = index //used for errors

        let modifiers: Array<string> = []
        let type: string | null = null
        //parse modifiers until either end of line or =
        while (!["\n","="].includes(cu.GetNextCharacters(index,1))) {
            let modInitIndex = index + cu.GetWhitespaceAmount(index) + 1 //used for error messages

            let identifierResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)
            if (identifierResults == null) {
                OfferContext(index,"whitespaceAndIdentifier")
                throw new TCError("Malformed param type",0,index,-1)
            }

            index = identifierResults[0]
            OfferContext(identifierResults[0],"whitespaceAndIdentifier")

            //type has been found
            if (ValueType[identifierResults[1]] || identifierResults[1] == "") {
                type = identifierResults[1]
                break

            //yet another modifier
            } else {
                //error for invalid modifier
                if (!VALID_PARAM_MODIFIERS.includes(identifierResults[1])) {
                    OfferContext(identifierResults[0],false)
                    DiscardContextBranch(context)
                    throw new TCError(`Invalid param modifier: ${identifierResults[1]}`,0,modInitIndex,identifierResults[0])
                }

                //if valid, add it to list of mods
                modifiers.push(identifierResults[1])
            }
        }

        DiscardContextBranch(context)

        if (!type) {
            if (modifiers.length > 0) {
                type = "any"
            } else {
                throw new TCError("Expected type or modifiers following ':'",0,modifiersInitIndex,index)
            }
        }

        //throw error for trying to use modifiers with vars
        if (type == "var") {
            if (modifiers.includes("plural")) {
                throw new TCError("Variable parameters cannot be plural",0,initIndex,cu.GetLineEnd(initIndex)-1)
            } else if (modifiers.includes("optional")) {
                throw new TCError("Variable parameters cannot be optional",0,initIndex,cu.GetLineEnd(initIndex)-1)
            }
        }

        let defaultValue: ExpressionToken | null = null
        //if there is an = after the type
        if (cu.GetNextCharacters(index,1) == "=") {
            //move to =
            index += cu.GetWhitespaceAmount(index) + 1
            let assigneeContext = new AssigneeContext()
            BottomLevelContext = BottomLevelContext.setChild(assigneeContext)
            OfferContext(index,"whitespaceAndIdentifier")
            let equalSignIndex = index //used for errors
            
            //parse default value
            let expressionResults = ParseExpression(index,[";"],false)
            if (expressionResults == null) {
                DiscardContextBranch(assigneeContext)
                throw new TCError("Expected param default value following '='",0,equalSignIndex,equalSignIndex)
            }

            //throw error if param is required
            if (!modifiers.includes("optional")) {
                DiscardContextBranch(assigneeContext)
                throw new TCError("Only optional parameters can have default values",0,index,expressionResults[0])
            }
            //throw error if param is optional, but plural
            if (modifiers.includes("plural")) {
                DiscardContextBranch(assigneeContext)
                throw new TCError("Plural parameters cannot have default values",0,index,expressionResults[0])
            }
            
            index = expressionResults[0]
            defaultValue = expressionResults[1]
            OfferContext(index)
            DiscardContextBranch(assigneeContext)
        }
        
        ReportVariable(new VariableToken([initIndex,index],"line",nameResults[1],type))
        return [index, new ParamHeaderToken([initIndex,index],nameResults[1],type,modifiers.includes("plural"),modifiers.includes("optional"),defaultValue)]
    }

    //= Selections ==\\
   

    function ParseSelectAction(index): [number, SelectActionToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index

        //make sure theres the select or filter keyword
        let keywordResults = cu.GetIdentifier(index)
        if (!(keywordResults[1] == "select" || keywordResults[1] == "filter")) {return null}
        let keyword = keywordResults[1]

        //move to end of select keyword
        index = keywordResults[0]
        let context = new SelectionContext()
        context.type = keywordResults[1]
        BottomLevelContext = BottomLevelContext.setChild(context)
        OfferContext(index,"whitespaceAndIdentifier")

        let actionResults = cu.GetIdentifier(index + cu.GetWhitespaceAmount(index) + 1)
        let action = actionResults[1]
        //error for no action given
        if (action == "") {
            DiscardContextBranch(context)
            throw new TCError("Expected action following 'select'",0,initIndex,index)
        }
        context.action = actionResults[1]

        //get action data
        let actionData = AD.TCActionMap.select_obj![action]!

        //error for invalid action
        if (!actionData || !(keyword == "select" ? CREATE_SELECTION_ACTIONS : FILTER_SELECTION_ACTIONS).includes(actionData.DFId)) {
            DiscardContextBranch(context)
            throw new TCError(`Invalid select action: '${action}'`,0,index + cu.GetWhitespaceAmount(index) + 1, actionResults[0])
        }

        index = actionResults[0]

        //parse condition (if applicable)
        if (action == "PlayersByCondition" || action == "EntitiesByCondition" || action == "ByCondition") {
            let conditionContext = new ConditionContext(true)
            BottomLevelContext = BottomLevelContext.setChild(conditionContext)
            OfferContext(index)

            //parse expression
            let expressionResults = ParseExpression(index,[";"],false,["comparisons","genericTargetComparisons"])
            OfferContext(index,"whitespaceAndIdentifier")
            DiscardContextBranch(conditionContext)
            if (expressionResults == null) { 
                throw new TCError(`Expected condition following 'select ${action}'`,0,initIndex,index)
            }
            index = expressionResults[0]

            return [expressionResults[0], new SelectActionToken([initIndex,expressionResults[0]],actionResults[1],null,null,expressionResults[1])]
        } else {
            //parse arguments
            let argResults: [number, ListToken] | null = ParseList(index, "(", ")", ",")

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
            
            DiscardContextBranch(context)
            return [index, new SelectActionToken([initIndex,index],actionResults[1],args,tags)]
        }
    }


    //======== DEBUG THINGIES ========\\
   

    function ParseDebugPrintVarType(index: number): [number,DebugPrintVarTypeToken] | null {
        index += cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        
        let identifierResults = cu.GetIdentifier(index)
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

    //push current line to line list even if theres no semicolon
    //will NOT move the index
    function PushLineAsIs(){
        //dont push empty lines
        if (CurrentLine.length > 0) {
            Lines.push(CurrentLine)
        }

        CurrentLine = []
        TopLevelContext = new CodelineContext()
        BottomLevelContext = TopLevelContext
    }

    //main logic goes here
    function TokenizationLogic(startLineNumber: number): void {
        let previousLine = Lines[Lines.length - 1]
        if (previousLine == undefined) { previousLine = [] }

        if (mode.mode == "getContext" && cu.GetNextCharacters(CharIndex,1,false) == "\n" && CharIndex + cu.GetWhitespaceAmount(CharIndex) > LineIndexes[startLineNumber + 1]! - 1) {
            //if in context mode, don't parse anything past the code lines on the text line being tested
            Running = false
            return
        }

        //if at the end of a line, push that line and start a new one
        if (cu.GetNextCharacters(CharIndex, 1) == ";" || CharIndex + cu.GetWhitespaceAmount(CharIndex) == SCRIPT_CONTENTS.length - 1 || SCRIPT_CONTENTS[CharIndex] == "#") {
            PushLineAsIs()

            //if this is a line whos entire purpose is to be a comment
            if (SCRIPT_CONTENTS[CharIndex] == "#") {
                //skip to end of comment
                CharIndex = cu.GetLineEnd(CharIndex)
            }

            //if at the end of the file, stop running
            if (CharIndex + cu.GetWhitespaceAmount(CharIndex) >= SCRIPT_CONTENTS.length - 1) {
                Running = false
                return
            }

            //keep skipping blank lines
            while (cu.GetNextCharacters(CharIndex, 1) == "\n" || cu.GetNextCharacters(CharIndex, 1) == ";") {
                CharIndex++

                //if this is just a stray newline before the end of the file, dont bother parsing next line. stop runnign immediately instead
                if (CharIndex + 1 >= SCRIPT_CONTENTS.length) {
                    Running = false
                    return
                }
            }
            
            //if in context mode, don't parse anything past the code lines on the text line being tested
            if (mode.mode == "getContext" && CharIndex + cu.GetWhitespaceAmount(CharIndex) > LineIndexes[startLineNumber + 1]! - 1) {
                Running = false
                return
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
                if (cu.GetNextCharacters(CharIndex,1) == "{") {
                    CharIndex += cu.GetWhitespaceAmount(CharIndex) + 1
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
            TopLevelContext = new CodelineContext()
            BottomLevelContext = TopLevelContext
            OfferContext(CharIndex)

            let results

            //headers
            //top event header e.g. 'PLAYER_EVENT LeftClick'
            if (results == null) { results = ParseEventHeader(CharIndex) }

            //params
            if (results == null) { results = ParseParamHeader(CharIndex) }

            if (results == null) { results = ParseKeywordHeaderToken(CharIndex) }
            
            if (results == null) { results = ParseDescriptionHeaderToken(CharIndex) }
            
            if (results == null) { results = ParseReturnsHeaderToken(CharIndex) }

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

            //try variable
            if (results == null) { results = ParseVariable(CharIndex) }

            //try function/process
            if (results == null) { results = ParseCall(CharIndex) }

            //closing brackets
            if (cu.GetNextCharacters(CharIndex, 1) == "}") {
                //push current line since closing bracket shoudl always be treated as its own line
                PushLineAsIs()
                CharIndex += cu.GetWhitespaceAmount(CharIndex) + 1
                CurrentLine.push(new BracketToken([CharIndex,CharIndex],"close"))
                PushLineAsIs()

                return
            }

            if (results != null) {
                ApplyResults(results)
                return
            }
        }

        //parse opening bracket for if and repeat
        if (CurrentLine[0] instanceof IfToken || CurrentLine[0] instanceof RepeatToken) {
            //parse opening bracket
            if (cu.GetNextCharacters(CharIndex,1) == "{") {
                //push current line since brackets are always treated as their own line
                PushLineAsIs()
                CharIndex += cu.GetWhitespaceAmount(CharIndex) + 1
                CurrentLine.push(new BracketToken([CharIndex,CharIndex],"open"))
                PushLineAsIs()
            } else {
                throw new TCError(`${CurrentLine[0] instanceof IfToken ? "If" : "Repeat"} statement missing opening bracket`, 0, cu.GetLineStart(CharIndex), cu.GetLineEnd(CharIndex))
            }

            return
        }

        //if current line starts with a variable
        if (CurrentLine[0] instanceof VariableToken) {
            //accumulate indexers
            let indexerResults: [number, IndexerToken] | null = null
            do {
                indexerResults = ParseIndexer(CharIndex)
                if (indexerResults) {
                    ApplyResults(indexerResults)
                }
                let typeOverrideResults = ParseTypeOverride(CharIndex)
                if (typeOverrideResults) {
                    ApplyResults(typeOverrideResults)
                }
            } while (indexerResults != null)

            //check for an operator
            let operatorResults = ParseOperator(CharIndex, "assignment")
            if (operatorResults) {
                ApplyResults(operatorResults)

                //get expression assignment
                if (VALID_ASSIGNMENT_OPERATORS.includes(operatorResults[1].Operator)) {
                    let context = new AssigneeContext()
                    BottomLevelContext = BottomLevelContext.setChild(context)
                    
                    let expressionResults = ParseExpression(CharIndex, [";"], false)

                    if (expressionResults) {
                        OfferContext(expressionResults[0])
                        // DiscardContextBranch(context)
                        ApplyResults(expressionResults)
                        return
                    } 
                    else {
                        OfferContext(CharIndex,"whitespaceAndIdentifier")
                        // DiscardContextBranch(context)
                        throw new TCError("Expected expression following assignment",0,CurrentLine[CurrentLine.length-1].CharStart,CurrentLine[CurrentLine.length-1].CharEnd)
                    }
                }
                
                return
            } else {
                throw new TCError(`Expected assignment operator following ${CurrentLine[CurrentLine.length-1] instanceof IndexerToken ? "indexer" : "variable"}`,0,CurrentLine[CurrentLine.length-1].CharStart,CurrentLine[CurrentLine.length-1].CharEnd)
            }
        }

        //fallback error for random symbols
        if (symbols.includes(cu.GetNextCharacters(CharIndex, 1))) {
            throw new TCError(`Unexpected ${cu.GetNextCharacters(CharIndex, 1)}`, 0, CharIndex + cu.GetWhitespaceAmount(CharIndex) + 1, CharIndex + cu.GetWhitespaceAmount(CharIndex) + 1)
        }

        //fallback error for random identifier
        let invalidIdentifierResults = cu.GetIdentifier(CharIndex + cu.GetWhitespaceAmount(CharIndex) + 1,true)
        if (invalidIdentifierResults[1] != "") {
            throw new TCError(`Unexpected '${invalidIdentifierResults[1]}'`, 0, CharIndex + cu.GetWhitespaceAmount(CharIndex) + 1, invalidIdentifierResults[0])
        }


        if (!mode.fromLanguageServer) {
            process.stderr.write("Current line:" + CurrentLine)
            process.stderr.write("Current indx:" + CharIndex)
        }
        throw new TCError("Something's definitely wrong here (fallback error)", 0, CharIndex, CharIndex)
    }

    if (mode.mode == "getTokens") {
        while (Running) {
            TokenizationLogic(0)
        }
    
        let results = new TokenizerResults()
        results.Lines = Lines
    
        return results
    }
    else if (mode.mode == "getHeaders") {
        while (Running) {
            let failed = false
            try {
                TokenizationLogic(0)
            } catch {
                failed = true
                Running = false
            }
            if (!failed && Lines.length > 0 && Lines[Lines.length - 1].length > 0 && !(Lines[Lines.length - 1]?.[0] instanceof HeaderToken)) {
                Running = false
                Lines.pop()
            }
        }
    
        let results = new TokenizerResults()
        results.Lines = Lines
    
        return results
    }
    else if (mode.mode == "getContext") {
        let currentLineNumber = mode.startFromLine == null ? 0 : mode.startFromLine
        let currentContext: CodeContext | undefined
        let firstControlTokenFound = false
        
        CurrentlyGrabbingContexts = true

        // kill me now
        while (currentLineNumber > -1) {
            CharIndex = mode.startFromLine == null ? -1 : LineIndexes[currentLineNumber]!
            Lines = []
            CurrentLine = []
            TopLevelContext = new CodelineContext()
            BottomLevelContext = TopLevelContext
            Running = true   
            
            while (Running) {
                try {
                    try { TokenizationLogic(currentLineNumber) }
                    catch (e) {
                        if (e instanceof TCError) {
                            TopLevelContext = new CodelineContext()
                            BottomLevelContext = TopLevelContext
                            ParseExpression(CharIndex,["\n","#"],true,["lineTolerance","selectionActions"])
                        }
                        throw e
                    }
                } catch (e) {
                    if (e instanceof CodeContext) {
                        currentContext = e
                    }
                    Running = false
                }
            }

            //i'm pretty sure that if more than one control token (if,repeat,while,etc.) is passed then 
            //its impossible for any above code to affect the context of the test pos
            if (
                Lines[0] && (
                (Lines[0][0] instanceof RepeatToken || Lines[0][0] instanceof IfToken || Lines[0][0] instanceof ElseToken)
                || (Lines[0][0] instanceof VariableToken && Lines[0][1] instanceof OperatorToken)
                )
            ) {
                break
                if (!firstControlTokenFound) {
                    firstControlTokenFound = true
                } else {
                    break
                }
            }

            currentLineNumber -= 1
        }
        if (!currentContext) {
            return BottomLevelContext
        }
        return currentContext
    }
    else if (mode.mode == "getVariables") {
        //key: line number, value: array of all variables on that line
        let lineVariableInfo: Dict<VariableToken[]> = {}
        let currentLineNumber = mode.startFromLine == null ? 0 : mode.startFromLine

        ReportVariable = function(variable: VariableToken) {
            if (variable.CharStart > LineIndexes[currentLineNumber] && variable.CharEnd < LineIndexes[currentLineNumber+1]) {
                lineVariableInfo[currentLineNumber]?.push(variable)
            }
        }

        // if you are killing me now, please continue to do so
        while (currentLineNumber > -1 && currentLineNumber >= (mode.goUntilLine || -1)) {
            CharIndex = mode.startFromLine == null ? -1 : LineIndexes[currentLineNumber]!
            Lines = []
            CurrentLine = []
            TopLevelContext = new CodelineContext()
            BottomLevelContext = TopLevelContext
            Running = true
            
            lineVariableInfo[currentLineNumber] = []
            while (Running) {
                try {
                    TokenizationLogic(currentLineNumber)
                    if (CharIndex > LineIndexes[mode.startFromLine! + 1]) { 
                        Running = false 
                    }
                } catch (e) {
                    if (e instanceof TCError) {
                        ParseExpression(CharIndex,["\n","#"],true,["lineTolerance"],{stopAtEndOfLine: currentLineNumber})
                    }
                    Running = false
                }
            }

            currentLineNumber -= 1
        }

        return lineVariableInfo
    }
}