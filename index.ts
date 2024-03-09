//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage thats
//may result from smart peoiple looking at my goofy ass code
export { }
const FILE_PATH = "testscripts/variables.tc"

const SCRIPT_CONTENTS = await Bun.file(FILE_PATH).text()

//Current index in the file that the parser is looking at
var CharIndex = -1
var Running = true

var Lines: Array<[Token]> = []
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
//SPACE COUNTS AS A SPECIAL CHARACTER!!!!
//returns: the word, the index of the final character in the word
function GetIdentifier(index): [string, number] {
    let word = "";

    while (index < SCRIPT_CONTENTS.length) {
        index++

        if (IsCharacterValidIdentifier(SCRIPT_CONTENTS[index])) {
            word += SCRIPT_CONTENTS[index]
        } else {
            break
        }
    }

    return [word, index - 1]
}

//Get next amount of characters from CharIndex, with option to ignore whitespaces
function GetNextCharacters(index: number,charAmount: number, dontIncludeWhitespace: boolean = true) {
    let string = ""

    while (charAmount > 0) {
        index++
        let char = SCRIPT_CONTENTS[index]
        //if at the end of the script
        if (char == undefined) {break}

        if (
            !(char == " ") &&
            !(char == "\t")
        ) {
            string += char
            charAmount -= 1
        }
    }

    return string
}

//returns the number of whitespace characters from CharIndex
function GetWhitespaceAmount(index: number): number {
    let count = 0

    while (index < SCRIPT_CONTENTS.length) {
        index++
        if (
            (SCRIPT_CONTENTS[index] == "\n") ||
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
    let [scopeKeyword, scopeKeywordEnd] = GetIdentifier(index)

    //if keyword is a var scope
    let scope = VALID_VAR_SCCOPES[scopeKeyword]
    if (scope == null) {return null}
    index += scopeKeyword.length
    index += GetWhitespaceAmount(index)
    
    //if theres a [, use the inside of the [] as name
    if (GetNextCharacters(index,1) == "[") {
    }
    //otherwise, use identifier as name
    else {
        //get name of variable
        let [variableName, variableNameEnd] = GetIdentifier(index)

        return [variableNameEnd, new VariableToken(scopeKeyword, variableName)]
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

//returned number will be index of closing char
function ParseString(index: number,openingChar:string, closingChar: string = openingChar): [number, StringToken] | null {
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
            return [index+1,new StringToken(string)]
        }
        //if chunk stopped due to newline
        else if (SCRIPT_CONTENTS[index+1] == "\n") {
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

    index += GetWhitespaceAmount(index)

    while (index < SCRIPT_CONTENTS.length-1) {
        index++

        //if this char is a .
        if (SCRIPT_CONTENTS[index] == ".") {
            //if there has already been a . throw error
            if (decimalFound) {
                throw new Error("you cant have 2 decimals in one number")
            }

            //if this is the first character in the number, add in the leading 0
            if (string == "") { string += "0" }

            string += "."

            decimalFound = true
        }
        //if this char is a digit
        else if (IsCharacterValidNumber(SCRIPT_CONTENTS[index])){
            //dont include any leading 0s
            //0<x<1 wont be missing its starting 0 since decimal parsing will add its own 0 at the start
            if (string.length == 0 && SCRIPT_CONTENTS[index] == "0") { continue }

            string += SCRIPT_CONTENTS[index]
        }
        //if this character is the end of the number
        else {
            break
        }
    }

    return [index-1, new NumberToken(string)]
}

//= Operators =\\
class OperatorToken extends Token {
    constructor(operator: string) {
        super()
        this.Operator = operator
    }
    
    Operator: string
}

function ParseOperator(index: number): [number, OperatorToken] | null {
    let operatorString = GetNextCharacters(index,1)

    if (operatorString == "=") {
        return [index + 1, new OperatorToken("=")]
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

function ParseExpression(terminateAt: string = "\n"): [number, ExpressionToken] | null {
    let expressionSymbols: Array<any> = []
    let index = CharIndex

    while (GetNextCharacters(index,1) != "" && GetNextCharacters(index,1) != terminateAt) {
        index++
        let results: [number, Token] | null
        // parse next token!!
        
        //if previous token is an operator or this is the first token in the expression
        if (expressionSymbols.length == 0) {

        }

        //try string
        results = ParseString(index,"\"")

        //try number
        if (results == null) { results = ParseNumber(index) }


        if (results) {
            expressionSymbols.push(results[1])
            index = results[0]
            continue
        }
    }

    if (expressionSymbols.length > 0) {
        return [index, new ExpressionToken(expressionSymbols)]
    }
    return null
}
//main logic goes here
function DoTheThing(): void {
    // if current line is empty
    if (CurrentLine.length == 0) {
        //check for a variable
        let variableResults = ParseVariable(CharIndex)
        if (variableResults) {
            ApplyResults(variableResults)
            return
        }
    }

    //if current line starts with a variable
    if (CurrentLine[0] instanceof VariableToken) {
        //if the only thing in the line is a variable
        if (CurrentLine.length == 1) {
            //check for an operator
            let operatorResults = ParseOperator(CharIndex)
            if (operatorResults) {
                ApplyResults(operatorResults)
            }
        }
        //if line is <variable> <operator>
        if (CurrentLine[1] instanceof OperatorToken) {
            let operation = CurrentLine[1].Operator
            //<variable> =
            //must be followed by an expression
            if (operation == "=") {
                //parse expression
                let expressionResults = ParseExpression("\n")
                if (expressionResults) {
                    ApplyResults(expressionResults)
                }

                Running = false
            }
        }
    }

    Running = false
}

//==========[ other code ]=========\\

while (Running) {
    DoTheThing()
}

print(JSON.stringify(CurrentLine,null,"  "))