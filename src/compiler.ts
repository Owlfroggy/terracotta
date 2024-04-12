import { ActionToken, ExpressionToken, NumberToken, OperatorToken, StringToken, Token, VariableToken } from "./tokenizer"
import { VALID_VAR_SCCOPES } from "./constants"
import { print } from "./main"
import { Domain, DomainList } from "./domains"
import * as fflate from "fflate"
import { TCError } from "./errorHandler"

const VAR_HEADER = `.tc.`

let tempVarCounter = 0

//abstract base class for all code items
class CodeItem {
    constructor(type: string,meta: [number,number] | null) {
        this.itemtype = type
        if (meta) {
            this.CharStart = meta[0]
            this.CharEnd = meta[1]
        }
    }

    CharStart: number = -1
    CharEnd: number = -1

    itemtype: string
}

class NumberItem extends CodeItem {
    constructor(meta,value: string){
        super("num",meta)
        this.Value = value
    }
    Value: string
}

class StringItem extends CodeItem {
    constructor(meta,value: string){
        super("str",meta)
        this.Value = value
    }
    Value: string
}

class VariableItem extends CodeItem {
    constructor(meta,scope: "unsaved" | "local" | "saved" | "line", name: string, type: string) {
        super("var",meta)
        this.Name = name
        this.Scope = scope
        this.compilerType = type
    }
    Name: string
    Scope: "unsaved" | "local" | "saved" | "line"
    compilerType: string
}


class CodeTag {}

class CodeBlock {
    constructor(block: string) {
        this.Block = block
    }
    Block: string
}

class ActionBlock extends CodeBlock {
    constructor(block: string, action: string, args: Array<CodeItem> = [], tags: Array<CodeTag> = []) {
        super(block)
        this.Action = action
        this.Arguments = args
        this.Tags = tags
    }
    Action: string
    Arguments: Array<CodeItem>
    Tags: Array<CodeTag>
}

//takes in a Token from the parser and converts it to a CodeItem
function ToItem(token: Token): CodeItem {
    if (token instanceof NumberToken) {
        return new NumberItem([token.CharStart,token.CharEnd],token.Number)
    }
    else if (token instanceof StringToken) {
        return new StringItem([token.CharStart,token.CharEnd],token.String)
    }
    else if (token instanceof VariableToken) {
        return new VariableItem([token.CharStart,token.CharEnd],VALID_VAR_SCCOPES[token.Scope],token.Name,token.Type)
    }

    throw new Error("Could not convert token to item")
}

//operations
function OPR_NumOnNum(left, right, opr: string, blockopr: string): [CodeBlock[],CodeItem] {
    //if at least one thing is a variable
    if (left instanceof VariableItem || right instanceof VariableItem) {
        let leftIsLine = (left instanceof VariableItem && left.Scope == "line")
        let rightIsLine = (right instanceof VariableItem && right.Scope == "line")

        //%conditions where %math is supported
        if (leftIsLine && rightIsLine) {
            return [[], new NumberItem([left.CharStart, right.CharEnd], `%math(%var(${left.Name})${opr}%var(${right.Name}))`)]
        }
        else if (leftIsLine) {
            return [[], new NumberItem([left.CharStart, right.CharEnd], `%math(%var(${left.Name})${opr}${right.Value})`)]
        }
        else if (rightIsLine) {
            return [[], new NumberItem([left.CharStart, right.CharEnd], `%math(${left.Value}${opr}%var(${right.Name}))`)]
        }

        //otherwise use set var

        tempVarCounter++
        let returnvar = new VariableItem(null, "line", `${VAR_HEADER}temp${tempVarCounter}`, "num")
        let code = new ActionBlock("set_var", blockopr, [returnvar, left, right])
        return [[code], returnvar]
    }

    let leftnum = Number(left.Value)
    let rightnum = Number(right.Value)
    //if both numbers are numerical then just add them together
    if (!Number.isNaN(leftnum) && !Number.isNaN(rightnum)) {
        let val = 
            (opr == "+") ? (leftnum + rightnum) :
            (opr == "-") ? (leftnum - rightnum) :
            (opr == "*") ? (leftnum * rightnum) :
            (opr == "/") ? (leftnum / rightnum) :
            (opr == "%") ? (leftnum % rightnum) :
            "OPERATION ERROR"
        return [[], new NumberItem(null, String(val))]
    }
    //otherwise at least one of them is %mathing so just do that
    else {
        return [[], new NumberItem(null, `%math(${left.Value}${opr}${right.Value})`)]
    }
}

const OPERATIONS = {
    num: {
        "+": {
            num: function(left, right): [CodeBlock[],CodeItem] {
                return OPR_NumOnNum(left,right,"+","+")
            }
        },
        "-": {
            num: function(left, right): [CodeBlock[],CodeItem] {
                return OPR_NumOnNum(left,right,"-","-")
            }
        },
        "*": {
            num: function(left, right): [CodeBlock[],CodeItem] {
                return OPR_NumOnNum(left,right,"*","x")
            }
        },
        "/": {
            num: function(left, right): [CodeBlock[],CodeItem] {
                return OPR_NumOnNum(left,right,"/","/")
            }
        },
        // not possible until i do code tags
        // "%": {
        //     num: function(left, right): [CodeBlock[],CodeItem] {
        //         return OPR_NumOnNum(left,right,"%","%")
        //     }
        // }
    }
}

const OrderOfOperations = [
    ["*","/","%"],
    ["+","-"]
]

function SolveExpression(exprToken: ExpressionToken): [CodeBlock[], CodeItem] {
    let code: CodeBlock[] = []
    let expression: (Token | CodeItem)[] = []

    //convert expression tokens to code items
    for (const token of exprToken.Expression) {
        if (token instanceof OperatorToken) {
            expression.push(token)
        } else {
            expression.push(ToItem(token))
        }
    }


    for (let pass = 0; pass < OrderOfOperations.length; pass++) {
        let i = 0;
        while (i < expression.length) {
            let item = expression[i]

            if (item instanceof OperatorToken) {
                //@ts-ignore
                let left: CodeItem = expression[i - 1]
                //@ts-ignore
                let right: CodeItem = expression[i + 1]

                let typeleft = left instanceof VariableItem ? left.compilerType : left.itemtype
                let typeright = right instanceof VariableItem ? right.compilerType : right.itemtype

                let result

                //error for unsupported operation
                if (OPERATIONS[typeleft] == undefined || OPERATIONS[typeleft][item.Operator] == undefined || OPERATIONS[typeleft][item.Operator][typeright] == undefined) {
                    throw new TCError(`${typeleft} cannot ${item.Operator} with ${typeright}`, 0, item.CharStart, item.CharEnd)
                }

                // add and subtract \\
                if (OrderOfOperations[pass].includes(item.Operator)) {
                    result = OPERATIONS[typeleft][item.Operator][typeright](left, right)
                }

                if (result) {
                    code.push(...result[0])
                    expression[i - 1] = result[1]
                    expression.splice(i, 2)
                    i--
                }
            }
            i++
        }
    }

    if (expression.length > 1) {
        throw new Error("Failed to condense expression")
    }

    //@ts-ignore
    return [code, expression[0]]
}

export class CompileResults {
    Code: Array<CodeBlock>
}

export function Compile(lines: Array<Array<Token>>): CompileResults {
    var CodeLine: Array<CodeBlock> = []

    for (let line of lines) {
        //action
        if (line[0] instanceof ActionToken) {
            let action = line[0]
            let domain: Domain = DomainList[action.DomainId]!
            
            let args: CodeItem[] = []
            for (let v of line[0].Params?.Items!) {
                let expressionResults = SolveExpression(v)
                CodeLine.push(...expressionResults[0])
                args.push(expressionResults[1])
            }

            //push action
            CodeLine.push(new ActionBlock(domain.CodeBlock!,domain.Actions[action.Action]?.DFName!,args))
        }
    }

    let results = new CompileResults()
    results.Code = CodeLine

    return results
}

//convert code to df template JSON
export function JSONize(code: Array<CodeBlock>): string {
    let blocks: Array<Object> = []
    for (let block of code) {
        if (block instanceof ActionBlock) {
            let chest: any[] = []
            //convert items
            for (const item of block.Arguments) {
                //number
                if (item instanceof NumberItem) {
                    chest.push({
                        "item": {
                            "id": "num",
                            "data": {
                                "name": item.Value
                            }
                        },
                        "slot": chest.length
                    })
                }
                //string
                else if (item instanceof StringItem) {
                    chest.push({
                        "item": {
                            "id": "txt",
                            "data": {
                                "name": item.Value
                            }
                        },
                        "slot": chest.length
                    })
                }
                //variable
                else if (item instanceof VariableItem) {
                    chest.push({
                        "item": {
                            "id": "var",
                            "data": {
                                "name": item.Name,
                                "scope": item.Scope
                            }
                        },
                        "slot": chest.length
                    })
                } 
                else {
                    throw new Error(`Failed to convert item of type '${item.itemtype}' to JSON`)
                }
            }

            blocks.push({
                "id": "block",
                "block": block.Block,
                "args": {"items": chest},
                "action": block.Action
            })
        }
    }

    return JSON.stringify({blocks: blocks})
}

//stolen from a prevoius project of mine which probably stole it from somewhere else
export function GZIP(json: string) {
    const uint8ToBase64 = (arr) =>
    btoa(
        Array(arr.length)
            .fill('')
            .map((_, i) => String.fromCharCode(arr[i]))
            .join('')
    );
    var enc = new TextEncoder()
    const output = fflate.gzipSync(enc.encode(json), { level: 9, mtime: 0});

    return uint8ToBase64(output)
}