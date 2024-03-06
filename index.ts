//DISCLAIMER!!!!!!! i literally have no clue how to write a programming lanague and am
//totally just winging it so i take no responsibility for any psycological damage that
//may result from smart peoiple looking at my goofy ass code

export { }
const FILE_PATH = "testscripts/variables.tc"

const SCRIPT_CONTENTS = await Bun.file(FILE_PATH).text()

//Current index in the file that the parser is looking at
var CharIndex = 0
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

//Gets word until a special character is encountered
//SPACE COUNTS AS A SPECIAL CHARACTER!!!!
//returns: the word, the index of the final character in the word
function GetIdentifier(): [string, number] {
    let currentPosition = CharIndex
    let word = "";

    while (currentPosition < SCRIPT_CONTENTS.length) {
        let thisCharacter = SCRIPT_CONTENTS[currentPosition]

        if (IsCharacterValidIdentifier(thisCharacter)) {
            word += thisCharacter
        } else {
            break
        }

        currentPosition++
    }

    return [word, currentPosition - 1]
}

//Get next amount of characters from CharIndex, with option to ignore whitespaces
function GetNextCharacters(charAmount: number, dontIncludeWhitespace: boolean = true) {
    let index = CharIndex
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

class Parser {
    constructor() { }

    ParentParser: Parser

    //If returnResults is null, this Parser is being activated after first being entered
    //Otherwise, its being activated after returning from a subParser
    Activate(): [number, ...any] | null { 
        return null
    }
}

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

class VariableParser extends Parser {
    static ValidScopes = {
        "global": "game",
        "saved": "save",
        "local": "local",
        "line:": "line"
    }

    Activate(): [number, VariableToken] | null {
        let [scopeKeyword, scopeKeywordEnd] = GetIdentifier()

        //if keyword is a var scope
        let scope = VariableParser.ValidScopes[scopeKeyword]
        if (scope == null) {return null}

        //if theres a space after the keyword, use identifier as name
        if (SCRIPT_CONTENTS[scopeKeywordEnd + 1] == " ") {
            //move 2 characters (to the start of the name)
            CharIndex = scopeKeywordEnd + 2

            //get name of variable
            let [variableName, variableNameEnd] = GetIdentifier()

            return [variableNameEnd, new VariableToken(scopeKeyword, variableName)]
        }

        return null
    }
}
//= String =\\

class StringToken extends Token {
    constructor(value: string) {
        super()
        this.Value = value
    }

    Value: string
}

//= Operators =\\
class OperatorToken extends Token {
    constructor(operator: string) {
        super()
        this.Operator = operator
    }
    
    Operator: string
}

class OperatorParser extends Parser {
    Activate(): [number, OperatorToken] | null {
        let operatorString = GetNextCharacters(1)
        if (operatorString == "=") {
            return [CharIndex + 1, new OperatorToken("=")]
        }

        return null
    }
}

//= Expressions =\\
class ExpressionToken extends Token {
    Expression: [ExprOperatorToken | StringToken]
}

class ExpressionParser extends Parser {
    constructor(terminateAt: string = "\n") {
        super()
        this.TerminateAt = terminateAt
    }

    TerminateAt: string

    private parseNext() {
        //next part is a string
        if (GetNextCharacters(1) == '"') {
            print("strin found")
            Running = false
        }
        CharIndex++
    }

    Activate(): [number, ExpressionToken] | null {
        while (GetNextCharacters(1) != "" && GetNextCharacters(1) != this.TerminateAt) {
            this.parseNext()
        }

        return null
    }
}
//main logic goes here
function DoTheThing(): void {
    // if current line is empty
    if (CurrentLine.length == 0) {
        //check for a variable
        let variableResults = new VariableParser().Activate()
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
            let operatorResults = new OperatorParser().Activate()
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
                let expressionResults = new ExpressionParser().Activate()
                if (expressionResults) {
                    ApplyResults(expressionResults)
                }

                Running = false
            }
        }
    }
}

//==========[ other code ]=========\\

while (Running) {
    DoTheThing()
}

print(CurrentLine)