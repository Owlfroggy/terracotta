import { CharUtils } from "./characterUtils"
import { print } from "../main"

enum TextCodeType {
    "math" = "math",
    "random" = "random",
    "round" = "round",
    "index" = "index",
    "entry" = "entry",
    "var" = "var",
}

const ValidOperators = ["+","-","*","/","%"]

//= tokens =\\
export class Token {
    constructor(meta) {
        this.CharStart = meta[0]
        this.CharEnd == meta[1]
    }

    CharStart: number
    CharEnd: number

    Compile(): string { 
        return ""
    }
}

export class NumberToken extends Token {
    constructor(meta,value: string) {
        super(meta)
        this.Value = value
    }

    Value: string

    Compile(): string {
        return this.Value
    }
}

export class OperatorToken extends Token {
    constructor(meta, operator: string) {
        super(meta)
        this.Operator = operator
    }

    Operator: string

    Compile(): string {
        return this.Operator
    }
}

export class VariableToken extends Token {
    constructor(meta, name: string) {
        super(meta)
        this.Name = name
    }
    Name: string

    Compile(): string {
        return `%var(${this.Name})`
    }
}

export class TextCodeToken extends Token {
    constructor(meta, type: TextCodeType) {
        super(meta)
        this.Type = type
    }
    Type: TextCodeType
}

export class MathTextCodeToken extends TextCodeToken {
    constructor(meta, expression: Token[]) {
        super(meta,TextCodeType.math)
        this.Expression = expression
    }

    Expression: Token[]

    //finds the first instance of a given variable in the expression and returns its index
    //returns null if the variable is not in the expression
    //does not search nested expressions!!!!
    FindVariable(varName: string): number | null {
        let i = -1
        for (const token of this.Expression) {
            i++
            if (token instanceof VariableToken) {
                if (token.Name == varName) {
                    return i
                }
            }
        }

        return null
    }

    //if the entire %math expression just consists of one operator, return that operator
    //otherwise return false
    GetIsSingleOperator(): string | false {
        let operator: string | false = false

        for (const token of this.Expression) {
            if (token instanceof OperatorToken) {
                if (operator == false) {
                    operator = token.Operator
                } else if (operator != token.Operator) {
                    return false
                }
            }
        }

        return operator
    }

    //flattens out nested %math expressions where possible
    //resulting expression will be equivalent to original (assuming variables haven't changed, it will result in the same value)
    Flatten(): MathTextCodeToken {
        let newExpression: Token[] = []

        if (this.Expression.length == 1 && this.Expression[0] instanceof MathTextCodeToken) {
            return this.Expression[0].Flatten()
        }

        //%math(  %math(%math(1+2))+1  )

        this.Expression.forEach(token => {
            if (token instanceof MathTextCodeToken) {
                let flat = token.Flatten()
                let singleOperator = this.GetIsSingleOperator()
                if (flat.Expression.length == 1 || (singleOperator && flat.GetIsSingleOperator() == singleOperator && (singleOperator == "+" || singleOperator == "*"))) {
                    newExpression.push(...flat.Expression)
                } 
                else {
                    newExpression.push(flat)
                }
            } else {
                newExpression.push(token)
            }
        });

        return new MathTextCodeToken([this.CharStart,this.CharEnd],newExpression)
    }

    // %math{  %math(    %math(1+%math(2))     )+1  }
    
    //compiles back to a string
    Compile(): string {
        let expression = ""
        this.Expression.forEach(token => {
            expression += token.Compile()
        })
        return `%math(${expression})`
    }
}

export function TokenizeMath(expressionString: string): MathTextCodeToken {
    let cu = new CharUtils(expressionString,false)

    //returned number is the index of the opening (
    //will error for invalid text code instead of returning null
    function ParseTextCodeName(index: number): [number, TextCodeType] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        //make sure first character is %
        if (cu.GetNextCharacters(index,1) != "%") { return null }
        index += cu.GetWhitespaceAmount(index) + 1 //move to %

        //get text code
        index++ //move to first char of name
        let textCodeResults = cu.GetCharactersUntil(index ,["("," "],true)
        if (!TextCodeType[textCodeResults[1]]) { return null }
        index = textCodeResults[0]

        //make sure theres an opening (
        if (cu.GetNextCharacters(index,1) != "(") {
            throw new Error(`%${textCodeResults[1]} at pos ${initIndex} missing opening parentheses`)
        }
        index += cu.GetWhitespaceAmount(index) + 1 //move to opening (

        return [index, TextCodeType[textCodeResults[1]]]
    }

    function ParseNumber(index: number): [number, NumberToken] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1
        let value = ""

        //negative sign
        if (cu.GetNextCharacters(index,1) == "-") {
            value += "-"
            index += cu.GetWhitespaceAmount(index) + 1
            //if theres a space after the - then this isnt a number
            if (expressionString[index+1] == " ") { return null }
        }

        index += cu.GetWhitespaceAmount(index) + 1 //move to first digit

        //if not a digit, this is not a number
        if (!cu.IsCharacterValidNumber(expressionString[index])) { return null }

        //digits
        var decimalFound = false
        while (cu.IsCharacterValidNumber(expressionString[index])) {
            let char = expressionString[index]
            if (char == ".") {
                if (decimalFound) { throw new Error(`Number at pos ${initIndex} has multiple decimal points`) }
                decimalFound = true
            }

            value += char
            index++
        }

        return [index - 1,new NumberToken([initIndex,index-1],value)]
    }

    function ParseVariable(index: number): [number, VariableToken] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        //make sure text code is %math
        let codeResults = ParseTextCodeName(index)
        if (!codeResults || codeResults[1] != TextCodeType.var) { return null }
        index = codeResults[0] //move to opening (

        index += 1 //move to start of name
     
        let nameResults = cu.GetCharactersUntil(index,[")"])
        
        return [nameResults[0]+1,new VariableToken([initIndex,nameResults[0]],nameResults[1])]
    }

    function ParseOperator(index: number): [number, OperatorToken] | null {
        let operator = cu.GetNextCharacters(index,1)
        if (ValidOperators.includes(operator)) {
            return [index + cu.GetWhitespaceAmount(index) + 1,new OperatorToken([index, index + cu.GetWhitespaceAmount(index)],operator)]
        } else {
            return null
        }
    }

    function ParseMath(index: number): [number, MathTextCodeToken] | null {
        let initIndex = index + cu.GetWhitespaceAmount(index) + 1

        //make sure text code is %math
        let codeResults = ParseTextCodeName(index)
        if (!codeResults || codeResults[1] != TextCodeType.math) { return null }
        index = codeResults[0] //move to opening (
        
        //= actually parse the expression =\\
        let expressionTokens: Token[] = []
        while (cu.GetNextCharacters(index,1) != ")") {
            //error for unclosed expression
            if (index + cu.GetWhitespaceAmount(index) + 1 >= expressionString.length) {
                throw new Error(`%math at pos ${initIndex} is never closed`)
            }

            let results

            //try nested %math
            if (results == null) {results = ParseMath(index)}

            //try variable
            if (results == null) {results = ParseVariable(index)}

            //try operator
            if (results == null) {results = ParseOperator(index)}

            //try number
            if (results == null) {results = ParseNumber(index)}

            if (results) {
                expressionTokens.push(results[1])
                index = results[0]
            } else {
                throw new Error(`Could not parse anything from pos ${index}: '${expressionString[index]}'`)
            }
        }

        //move to ending )
        index += cu.GetWhitespaceAmount(index) + 1

        return [index,new MathTextCodeToken([initIndex,index],expressionTokens)]
    }

    let CharIndex = -1
    let results = ParseMath(CharIndex)

    if (!results) { throw new Error("Invalid %math expression") }

    return results[1]
}