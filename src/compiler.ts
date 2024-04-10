import { ActionToken, ExpressionToken, NumberToken, OperatorToken, StringToken, Token } from "./tokenizer"
import { print } from "./main"
import { Domain, DomainList } from "./domains"
import * as fflate from "fflate"
import { TCError } from "./errorHandler"

//abstract base class for all code items
class CodeItem {
    constructor(type: string) {
        this.itemtype = type
    }

    itemtype: string
}

class NumberItem extends CodeItem {
    constructor(value: string){
        super("num")
        this.Value = value
    }
    Value: string
}

class StringItem extends CodeItem {
    constructor(value: string){
        super("str")
        this.Value = value
    }
    Value: string
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
        return new NumberItem(token.Number)
    }
    else if (token instanceof StringToken) {
        return new StringItem(token.String)
    }

    throw new Error("Could not convert token to item")
}

//operations
const OPERATIONS = {
    num: {
        "+": {
            num: function(left: NumberItem, right: NumberItem): [CodeBlock[],CodeItem] {
                let leftnum = Number(left.Value)
                let rightnum = Number(left.Value)

                //if both numbers are numerical then just add them together
                if (!Number.isNaN(leftnum) && !Number.isNaN(rightnum)) {
                    return [[], new NumberItem(String(leftnum + rightnum))]
                }
                //otherwise at least one of them is %mathing so just do that
                else {
                    return [[], new NumberItem(`%math(${left.Value}+${right.Value})`)]
                }
            }
        }
    }
}

const OrderOfOperations = [
    "addAndSubtract"
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

    let pass = 0

    let i = 0;
    while (i < expression.length) {
        let item = expression[i]

        if (item instanceof OperatorToken) {
            //@ts-ignore
            let left: CodeItem = expression[i-1]
            //@ts-ignore
            let right: CodeItem = expression[i+1]

            let result

            // add and subtract \\
            if ( OrderOfOperations[pass] == "addAndSubtract" && (item.Operator == "+" || item.Operator == "-") ) {
                result = OPERATIONS[left.itemtype][item.Operator][right.itemtype](left, right)
            }
            
            code.push(...result[0])
            expression[i-1] = result[1]
            expression.splice(i,2)
            i--
        }
        i++
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
                } else {
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