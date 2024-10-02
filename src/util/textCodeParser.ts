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

enum Target {
    "default" = "default",
    "damager" = "damager",
    "killer" = "killer",
    "shooter" = "shooter",
    "victim" = "shooter",
    "projectile" = "projectile",
    "uuid" = "uuid",
    "selected" = "selected",
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

export class TargetToken extends Token {
    constructor(meta, target: Target) {
        super(meta)
        this.Target = target
    }
    Target: Target
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

export class StringChunkToken extends Token {
    constructor(meta, value: string) {
        super(meta)
        this.Value = value
    }
    Value: string

    Compile(): string {
        return this.Value
    }
}

export class StringToken extends Token {
    constructor(meta, expression: Token[]) {
        super(meta)
        this.Expression = expression
    }
    Expression: Token[]

    Compile(): string {
        let expression = ""
        this.Expression.forEach(token => {
            expression += token.Compile()
        })
        return expression
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

class Parser {
    constructor(string: string) {
        this.expressionString = string
        this.cu = new CharUtils(string,false)
    }
    expressionString: string
    cu: CharUtils

    //returned number is the index of the opening (
    //will error for invalid text code instead of returning null
    ParseTextCodeName(index: number): [number, TextCodeType] | null {
        let initIndex = index + this.cu.GetWhitespaceAmount(index) + 1

        //make sure first character is %
        if (this.cu.GetNextCharacters(index,1) != "%") { return null }
        index += this.cu.GetWhitespaceAmount(index) + 1 //move to %

        //get text code
        index++ //move to first char of name
        let textCodeResults = this.cu.GetCharactersUntil(index ,["("," "],true)
        if (!TextCodeType[textCodeResults[1]]) { return null }
        index = textCodeResults[0]

        //make sure theres an opening (
        if (this.cu.GetNextCharacters(index,1) != "(") {
            throw new Error(`%${textCodeResults[1]} at pos ${initIndex} missing opening parentheses`)
        }
        index += this.cu.GetWhitespaceAmount(index) + 1 //move to opening (

        return [index, TextCodeType[textCodeResults[1]]]
    }

    ParseNumber(index: number): [number, NumberToken] | null {
        let initIndex = index + this.cu.GetWhitespaceAmount(index) + 1
        let value = ""

        //negative sign
        if (this.cu.GetNextCharacters(index,1) == "-") {
            value += "-"
            index += this.cu.GetWhitespaceAmount(index) + 1
            //if theres a space after the - then this isnt a number
            if (this.expressionString[index+1] == " ") { return null }
        }

        index += this.cu.GetWhitespaceAmount(index) + 1 //move to first digit

        //if not a digit, this is not a number
        if (!this.cu.IsCharacterValidNumber(this.expressionString[index])) { return null }

        //digits
        var decimalFound = false
        while (this.cu.IsCharacterValidNumber(this.expressionString[index])) {
            let char = this.expressionString[index]
            if (char == ".") {
                if (decimalFound) { throw new Error(`Number at pos ${initIndex} has multiple decimal points`) }
                decimalFound = true
            }

            value += char
            index++
        }

        return [index - 1,new NumberToken([initIndex,index-1],value)]
    }

    ParseTarget(index: number): [number, TargetToken] | null {
        index += this.cu.GetWhitespaceAmount(index) + 1
        let initIndex = index
        let testString = this.expressionString.substring(index)

        for (let target of Object.values(Target)) {
            if (testString.startsWith("%"+target)) {
                index += target.length
                return [index,new TargetToken([initIndex,index],target)]
            }
        }

        return null
    }

    ParseVariable(index: number): [number, VariableToken] | null {
        let initIndex = index + this.cu.GetWhitespaceAmount(index) + 1

        //make sure text code is %var
        let codeResults = this.ParseTextCodeName(index)
        if (!codeResults || codeResults[1] != TextCodeType.var) { return null }
        index = codeResults[0] //move to opening (

        index += 1 //move to start of name
    
        let parenDepth = 1
        let nameResults: string = ""
        while (parenDepth > 0) {
            let nextChunk = this.cu.GetCharactersUntil(index,[")","("])
            nameResults += nextChunk[1]
            index = nextChunk[0]+1
            if (this.expressionString[index] == "(") {
                nameResults += "("
                parenDepth += 1
            } else {
                if (parenDepth > 1) {
                    nameResults += ")"
                }
                parenDepth -= 1
            }
            index++
        }

        
        return [index - 1,new VariableToken([initIndex,index],nameResults)]
    }

    ParseOperator(index: number): [number, OperatorToken] | null {
        let operator = this.cu.GetNextCharacters(index,1)
        if (ValidOperators.includes(operator)) {
            return [index + this.cu.GetWhitespaceAmount(index) + 1,new OperatorToken([index, index + this.cu.GetWhitespaceAmount(index)],operator)]
        } else {
            return null
        }
    }


    //**parses the entire string contained by this parser */
    ParseString(): StringToken {
        let index = -1

        let expressionTokens: Token[] = []
        let currentChunk: string = ""
        let currentChunkStartIndex: number = 0

        while (index < this.expressionString.length) {
            let results

            if (results == null) { results = this.ParseVariable(index) }

            if (results == null) { results = this.ParseTarget(index) }

            if (results) {
                let whitespaceAmount = this.cu.GetWhitespaceAmount(index)
                if (whitespaceAmount > 0) {
                    currentChunk += this.expressionString.substring(index + 1,index + this.cu.GetWhitespaceAmount(index) + 1)
                }
                //push string content leading up to this token
                if (currentChunk.length > 0) {
                    expressionTokens.push(new StringChunkToken([currentChunkStartIndex,index],currentChunk))
                }
                expressionTokens.push(results[1])
                index = results[0]
                currentChunk = ""
                currentChunkStartIndex = index + 1
            } else {
                index++
                if (this.expressionString[index] != undefined) {
                    currentChunk += this.expressionString[index]
                }
            }
        }

        if (currentChunk.length > 0) {
            expressionTokens.push(new StringChunkToken([currentChunkStartIndex,index],currentChunk))
        }

        return new StringToken([0,this.expressionString.length],expressionTokens)
    }

    //**parses a %math code starting at `index` */
    ParseMath(index: number): [number, MathTextCodeToken] | null {
        let initIndex = index + this.cu.GetWhitespaceAmount(index) + 1

        //make sure text code is %math
        let codeResults = this.ParseTextCodeName(index)
        if (!codeResults || codeResults[1] != TextCodeType.math) { return null }
        index = codeResults[0] //move to opening (
        
        //= actually parse the expression =\\
        let expressionTokens: Token[] = []
        while (this.cu.GetNextCharacters(index,1) != ")") {
            //error for unclosed expression
            if (index + this.cu.GetWhitespaceAmount(index) + 1 >= this.expressionString.length) {
                throw new Error(`%math at pos ${initIndex} is never closed`)
            }

            let results

            //try nested %math
            if (results == null) {results = this.ParseMath(index)}

            //try variable
            if (results == null) {results = this.ParseVariable(index)}

            //try operator
            if (results == null) {results = this.ParseOperator(index)}

            //try number
            if (results == null) {results = this.ParseNumber(index)}

            if (results) {
                expressionTokens.push(results[1])
                index = results[0]
            } else {
                throw new Error(`Could not parse anything from pos ${index}: '${this.expressionString[index]}'`)
            }
        }

        //move to ending )
        index += this.cu.GetWhitespaceAmount(index) + 1

        return [index,new MathTextCodeToken([initIndex,index],expressionTokens)]
    }
}

export function TokenizeMath(input: string): MathTextCodeToken {
    let results = new Parser(input).ParseMath(-1)

    if (!results) { throw new Error("Invalid %math expression") }

    return results[1]
}

export function TokenizeString(input: string): StringToken {
    let result = new Parser(input).ParseString()

    return result
}

//finds the first instance of a given variable in the expression and returns its index
//returns null if the variable is not in the expression
//does not search nested expressions!!!!
export function FindVariable(varName: string, expression: Token[]): number | null {
    let i = -1
    for (const token of expression) {
        i++
        if (token instanceof VariableToken) {
            if (token.Name == varName) {
                return i
            }
        }
    }

    return null
}

export function GetAllVariables(expression: Token[] | string | StringToken | MathTextCodeToken): string[] {
    if (typeof expression == "string") {
        expression = TokenizeString(expression).Expression
    }
    else if (expression instanceof StringToken || expression instanceof MathTextCodeToken) {
        expression = expression.Expression
    }
    let results: string[] = []

    expression.forEach(token => {
        if (token instanceof VariableToken) {
            results.push(token.Name)
        }
        else if (token instanceof MathTextCodeToken) {
            results.push(...GetAllVariables(token.Expression))
        }
    })

    return results
}