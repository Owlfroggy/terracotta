import { ActionToken, DebugPrintVarTypeToken, EventHeaderToken, ExpressionToken, KeywordHeaderToken, LocationToken, NumberToken, OperatorToken, ParamHeaderToken, StringToken, Token, VariableToken } from "./tokenizer"
import { VALID_VAR_SCCOPES, VALID_TYPES, VALID_LINE_STARTERS, TC_TYPE_TO_DF_TYPE } from "./constants"
import { print } from "./main"
import { Domain, DomainList } from "./domains"
import * as fflate from "fflate"
import { TCError } from "./errorHandler"

const VAR_HEADER = `@__TC_`

let tempVarCounter = 0
//==========[ variable type tracking ]=========\\
class Context {
    VariableTypes = {
        unsaved: {},
        local: {},
        saved: {},
        line: {}
    }

    //true for the base level context at the bottom of the stack
    //prevents the pop function from working on this context
    IsBase = false
}

//context to actually read var types and stuff from
var CurrentContext = new Context()
CurrentContext.IsBase = true

var BaseContext = new Context()
BaseContext.IsBase = true
BaseContext.VariableTypes.local["balls"] = "num"

var ContextStack: Context[] = []

PushContext(BaseContext)

function PushContext(context: Context) {
    ContextStack.push(context)
    for (let [scope, list] of Object.entries(context.VariableTypes)) {
        for (let [name, type] of Object.entries(list)) {
            CurrentContext.VariableTypes[scope][name] = type
        }
    }
}

function PopContext() {
    let poppedContext = ContextStack.pop() as Context
    for (let [scope, list] of Object.entries(poppedContext.VariableTypes)) {
        for (let [name, type] of Object.entries(list)) {
            let lowerValue = ContextStack[ContextStack.length-1].VariableTypes[scope][name]
            if (lowerValue) {
                CurrentContext.VariableTypes[scope][name] = lowerValue
            } else {
                delete CurrentContext.VariableTypes[scope][name]
            }
        }
    }
}

function SetVarType(variable: VariableToken | VariableItem | ["unsaved" | "local" | "saved" | "line",string], type: string) {
    if (variable instanceof VariableToken) {
        ContextStack[ContextStack.length-1].VariableTypes[VALID_VAR_SCCOPES[variable.Scope]][variable.Name] = type
        CurrentContext.VariableTypes[VALID_VAR_SCCOPES[variable.Scope]][variable.Name] = type
    } else if (variable instanceof VariableItem ) {
        ContextStack[ContextStack.length-1].VariableTypes[variable.Scope][variable.Name] = type
        CurrentContext.VariableTypes[variable.Scope][variable.Name] = type
    } else {
        ContextStack[ContextStack.length-1].VariableTypes[variable[0]][variable[1]] = type
        CurrentContext.VariableTypes[variable[0]][variable[1]] = type
    }
}

let test = new Context()
test.VariableTypes.local["balls"] = "num"

PushContext(test)
PopContext()

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
    constructor(meta,scope: "unsaved" | "local" | "saved" | "line", name: string, storedType: string | null = null) {
        super("var",meta)

        this.Name = name
        this.Scope = scope
        this.StoredType = storedType
    }
    Name: string
    Scope: "unsaved" | "local" | "saved" | "line"
    StoredType: string | null
}

class LocationItem extends CodeItem {
    constructor(meta, x: number, y: number, z: number, pitch: number, yaw: number) {
        super("loc",meta)
        this.X = x
        this.Y = y
        this.Z = z
        this.Pitch = pitch
        this.Yaw = yaw
    }
    X: number
    Y: number
    Z: number
    Pitch: number
    Yaw: number
}


class TagItem extends CodeItem {
    constructor(meta,tag: string, option: string, block: string, action: string, variable: VariableItem | null = null) {
        super("tag",meta)
        this.Tag = tag
        this.Option = option
        this.Block = block
        this.Action = action
        this.Variable = variable
    }
    Tag: string
    Option: string
    Block: string
    Action: string
    Variable: VariableItem | null
}

class ParamItem extends CodeItem {
    constructor(meta,name: string,type: string,plural: boolean, optional: boolean, defualtValue: CodeItem | null = null) {
        super("param",meta)
        this.Name = name
        this.Type = type
        this.Plural = plural
        this.Optional = optional
        this.DefaultValue = defualtValue
    }
    Name: string
    Type: string
    Plural: boolean
    Optional: boolean
    DefaultValue: CodeItem | null
}

class CodeBlock {
    constructor(block: string) {
        this.Block = block
    }
    Block: string
}

class EventBlock extends CodeBlock {
    constructor(type: "ENTITY_EVENT" | "PLAYER_EVENT", event: string,lsCancel: boolean) {
        super(type)
        this.Event = event
        this.LSCancel = lsCancel
    }
    Event: string
    LSCancel: boolean
}

class FunctionBlock extends CodeBlock {
    constructor(name: string, params: ParamItem[]) {
        super("FUNCTION")
        this.Name = name
        this.Parameters = params
    }
    Name: string
    Parameters: ParamItem[]
}

class ProcessBlock extends CodeBlock {
    constructor(name: string) {
        super("PROCESS")
        this.Name = name
    }
    Name: string
}

class ActionBlock extends CodeBlock {
    constructor(block: string, action: string, args: Array<CodeItem> = [], tags: Array<TagItem> = []) {
        super(block)
        this.Action = action
        this.Arguments = args
        this.Tags = tags
    }
    Action: string
    Arguments: Array<CodeItem>
    Tags: Array<TagItem>
}

function NewTempVar(type: string): VariableItem {
    tempVarCounter++
    let varitem = new VariableItem(null, "line", `${VAR_HEADER}REG_${tempVarCounter}`)
    SetVarType(varitem,type)
    return varitem
}

function GetType(item: CodeItem) {
    if (item instanceof VariableItem) {
        if (item.StoredType) {
            return item.StoredType
        } else {
            return CurrentContext.VariableTypes[item.Scope][item.Name] || "num"
        }
    } else {
        return item.itemtype
    }
}

//takes in a Token from the parser and converts it to a CodeItem
//codeBlock[] is the code generated to create the item and should generally be pushed right after this function is called
function ToItem(token: Token): [CodeBlock[],CodeItem] {
    let code: CodeBlock[] = []

    if (token instanceof NumberToken) {
        return [code,new NumberItem([token.CharStart,token.CharEnd],token.Number)]
    }
    else if (token instanceof StringToken) {
        return [code,new StringItem([token.CharStart,token.CharEnd],token.String)]
    }
    else if (token instanceof VariableToken) {
        return [code,new VariableItem([token.CharStart,token.CharEnd],VALID_VAR_SCCOPES[token.Scope],token.Name, token.Type)]
    } 
    else if (token instanceof LocationToken) {
        let components: Dict<any> = {}

        let resultIsVariable = false

        for (const component of ["X","Y","Z","Pitch","Yaw"]) {
            //default for pitch and yaw
            if (token[component] == null && (component == "Pitch" || component == "Yaw")) {
                components[component] = new NumberItem([],"0")
                continue
            }

            let solved = SolveExpression(token[component])
            //if code was required to generate this component
            if (solved[0].length > 0) {
                code.push(...solved[0])
                resultIsVariable = true
            }
            //if this component is %mathing
            if (solved[1] instanceof NumberItem && Number.isNaN(Number(solved[1].Value))) {
                resultIsVariable = true
            }
            //if this component is a variable
            if (solved[1] instanceof VariableItem) {
                resultIsVariable = true
            }

            let resultType = GetType(solved[1])
            if (resultType != "num") {
                throw new TCError(`Expected num for ${component}, got ${resultType}`,0,token[component].CharStart,token[component].CharEnd)
            }

            components[component] = solved[1]
        }

        if (resultIsVariable) {
            let returnVar = NewTempVar("loc")
            code.push(
                new ActionBlock("set_var","SetAllCoords",[returnVar,components.X,components.Y,components.Z,components.Pitch,components.Yaw],[new TagItem([],"Coordinate Type","Plot coordinate","set_var","SetAllCoords")])
            )
            return [code,returnVar]
        } else {
            return [code,new LocationItem([token.CharStart,token.CharEnd],components.X.Value,components.Y.Value,components.Z.Value,components.Pitch.Value,components.Yaw.Value)]
        }
    }

    console.log(token)
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
        else if (leftIsLine && right instanceof NumberItem) {
            return [[], new NumberItem([left.CharStart, right.CharEnd], `%math(%var(${left.Name})${opr}${right.Value})`)]
        }
        else if (left instanceof NumberItem && rightIsLine) {
            return [[], new NumberItem([left.CharStart, right.CharEnd], `%math(${left.Value}${opr}%var(${right.Name}))`)]
        }

        //otherwise use set var


        let returnvar = NewTempVar("num")
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

function OPR_StringAdd(left, right): [CodeBlock[],CodeItem] {
    //if either left or right is a variable
    //or if either left or right aren't strings
    if (
        (left instanceof VariableItem || !(left instanceof StringItem)) || 
        (right instanceof VariableItem || !(right instanceof StringItem))
    ) {
        let leftIsLine = (left instanceof VariableItem && left.Scope == "line")
        let rightIsLine = (right instanceof VariableItem && right.Scope == "line")

        //%conditions where %var is supported
        if (leftIsLine && rightIsLine) {
            return [[], new StringItem([left.CharStart, right.CharEnd], `%var(${left.Name})%var(${right.Name})`)]
        }
        else if (leftIsLine && right instanceof StringItem) {
            return [[], new StringItem([left.CharStart, right.CharEnd], `%var(${left.Name})${right.Value}`)]
        }
        else if (left instanceof StringItem && rightIsLine) {
            return [[], new StringItem([left.CharStart, right.CharEnd], `${left.Value}%var(${right.Name})`)]
        }

        //otherwise use set var

        let returnvar = NewTempVar("str")
        let code = new ActionBlock("set_var", "String", [returnvar, left, right])
        return [[code], returnvar]
    }

    //otherwise just combine the two values
    return [[], new StringItem(null, `${left.Value}${right.Value}`)]
}

const OPERATIONS = {
    num: {
        "+": {
            num: function(left, right): [CodeBlock[],CodeItem] {
                return OPR_NumOnNum(left,right,"+","+")
            },
            str: OPR_StringAdd
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
    },
    str: {
        "+": {
            str: OPR_StringAdd,
            num: OPR_StringAdd
        },
        "*": {
            num: function(left, right): [CodeBlock[], CodeItem] {
                let returnvar = NewTempVar("str")
                let code = new ActionBlock("set_var","RepeatString",[returnvar,left,right])

                return [[code],returnvar]
            }
        }
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
            let toItemResults = ToItem(token)
            code.push(...toItemResults[0])
            expression.push(toItemResults[1])
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

                let typeleft = GetType(left)
                let typeright = GetType(right)

                let result

                if (OrderOfOperations[pass].includes(item.Operator)) {
                    //error for unsupported operation
                    if (OPERATIONS[typeleft] == undefined || OPERATIONS[typeleft][item.Operator] == undefined || OPERATIONS[typeleft][item.Operator][typeright] == undefined) {
                        throw new TCError(`${typeleft} cannot ${item.Operator} with ${typeright}`, 0, item.CharStart, item.CharEnd)
                    }
                    
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

    let headerMode = true
    let headerData: Dict<any> = {
        codeblock: null,
        lsCancel: false,
        params: []
    }
    let existingParams: string[] = []

    for (let line of lines) {
        //headers
        if (headerMode) {
            let header = line[0]
            if (header instanceof EventHeaderToken) {
                //if an event has already been declared
                if (headerData.codeblock) {
                    throw new TCError("Code line type has already been delcared",0,line[0].CharStart,line[0].CharEnd)
                }
                
                headerData.codeblock = header
            }
            else if (header instanceof KeywordHeaderToken) {
                switch (header.Keyword) {
                    case "LAGSLAYER_CANCEL":
                        headerData.lsCancel = header
                        break
                }
            }
            else if (header instanceof ParamHeaderToken) {
                //solve default value
                let results = header.DefaultValue != null ? SolveExpression(header.DefaultValue) : null
                //error if default value requires code
                if (results && results[0].length > 0) {
                    throw new TCError("Default value must be a compile-time constant",0,header.DefaultValue?.CharStart!,header.DefaultValue?.CharEnd!)
                }

                //error if a param by this name already exists
                if (existingParams.includes(header.Name)) {
                    throw new TCError(`Duplicate parameter '${header.Name}'`,0,header.CharStart,header.CharEnd)
                }

                //record that a param by this name exists
                existingParams.push(header.Name)

                //error for type mis-match
                if (header.Type != "any" && results && results![1].itemtype != header.Type) {
                    throw new TCError(`Default value (${results![1].itemtype}) does not match parameter type (${header.Type})`,0,header.DefaultValue!.CharStart,header.DefaultValue!.CharEnd)
                }

                //automatically cast var for this line var
                if (!(header.Type == "any" || header.Type == "var")) {
                    SetVarType(["line",header.Name],header.Type)
                }

                headerData.params.push(
                    new ParamItem([header.CharStart,header.CharEnd],header.Name,header.Type,header.Plural,header.Optional,results ? results[1] : null)
                )
            }
            
            //done with headers, apply them
            else {
                if (headerData.codeblock) {
                    let block
                    if (headerData.codeblock.Codeblock == "PLAYER_EVENT" || headerData.codeblock.Codeblock == "ENTITY_EVENT") {
                        block = new EventBlock(headerData.codeblock.Codeblock, headerData.codeblock.Event, headerData.lsCancel == false ? false : true)
                    }
                    else if (headerData.codeblock.Codeblock == "FUNCTION") {
                        block = new FunctionBlock(headerData.codeblock.Event, headerData.params)
                    }
                    else if (headerData.codeblock.Codeblock == "PROCESS") {
                        block = new ProcessBlock(headerData.codeblock.Event)
                    }

                    //error if applying params to something thats not a function
                    if (headerData.codeblock.Codeblock != "FUNCTION" && headerData.params.length > 0) {
                        throw new TCError("Only functions can have parameters", 0, headerData.params[0].CharStart, headerData.params[0].CharEnd)
                    }

                    CodeLine.push(block)
                } else {
                    throw new TCError("File is neither a function, process, or event.",0,-1,-1)
                }

                headerMode = false
            }
        }

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
        //variable thingies
        else if (line[0] instanceof VariableToken) {
            if (line[0].Type) { SetVarType(line[0],line[0].Type) }
            //variable all on its own
            if (line.length == 1) {
                //throw error for variable thats not assigning type
                if (line[0].Type == undefined) {
                    throw new TCError(`Expected type assignment or operator following variable`,0,line[0].CharStart,line[0].CharEnd)
                }
            }
            //assignment
            else if (line[1] instanceof OperatorToken) {
                // convert left and right to code items
                let left = ToItem(line[0])[1]
                let rightResults = SolveExpression(line[2] as ExpressionToken)
                //if code is required to generate right, push it
                if (rightResults[0].length > 0) {
                    CodeLine.push(...rightResults[0])
                }
                let right = rightResults[1]

                let typeleft = GetType(left)
                let typeright = GetType(right)

                if (line[1].Operator == "=") { 
                    if (line[0].Type) {
                        if (typeleft != typeright) {
                            throw new TCError(`Attempted to set variable explicitly typed as ${typeleft} to ${typeright}`,0,line[0].CharStart,line[2].CharEnd)
                        }
                    } else {
                        //automatically set type to whatevers on the right if no type is provided
                        SetVarType(line[0],GetType(right))
                    }
                    CodeLine.push(new ActionBlock("set_var","=",[left,right]))
                } else {
                    //incremental things idk what to call them

                    let opr = 
                        line[1].Operator == "+=" ? "+" :
                        line[1].Operator == "-=" ? "-" :
                        line[1].Operator == "*=" ? "*" :
                        line[1].Operator == "/=" ? "/" :
                        line[1].Operator == "%=" ? "%" :
                        "INVALID OPERATOR"

                    //error for unsupported operation
                    if (OPERATIONS[typeleft] == undefined || OPERATIONS[typeleft][opr] == undefined || OPERATIONS[typeleft][opr][typeright] == undefined) {
                        throw new TCError(`${typeleft} cannot ${opr} with ${typeright}`, 0, line[1].CharStart, line[1].CharEnd)
                    }

                    //run the operation
                    let result = OPERATIONS[typeleft][opr][typeright](left, right)
                    //push any code generated by operation
                    CodeLine.push(...result[0])

                    //set variable
                    CodeLine.push(
                        new ActionBlock("set_var","=",[left,result[1]])
                    )
                }
            }
        }
        //debug print variable
        else if (line[0] instanceof DebugPrintVarTypeToken) {
            console.log(`${line[0].Variable.Scope} variable '${line[0].Variable.Name}' has type ${CurrentContext.VariableTypes[VALID_VAR_SCCOPES[line[0].Variable.Scope]][line[0].Variable.Name]}`)
        }
    }

    let results = new CompileResults()
    results.Code = CodeLine

    return results
}

//convert code to df template JSON
function JSONizeItem(item: CodeItem) {
    if (item instanceof NumberItem) {
        return {
            "id": "num",
            "data": {
                "name": item.Value
            }
        }
    }
    else if (item instanceof StringItem) {
        return {
            "id": "txt",
            "data": {
                "name": item.Value
            }
        }
    }
    else if (item instanceof VariableItem) {
        return {
            "id": "var",
            "data": {
                "name": item.Name,
                "scope": item.Scope
            }
        }
    }
    else if (item instanceof LocationItem) {
        return {
            "id": "loc",
            "data": {
                "isBlock": false,
                "loc": {
                    "x": item.X,
                    "y": item.Y,
                    "z": item.Z,
                    "pitch": item.Pitch,
                    "yaw": item.Yaw
                }
            }
        }
    }
    else {
        throw new Error(`Failed to convert item of type '${item.itemtype}' to JSON`)
    }
}

export function JSONize(code: Array<CodeBlock>): string {
    let blocks: Array<Object> = []
    for (let block of code) {
        if (block instanceof ActionBlock) {
            let chest: any[] = []
            //convert items
            for (const item of block.Arguments) {
                chest.push({
                    "item": JSONizeItem(item),
                    "slot": chest.length
                })
            }

            //convert tags
            let i = 26
            for (const item of block.Tags) {
                //main tag data
                let tag = {
                    "item": {
                        "id": "bl_tag",
                        "data": {
                            "tag": item.Tag,
                            "option": item.Option,
                            "block": item.Block,
                            "action": item.Action,
                        }
                    },
                    "slot": i
                }
                //variable
                if (item.Variable) {
                    tag["variable"] = JSONizeItem(item.Variable)
                }

                chest.push(tag)
                i--
            }

            blocks.push({
                "id": "block",
                "block": block.Block,
                "args": {"items": chest},
                "action": block.Action
            })
        }
        else if (block instanceof EventBlock) {
            blocks.push({
                "id": "block",
                "block": block.Block == "PLAYER_EVENT" ? "event" : "entity_event",
                "args": {
                    "items": []
                },
                "action": block.Event,
                "attribute": block.LSCancel ? "LS-CANCEL" : undefined
            })
        }
        else if (block instanceof FunctionBlock) {
            let params: any[] = []
            for (const param of block.Parameters) {
                params.push({
                    "item": {
                        "id": "pn_el",
                        "data": {
                            "name": param.Name,
                            "type": TC_TYPE_TO_DF_TYPE[param.Type],
                            "default_value": param.DefaultValue != null ? JSONizeItem(param.DefaultValue) : undefined,
                            "plural": param.Plural,
                            "optional": param.Optional
                        }
                    },
                    "slot": params.length
                })
            }
            blocks.push({
                "id": "block",
                "block": "func",
                "args": {
                    "items": params
                },
                "data": block.Name
            })
        }
        else if (block instanceof ProcessBlock) {
            blocks.push({
                "id": "block",
                "block": "process",
                "args": {
                    "items": [
                        {
                            "item": {
                                "id": "bl_tag",
                                "data": {
                                    "option": "False",
                                    "tag": "Is Hidden",
                                    "action": "dynamic",
                                    "block": "process"
                                }
                            },
                            "slot": 26
                        }
                    ]
                },
                "data": block.Name
            })
        }
        else {
            throw new Error("Failed to convert block to JSON")
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