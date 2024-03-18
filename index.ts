//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code


//TODO: add \n -> newline to string parsing
import { Domain, DomainList, TargetDomain } from "./domains"
import { PrintError, TCError } from "./errorHandler"
import {IsCharacterValidIdentifier, IsCharacterValidNumber, GetIdentifier, GetNextCharacters, GetLineFromIndex, GetLineStart, GetLineEnd, GetWhitespaceAmount, GetCharactersUntil} from "./characterUtils"

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
function print(...data: any[]) {
    console.log(...data)
}




//returned number will be index of closing char
//ERR1 = string was not closed
function GetString(index: number,openingChar:string, closingChar: string = openingChar): [number, string] | null {
    let initIndex = index

    //if not a string, return
    if (GetNextCharacters(index,1) != openingChar) {return null}

    //move to start of string contents (after opening "")
    index += 1 + GetWhitespaceAmount(index)

    let string = ""
    while (index < SCRIPT_CONTENTS.length-1) {
        let nextChunk = GetCharactersUntil(index+1,["\n","\\",closingChar])[1]
        string += nextChunk
        index += nextChunk.length

        //if chunk stopp due to a backslash
        if (SCRIPT_CONTENTS[index+1] == "\\") {
            //add char after backslash into the value without parsing it
            string += SCRIPT_CONTENTS[index+2] //WARNING: some funny shit will probably happen if a line ends with a string that ends with a backslash and no closing char | "awesome string\
            index += 2
        }
        //if chunk stopped due to closing char
        else if (SCRIPT_CONTENTS[index+1] == closingChar) {
            return [index+1,string]
        }
        //if chunk stopped due to newline
        else if (SCRIPT_CONTENTS[index+1] == "\n") {
            throw new TCError("String was never closed",1,initIndex+GetWhitespaceAmount(initIndex)+1,index)
        }
    }
    throw new TCError("String was never closed",1,initIndex+GetWhitespaceAmount(initIndex)+1,index)
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
    let initIndex = index
    
    let keywordResults = GetIdentifier(index)
    if (keywordResults == null) { return null }

    let scopeKeyword = keywordResults[1]

    //if keyword is a var scope
    let scope = VALID_VAR_SCCOPES[scopeKeyword]
    if (scope == null) {return null}

    //move into position to parse variable name
    index = keywordResults[0]

    let complexNameResults

    try {
        complexNameResults = GetString(index,"[","]")
    }
    catch (e) {
        if (e.Code == 1) {
            throw new TCError("Variable name was never closed",1,e.CharStart,e.CharLoc)
        }
    }
    //if theres a [, use the inside of the [] as name
    if (complexNameResults) {
        return [complexNameResults[0],new VariableToken(scopeKeyword, complexNameResults[1])]
    }
    //otherwise, use identifier as name
    else {
        index += GetWhitespaceAmount(index)
        index++ //GetIdentifier's starts first character of identifier so move 1 char to that

        //get name of variable
        let variableNameResults = GetIdentifier(index)
        if (variableNameResults == null) { return null }

        return [variableNameResults[0], new VariableToken(scopeKeyword, variableNameResults[1])]
    }
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
function ParseString(index: number,openingChar:string, closingChar: string = openingChar): [number, StringToken] | null {
    let results
    results = GetString(index,openingChar,closingChar)
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
//returned number will be index of final character of the number
function ParseNumber(index: number): [number, NumberToken] | null {
    let initIndex = index
    
    //if not a number, return null
    if (!IsCharacterValidNumber(GetNextCharacters(index,1))) { return null }

    let decimalFound = false
    let string = ""

    index += 1 + GetWhitespaceAmount(index)

    while (index < SCRIPT_CONTENTS.length) {
        //if this char is a .
        if (SCRIPT_CONTENTS[index] == ".") {
            //if there has already been a . throw error
            if (decimalFound) {
                throw new Error("you cant have 2 decimals in one number")
            }

            string += "."

            decimalFound = true
        }
        //if this char is a digit
        else if (IsCharacterValidNumber(SCRIPT_CONTENTS[index])){
            //dont include any leading 0s
            if (string.length == 0 && SCRIPT_CONTENTS[index] == "0") { continue }

            string += SCRIPT_CONTENTS[index]
        }
        //if character is some other thing that shouldnt be allowed in numbers
        else if (IsCharacterValidIdentifier(SCRIPT_CONTENTS[index])){
            throw new TCError(`'${SCRIPT_CONTENTS[index]}' is not a valid character in a number`,1,index,index)
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

    return [index-1, new NumberToken(string)]
}

//= Operators =\\
const ValidAssignmentOperators = ["=","+=","-=","*=","/="]
const ValidMathOperators = ["+","-","*","/","^"]

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

//= Accessor & Caller =\\
class CallerToken extends Token {
    Token = "Caller"
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
function ParseList(index,openingChar: string, closingChar: string, seperatingChar: string): [number,ListToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    if (GetNextCharacters(index, 1) != openingChar) {return null}
    
    //move to opening char
    index += GetWhitespaceAmount(index) + 1

    let items: Array<ExpressionToken> = []

    while (SCRIPT_CONTENTS[index] != closingChar) {
        let expressionResults
        try {
            expressionResults = ParseExpression(index,[seperatingChar,closingChar],false)
        } catch (e) {
            if (e.message == "Expression was never closed") {
                throw new TCError("List was never closed",1,initIndex+1,GetLineEnd(index)-1)
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

//= Action =\\
class ActionToken extends Token {
    constructor(domain: string, action: string, params: ListToken | null = null) {
        super()
        this.DomainId = domain
        this.Action = action
        this.Params = params
    }

    Params: ListToken | null
    Tags: ListToken | null
    DomainId: string
    Action: string
}

//ERR1 = missing function
//ERR2 = invalid function
function ParseAction(index: number): [number, ActionToken] | null {
    index += GetWhitespaceAmount(index)
    let initIndex = index

    //= parse domain =\\
    let domainResults = GetIdentifier(index + 1)
    if (domainResults == null) {return null}
    
    let domain = DomainList[domainResults[1]]
    if (!domain) {return null}

    //move to end of domain
    index = domainResults[0]

    //= only progress if calling an action =\\
    if (GetNextCharacters(index,1) != ":") {return null}

    //move to the ':'
    index += 1 + GetWhitespaceAmount(index)

    //= parse action =\\
    let actionResults = GetIdentifier(index + GetWhitespaceAmount(index) + 1)
    //error for missing action
    if (actionResults == null || actionResults[1] == "") {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Expected name for ${domain.ActionType} action`,1,initIndex+1,index)
        }
        else {
            throw new TCError(`Expected function name`,1,initIndex+1,index)
        }
    }

    //error for invalid action
    if (domain.Actions[actionResults[1]] == undefined) {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Invalid ${domain.ActionType} action: '${actionResults[1]}'`,2,index+GetWhitespaceAmount(index)+1,actionResults[0])
        }
        else {
            throw new TCError(`'${domain.Identifier} does not contain function '${actionResults[1]}'`,2,index+GetWhitespaceAmount(index)+1,actionResults[0])
        }
    }

    //move to the end of the action name
    index = actionResults[0]

    let paramResults = ParseList(index,"(",")",",")
    let params: ListToken | null = null
    if (paramResults) {
        index = paramResults[0]
        params = paramResults[1]
    }

    return [index, new ActionToken(domain.Identifier,actionResults[1],params)]
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

const ValidTargets = ["default","defaultEntity","selection","selectionEntity","killer","killerEntity","damager","damagerEntity","victim","victimEntity","shooter","shooterEntity","lastEntity","projectile"]

function ParseTarget(index: number): [number, TargetToken] | null {
    index += GetWhitespaceAmount(index) + 1
    
    let targetResults = GetIdentifier(index)
    if (targetResults == null) { return null }

    if (ValidTargets.includes(targetResults[1])) {
        return [targetResults[0], new TargetToken(targetResults[1])]
    }

    return null
}

//returned number is final character in the operator
function ParseOperator(index: number,operatorType: "assignment" | "math"): [number, OperatorToken] | null {
    index += GetWhitespaceAmount(index)

    let validOperators
    let lengthList
    switch(operatorType) {
        case "assignment": 
            validOperators = ValidAssignmentOperators
            lengthList = AssignmentOperatorsLengths
            break
        case "math": 
            validOperators = ValidMathOperators
            lengthList = MathOperatorsLengths
            break
    }

    //try every possible length of operator
    for (const length of lengthList) {
        let operatorString = GetNextCharacters(index,length)

        if (validOperators.includes(operatorString)) {
            return [index + length, new OperatorToken(operatorString)]
        }
    }

    return null
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
function ParseExpression(index: number,terminateAt: Array<string | null> = ["\n"], endIndexAtTerminator: boolean = true): [number, ExpressionToken] | null {
    //if it should terminate at a newline, also terminate at eof
    if (terminateAt.includes("\n")) {
        if (!terminateAt.includes(null)) {terminateAt.push(null)}
        if (!terminateAt.includes("")) {terminateAt.push("")}
    }
    
    let expressionSymbols: Array<any> = []

    let initIndex = index
    index += GetWhitespaceAmount(index)

    while (!terminateAt.includes(GetNextCharacters(index,1))) {
        let valueInitIndex = index

        //= ERROR: expression isnt closed
        if (GetNextCharacters(index,1) == "\n" || (GetNextCharacters(index,1) == "" && !terminateAt.includes("\n")) ) {
            throw new TCError("Expression was never closed",1,initIndex,index)
        }

        let results: [number, Token] | null = null
        // parse next token!!
        
        //if previous token is an operator or this is the first token in the expression, parse for value
        if (expressionSymbols[expressionSymbols.length-1] instanceof OperatorToken || expressionSymbols.length == 0) {
            //try nested expression
            if (GetNextCharacters(index,1) == "(") {
                results = ParseExpression(index + GetWhitespaceAmount(index) + 1,[")"])
            }

            //try string
            if (results == null) { results = ParseString(index,"\"") }

            //try number
            if (results == null) { results = ParseNumber(index) }

            //try variable
            if (results == null) { results = ParseVariable(index) }

            if (results == null) { 
                //= ERROR: operator was given instead of expr
                let operatorResults = ParseOperator(index,"math") 
                if (operatorResults != null) {
                    if (expressionSymbols.length == 0) {
                        throw new TCError("Expressions can't start with operators",4,initIndex + GetWhitespaceAmount(initIndex) + 1,initIndex + GetWhitespaceAmount(initIndex) + 1)
                    } else {
                        throw new TCError("Expected value or expression following operator", 5, index + GetWhitespaceAmount(index) + 1, index + GetWhitespaceAmount(index) + 1)
                    }
                }

                let identifierResults = GetIdentifier(index+GetWhitespaceAmount(index)+1)!
                if (identifierResults[1] == "") {
                    throw new TCError(`Invalid character: '${GetNextCharacters(index,1)}'`,2,valueInitIndex + GetWhitespaceAmount(index) + 1,valueInitIndex + GetWhitespaceAmount(index) + 1)
                }
                else {
                    throw new TCError(`Invalid value: '${GetIdentifier(index+GetWhitespaceAmount(index)+1)![1]}'`,2,valueInitIndex + GetWhitespaceAmount(index) + 1,identifierResults[0])
                }
            }
        }
        //otherwise, parse for operator 
        else {
            results = ParseOperator(index,"math")

            //= ERROR: invalid operator
            if (results == null) {
                let identifierResults = GetCharactersUntil(index+GetWhitespaceAmount(index)+1,[" ","\n"])
                throw new TCError(`Expected operator, got '${identifierResults[1]}'`,3,index+GetWhitespaceAmount(index)+1,identifierResults[0])
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

    //= ERROR: throw err if expression ends with operator
    if (expressionSymbols[expressionSymbols.length - 1] instanceof OperatorToken) {
        throw new TCError("Expression cannot end on an operator",1,index,index)
    }

    //if this expression has a terminator, move index to that terminate if told to
    if (terminateAt.includes(GetNextCharacters(index,1)) && endIndexAtTerminator) {
        //dont move if expression ended because of eof
        if (GetNextCharacters(index,1) != "") {
            index += 1 + GetWhitespaceAmount(index)
        }
    }

    if (expressionSymbols.length > 0) {
        return [index, new ExpressionToken(expressionSymbols)]
    }

    return null
}

//main logic goes here
function DoTheThing(): void {
    //if at the end of a line, push that line and start a new one
    if (GetNextCharacters(CharIndex,1) == "\n" || CharIndex + GetWhitespaceAmount(CharIndex) == SCRIPT_CONTENTS.length-1) {
        Lines.push(CurrentLine)
        CurrentLine = []

        //if at the end of the file, stop running
        if (CharIndex + GetWhitespaceAmount(CharIndex) == SCRIPT_CONTENTS.length-1) {
            Running = false
            return
        }

        //keep skipping blank lines
        while (GetNextCharacters(CharIndex,1) == "\n") {
            CharIndex++

            //if this is just a stray newline before the end of the file, dont bother parsing next line. stop runnign immediately instead
            if (CharIndex + 1 >= SCRIPT_CONTENTS.length) {
                Running = false
                return
            }
        }
    }

    // if current line is empty
    if (CurrentLine.length == 0) {
        let results

        //try action
        if (results == null) { results = ParseAction(CharIndex)}

        //try target
        if (results == null) { results = ParseTarget(CharIndex) }
        
        //try variable
        if (results == null) { results = ParseVariable(CharIndex) }

        //error
        if (results == null) {
            let result = GetCharactersUntil(CharIndex+1,[" ","\n"])
            throw new TCError(`Unexpected '${result[1]}'`,0,CharIndex+1,result[0])
        }

        ApplyResults(results)
        return
    }

    //if current line starts with a variable
    if (CurrentLine[0] instanceof VariableToken) {
        //if the only thing in the line is a variable
        if (CurrentLine.length == 1) {
            //check for an operator
            let operatorResults = ParseOperator(CharIndex,"assignment")
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
                let expressionResults = ParseExpression(CharIndex,["\n"])
                if (expressionResults) {
                    ApplyResults(expressionResults)
                    return
                }
            }
        }
    }

    throw new TCError("Something's definitely wrong here (fallback error)",0,CharIndex,-1)
    print("Current line:",CurrentLine)
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
    print(JSON.stringify(Lines,null,"  "))
}