//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code
import { Domain, DomainList, TargetDomain } from "./domains"

export { }
const FILE_PATH = "testscripts/variables.tc"

const SCRIPT_CONTENTS = await Bun.file(FILE_PATH).text()

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
function GetIdentifier(index): [number, string] | null {
    if (SCRIPT_CONTENTS[index] == undefined) {return null}
    let word = "";

    //dont let identifiers start with numbers
    let firstCharacterCode = SCRIPT_CONTENTS[index].charCodeAt(0)
    if (firstCharacterCode > 47 && firstCharacterCode < 58) {
        return null
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

//Get next amount of characters from CharIndex, with option to ignore whitespaces
function GetNextCharacters(index: number,charAmount: number, newlinesAreWhitespace: boolean = false) {
    let string = ""

    while (charAmount > 0) {
        index++
        let char = SCRIPT_CONTENTS[index]
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

//returns the number of whitespace characters from CharIndex
function GetWhitespaceAmount(index: number,newlinesAreWhitespace = false): number {
    let count = 0

    while (index < SCRIPT_CONTENTS.length) {
        index++
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
function GetCharactersUntil(index: number,terminateAt: Array<string>) {
    let string = ""
    
    while (index < SCRIPT_CONTENTS.length-1) {
        index++
        if (terminateAt.includes(SCRIPT_CONTENTS[index])) {
            return string
        }
        string += SCRIPT_CONTENTS[index]
    }

    return string
}

//returned number will be index of closing char
function GetString(index: number,openingChar:string, closingChar: string = openingChar): [number, string] | null {
    //if not a string, return
    if (GetNextCharacters(index,1) != openingChar) {return null}

    //move to start of string contents (after opening "")
    index += 1 + GetWhitespaceAmount(index)

    let string = ""
    while (index < SCRIPT_CONTENTS.length) {
        let nextChunk = GetCharactersUntil(index,["\n","\\",closingChar])
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
            throw new Error("String was never closed")
        }
    }

    throw new Error("String was never closed")
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
    "line:": "line"
}

//returned number will be closing ] or final character of identifier
function ParseVariable(index): [number, VariableToken] | null {
    index += GetWhitespaceAmount(index) + 1
    
    let keywordResults = GetIdentifier(index)
    if (keywordResults == null) { return null }

    let scopeKeyword = keywordResults[1]

    //if keyword is a var scope
    let scope = VALID_VAR_SCCOPES[scopeKeyword]
    if (scope == null) {return null}

    //move into position to parse variable name
    index = keywordResults[0]

    
    let complexNameResults = GetString(index,"[","]")
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

    throw new Error("it appears you have fucked up a variable")
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
    try {
        results = GetString(index,openingChar,closingChar)
        if (results) {
            return [results[0], new StringToken(results[1])]
        }
    } catch (e) {
        if (e == "String was never closed") {
            throw new Error("String was never closed")
        }
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

//returned number will be index of final character of the number
function ParseNumber(index: number): [number, NumberToken] | null {
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

function ParseList(index,openingChar: string, closingChar: string, seperatingChar: string): [number,ListToken] | null {
    index += GetWhitespaceAmount(index)

    if (GetNextCharacters(index, 1) != openingChar) {return null}
    
    //move to opening char
    index += GetWhitespaceAmount(index) + 1

    let items: Array<ExpressionToken> = []

    while (SCRIPT_CONTENTS[index] != closingChar) {
        let expressionResults = ParseExpression(index,[seperatingChar,closingChar],false)
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

// function ParseList(index,openingChar: string, closingChar: string, seperator: string): [number,ListToken] | null {
//     index += GetWhitespaceAmount(index)

//     let items: Array<ExpressionToken> = []
    
//     if (GetNextCharacters(index, 1) != openingChar) {return null}
//     //move to opening char
//     index += GetWhitespaceAmount(index) + 1

//     while (SCRIPT_CONTENTS[index] != closingChar) {
//         //parse expression
//         let expressionResults = ParseExpression(index,[closingChar,","])

//         //apply expression
//         if (expressionResults != null) {
//             print(expressionResults[0])
            
//             index = expressionResults[0]+ GetWhitespaceAmount(index)
//             if (SCRIPT_CONTENTS[expressionResults[0]] == "," || SCRIPT_CONTENTS[expressionResults[0]] == closingChar) { 
//                 index -= 1
//             }
//             items.push(expressionResults[1])
//         }
//         if (GetNextCharacters(index,1) == ",") {
//             index += GetWhitespaceAmount(index) + 1
//         }
//         //im not entirely sure why, but without this check the list will fail to close if theres whitespace between final expr and closing char
//         else if (GetNextCharacters(index,1) == closingChar && GetWhitespaceAmount(index) > 0) {
//             index++
//             print("e",index)
//         }
//     }
    
//     return [index,new ListToken(items)]
// }

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

function ParseAction(index: number): [number, ActionToken] | null {
    index += GetWhitespaceAmount(index)

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
    if (actionResults == null) {
        if (domain instanceof TargetDomain) {throw Error(`Expected name for ${domain.ActionType} action`)}
        else {throw Error(`Expected function name`)}
    }

    //error for invalid action
    if (domain.Actions[actionResults[1]] == undefined) {
        if (domain instanceof TargetDomain) {throw Error(`Invalid ${domain.ActionType} action: '${actionResults[1]}'`)}
        else {throw Error(`'${domain.Identifier} does not contain function '${actionResults[1]}'`)}
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

    // let actionResults = GetIdentifier(CharIndex + GetWhitespaceAmount(CharIndex) + 1)
    // if (actionResults) {
    //     let actionType = GetTargetActionType(CurrentLine[0])
    //     let validActions = (
    //         actionType == "player" ? ValidPlayerActions :
    //             actionType == "entity"
    //     )

    //     if (!validActions[actionResults[1]]) {
    //         throw new Error(`Invalid ${actionType} action: '${actionResults[1]}'`)
    //     }

    //     ApplyResults([actionResults[0], new IdentifierToken(actionResults[1])])
    //     return
    // }

    // throw new Error(`Missing action name following '${CurrentLine[0].Target}:'`)
    return null
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

function ParseExpression(index: number,terminateAt: Array<string> = ["\n"], endIndexAtTerminator: boolean = true): [number, ExpressionToken] | null {
    let expressionSymbols: Array<any> = []

    index += GetWhitespaceAmount(index)

    while (GetNextCharacters(index,1) != "" && !terminateAt.includes(GetNextCharacters(index,1))) {
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
        } 
        //otherwise, parse for operator 
        else {
            results = ParseOperator(index,"math")
        }


        if (results) {
            expressionSymbols.push(results[1])
            index = results[0]
            continue
        } else {
            throw new Error("y'all, that expression dont look right")
        }
    }

    if (terminateAt.includes(GetNextCharacters(index,1)) && endIndexAtTerminator) {
        index++
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

        if (results != null) {
            ApplyResults(results)
            return
        }
    }

    // //if line starts with target
    // if (CurrentLine[0] instanceof TargetToken) {
    //     //action is being happened
    //     if (CurrentLine[1] instanceof CallerToken) {
            
    //     }

    //     //try caller (:)
    //     if (GetNextCharacters(CharIndex,1) == ":") {
    //         CurrentLine.push(new CallerToken)
    //         CharIndex += GetWhitespaceAmount(CharIndex) + 1

    //         return
    //     }
    // }

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

    Running = false
}

//==========[ other code ]=========\\

while (Running) {
    DoTheThing()
}

print(JSON.stringify(Lines,null,"  "))