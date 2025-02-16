import { ActionTag, ActionToken, BracketToken, CallToken, ControlBlockToken, DebugPrintVarTypeToken, DescriptionHeaderToken, DictionaryToken, ElseToken, EventHeaderToken, ExpressionToken, GameValueToken, HeaderToken, IfToken, IndexerToken, ItemToken, KeywordHeaderToken, ListToken, LocationToken, NumberToken, OperatorToken, ParamHeaderToken, ParticleToken, PotionToken, RepeatForActionToken, RepeatForInToken, RepeatForeverToken, RepeatMultipleToken, RepeatToken, RepeatWhileToken, ReturnsHeaderToken, SelectActionToken, SoundToken, StringToken, TextToken, Token, TypeOverrideToken, VariableToken, VectorToken } from "../tokenizer/tokenizer.ts"
import { VALID_VAR_SCOPES, VALID_LINE_STARTERS, VALID_COMPARISON_OPERATORS, DF_TYPE_MAP, TC_HEADER, ITEM_DF_NBT } from "../util/constants.ts"
import { DEBUG_MODE, print } from "../main.ts"
import { Domain, DomainList, TargetDomain, TargetDomains } from "../util/domains.ts"
import * as fflate from "fflate"
import { Dict } from "../util/dict.ts"
import { TCError } from "../util/errorHandler.ts"
import * as AD from "../util/actionDump.ts"
import * as TextCode from "../util/textCodeParser.ts"
import * as NBT from "nbtify"
import { CompilationEnvironment, CompileProject, ItemLibrary } from "./projectCompiler.ts"
import { CodeLensRefreshRequest, DiagnosticRefreshRequest } from "vscode-languageserver";
import { MAX_LINE_VARS } from "./codeblockNinja.ts";

//fill in missing tags with their default values
function FillMissingTags(codeblockIdentifier: string, actionDFName: string, tags: TagItem[]): TagItem[] {
    if (!AD.DFActionMap[codeblockIdentifier]![actionDFName]) {
        return tags
    }

    let existingTags: Dict<boolean> = {} //df name
    for (let v of tags) { existingTags[v.Tag] = true }

    for (let [tagName, tag] of Object.entries(AD.DFActionMap[codeblockIdentifier]![actionDFName]!.Tags)) {
        //if this tag was present in the given list
        if (tagName in existingTags) {continue}
        
        //otherwise fill in default value
        tags.push(new TagItem([],tagName,tag!.Default,codeblockIdentifier,actionDFName))
    }

    return tags
}

function ActionNameErrorChecks(domain: Domain, action: ActionToken) {
    //error for invalid action
    if (domain[action.Type == "comparison" ? "Conditions" : "Actions"][action.Action] == undefined) {
        if (domain instanceof TargetDomain) {
            throw new TCError(`Invalid ${action.Type == "comparison" ? 'if ' : ''}${domain.ActionType} action: '${action.Action}'`, 2, action.Segments.actionName![0], action.Segments.actionName![1])
        }
        else if (domain.Identifier == "game") {
            throw new TCError(`Invalid ${action.Type == "comparison" ? 'if ' : ''}game action: '${action.Action}'`, 2, action.Segments.actionName![0], action.Segments.actionName![1])
        }
        else {
            throw new TCError(`'${domain.Identifier}' does not contain function '${action.Action}'`, 2, action.Segments.actionName![0], action.Segments.actionName![1])
        }
    }
}

function IntegerizeHexColor(color: StringItem) {
    let string = color.Value.substring(color.Value.startsWith("#") ? 1 : 0, color.Value.length)
    if (string.length == 3) {
        string = string[0].repeat(2) + string[1].repeat(2) + string[2].repeat(2)
    }
    else if (string.length != 6) {
        throw new TCError(`Invalid hex color: '${color.Value}'`,0,color.CharStart,color.CharEnd)
    }

    let int = Number("0x" + string)
    if (Number.isNaN(int) || int < 0 || int > 16777215) {
        throw new TCError(`Invalid hex color: '${color.Value}'`,0,color.CharStart,color.CharEnd)
    }
    
    return int
}

export interface CompileResults {
    code: Array<CodeBlock>
    type?: "PLAYER_EVENT" | "ENTITY_EVENT" | "FUNCTION" | "PROCESS"
    name?: string
}

//abstract base class for all code items
export class CodeItem {
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

export class NumberItem extends CodeItem {
    constructor(meta,value: string){
        super("num",meta)
        this.Value = value
    }
    Value: string

    //if this number is a %math expression, this var represents
    //a temp var name that this item can safely replace when condensing
    TempVarEquivalent: string
}

export class StringItem extends CodeItem {
    constructor(meta,value: string){
        super("str",meta)
        this.Value = value
    }
    Value: string
}

export class VariableItem extends CodeItem {
    constructor(meta,scope: "unsaved" | "local" | "saved" | "line", name: string, storedType: string | null = null) {
        super("var",meta)

        this.Name = name
        this.Scope = scope
        this.StoredType = storedType
    }
    Name: string
    Scope: "unsaved" | "local" | "saved" | "line"
    StoredType: string | null
    IsTemporary: boolean = false
}

export class LocationItem extends CodeItem {
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

export class VectorItem extends CodeItem {
    constructor(meta, x: number, y: number, z: number) {
        super("vec",meta)
        this.X = x
        this.Y = y
        this.Z = z
    }
    X: number
    Y: number
    Z: number
}

export class SoundItem extends CodeItem {
    constructor(meta,soundId: string | null, customKey: string | null, volume: number, pitch: number, variant: string | null = null) {
        super("snd",meta)
        this.SoundId = soundId
        this.CustomKey = customKey
        this.Volume = volume
        this.Pitch = pitch
        this.Variant = variant
    }
    SoundId: string | null
    CustomKey: string | null
    Volume: number
    Pitch: number
    Variant: string | null
}

export class TextItem extends CodeItem {
    constructor(meta,value: string) {
        super("txt",meta)
        this.Value = value
    }

    Value: string
}

export class PotionItem extends CodeItem {
    constructor(meta,potion: string, amplifier: number, duration: number) {
        super("pot",meta)
        this.Potion = potion
        this.Amplifier = amplifier
        this.Duration = duration
    }
    Potion: string
    Amplifier: number
    Duration: number
}

export class GameValueItem extends CodeItem {
    constructor(meta,value,target) {
        super("gval",meta)
        this.Value = value
        this.Target = target
    }

    Value: string
    Target: string
}

export class ItemItem extends CodeItem {
    constructor(meta,id: string,count: number, nbt: string | undefined = undefined, dfNbt: number = ITEM_DF_NBT) {
        super("item",meta)
        this.Id = id
        this.Count = count
        this.Nbt = nbt
        this.DFNbt = dfNbt
    }
    Id: string
    Count: number
    Nbt: string | undefined
    DFNbt: number
}

export class ParticleItem extends CodeItem {
    constructor(meta, particle: string, cluster: {Amount: number,HorizontalSpread: number,VerticalSpread: number}, data: Dict<any>) {
        super("par",meta)
        this.Particle = particle
        this.Cluster = cluster
        this.Data = data
    }
    Particle: string
    Cluster: {
        Amount: number,
        HorizontalSpread: number,
        VerticalSpread: number
    }
    Data: Dict<any>
}

export class TagItem extends CodeItem {
    constructor(meta,tag: string, option: string, block: string, action: string, variable: VariableItem | null = null) {
        super("tag",meta)
        this.Tag = tag
        this.Option = option
        this.Block = block
        this.Action = action
        this.Variable = variable
        
        this.ChestSlot = AD.DFActionMap[block]![action]!.Tags[tag]!.ChestSlot
    }
    Tag: string
    Option: string
    Block: string
    Action: string
    Variable: VariableItem | null

    ChestSlot: number
}

export class ParamItem extends CodeItem {
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

export class CodeBlock {
    constructor(block: string) {
        this.Block = block
    }
    Block: string
}

export class EventBlock extends CodeBlock {
    constructor(type: "ENTITY_EVENT" | "PLAYER_EVENT", event: string,lsCancel: boolean) {
        super(type)
        this.Event = event
        this.LSCancel = lsCancel
    }
    Event: string
    LSCancel: boolean
}

export class FunctionBlock extends CodeBlock {
    constructor(name: string, params: ParamItem[]) {
        super("FUNCTION")
        this.Name = name
        this.Parameters = params
    }
    Name: string
    Parameters: ParamItem[]
}

export class ProcessBlock extends CodeBlock {
    constructor(name: string) {
        super("PROCESS")
        this.Name = name
    }
    Name: string
}

export class ActionBlock extends CodeBlock {
    constructor(block: string, action: string, args: (CodeItem | null)[] = [], tags: TagItem[] = [], target: string | null = null) {
        super(block)
        if (block == "call_func") {
            this.ActionNameField = "data"
        }
        this.Action = action
        this.Arguments = args
        this.Tags = FillMissingTags(block,action,tags)
        this.Target = target
    }
    Action: string
    Arguments: (CodeItem | null)[]
    Tags: TagItem[]
    Target: string | null = null
    
    //what key to use for action name when compiling to json
    //most actions use "action", call func and start process use "data"
    ActionNameField: string = "action"
}

export class IfActionBlock extends ActionBlock {
    constructor(block: string, action: string, args: Array<CodeItem>, tags: TagItem[], target: string | null, not: boolean) {
        super(block,action,args,tags,target)
        this.Not = not
    }
    Not: boolean
}

export class SubActionBlock extends ActionBlock {
    constructor(block: string, action: string, args: (CodeItem | null)[], tags: TagItem[], not: boolean, subaction: string | null = null) {
        super(block,action,args,tags,null)
        this.Subaction = subaction
        this.Not = not
    }

    Not: boolean
    Subaction: string | null
}

export class ElseBlock extends CodeBlock {
    constructor() {
        super("else")
    }
}

export class BracketBlock extends CodeBlock {
    constructor(direction: "open" | "close", type: "repeat" | "if") {
        super("BRACKET")
        this.Direction = direction
        this.Type = type
    }
    Direction: "open" | "close"
    Type: "repeat" | "if"
}

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

    BracketType: "none" | "repeat" | "if" = "none"

    //does nothing if bracket type == none
    //if bracket type == "if" | "repeat" then an opening bracket is required on the line after
    //the context is pushed. this var keeps track of whether or not that has happened
    OpeningBracketResolved = false

    //should be null if bracket type == "none"
    //token that caused this new context
    CreatorToken: IfToken | RepeatToken | null = null

    //code that's inserted after the opening bracket of this context
    //should be after the context is created but before brackets are parsed or else it wont have an effect
    HeldPostBracketCode: CodeBlock[] = []
}

export function PreProcess(lines: Token[][], environment: CompilationEnvironment) {
    let lineStarter: string | undefined = undefined
    let lineName: string

    let seenReturnType = false

    for (let line of lines) { 
        if (line.length == 0) { continue }
        // stop after getting past headers
        if (line[0] && !(line[0] instanceof HeaderToken)) {
            break
        }

        if (line[0] instanceof EventHeaderToken) {
            lineStarter = line[0].Codeblock
            lineName = line[0].Event
        } 
        // throw error for headers other than event header coming first
        else if (!lineStarter && !(
               (line[0] instanceof KeywordHeaderToken && line[0].Keyword == "LAGSLAYER_CANCEL")
            || (line[0] instanceof DescriptionHeaderToken)
        )) {
            throw new TCError("Codeline type header must always come before other headers.",0,line[0].CharStart,line[0].CharEnd)
        }
        // return type
        else if (line[0] instanceof ReturnsHeaderToken) {
            if (seenReturnType) {
                throw new TCError("Functions can only have one 'RETURNS' header.",0,line[0].CharStart,line[0].CharEnd)
            }
            seenReturnType = true
            let type = line[0].Type
            if (type == "var") {
                throw new TCError("Functions cannot return type 'var'.",0,line[0].CharStart,line[0].CharEnd)
            }
            if (lineStarter != "FUNCTION") {
                throw new TCError("Only functions can return values.",0,line[0].CharStart,line[0].CharEnd)
            }
            environment.funcReturnTypes[lineName!] = type
        }
    }
}

export function CompileLines(lines: Array<Array<Token>>, environment: CompilationEnvironment): CompileResults {
    //if trying to compile an empty file, dont do anything
    let tempVarCounter = 0

    //context to actually read var types from
    var CombinedVarContext = new Context()
    CombinedVarContext.IsBase = true

    var BaseContext = new Context()
    BaseContext.IsBase = true
    BaseContext.VariableTypes.local["balls"] = "num"

    //context at the top of the stack
    var HighestContext = BaseContext

    var ContextStack: Context[] = []

    PushContext(BaseContext)

    function PushContext(context: Context) {
        ContextStack.push(context)
        HighestContext = context

        //update var types
        for (let [scope, list] of Object.entries(context.VariableTypes)) {
            for (let [name, type] of Object.entries(list)) {
                CombinedVarContext.VariableTypes[scope][name] = type
            }
        }
    }

    function PopContext() {
        let poppedContext = ContextStack.pop() as Context
        HighestContext = ContextStack[ContextStack.length - 1]

        //update var types
        for (let [scope, list] of Object.entries(poppedContext.VariableTypes)) {
            for (let [name, type] of Object.entries(list)) {
                let lowerValue: string | undefined = undefined
                for (let i = ContextStack.length-1; i >= 0; i--) {
                    let val = ContextStack[i].VariableTypes[scope][name]
                    if (val) {
                        lowerValue = val
                        break
                    }
                }
                if (lowerValue) {
                    CombinedVarContext.VariableTypes[scope][name] = lowerValue
                } else {
                    delete CombinedVarContext.VariableTypes[scope][name]
                }
            }
        }
    }

    function SetVarType(variable: VariableToken | VariableItem | ["unsaved" | "local" | "saved" | "line",string], type: string | undefined) {
        if (variable instanceof VariableToken) {
            ContextStack[ContextStack.length-1].VariableTypes[VALID_VAR_SCOPES[variable.Scope]!][variable.Name] = type
            CombinedVarContext.VariableTypes[VALID_VAR_SCOPES[variable.Scope]!][variable.Name] = type
        } else if (variable instanceof VariableItem ) {
            ContextStack[ContextStack.length-1].VariableTypes[variable.Scope][variable.Name] = type
            CombinedVarContext.VariableTypes[variable.Scope][variable.Name] = type
        } else {
            ContextStack[ContextStack.length-1].VariableTypes[variable[0]][variable[1]] = type
            CombinedVarContext.VariableTypes[variable[0]][variable[1]] = type
        }
    }

    //if raw is true, skip any special case logic
    function GetReturnType(action: ActionBlock, raw: boolean = false): string | null {
        function getValueOfTag(tag: string): string | null {
            for (const v of action.Tags) {
                if (v.Tag == tag) {
                    return v.Option
                }
            }
            return null
        }

        //special cases where diamondfire decided to be quirky and have multiple return types
        if (!raw) {
            if (action.Block == "set_var") {
                switch (action.Action) {
                    case " GetSignText ":
                        return getValueOfTag("Sign Line") == "All lines" ? "list" : "txt"
                    case " GetBookText ":
                        //check if number in args list
                        for (const v of action.Arguments) {
                            if (GetType(v) == "num") {
                                return "txt"
                            }
                        }
                        return "list"
                    case "GetItemType":
                        return getValueOfTag("Return Value Type") == "Item" ? "item" : "str"
                    case "GetBlockType":
                        return getValueOfTag("Return Value Type") == "Item" ? "item" : "str"
                    case "ContainerLock":
                        //the only thing you're realistically gonna do if its a number is check if its 0
                        //but with a string you might actually do stuff with that
                        //so just mark this action as str and hope for the best
                        return "str"
                    case "RandomValue":
                        //if every arg is the same type, return that
                        let firstType: string | undefined = undefined
                        let i = -1
                        for (const v of action.Arguments) {
                            i++; if (i == 0) {continue} //skip the variable used to get return results
                            
                            let type = GetType(v)
                            if (firstType == undefined) {
                                firstType = type
                            }
                            else if (type != firstType) {
                                return "any"
                            }
                        }
                        return firstType || "any"
                    case "CellularNoise":
                        return getValueOfTag("Return Type") == "Origin" ? "vec" : "num"
                }
            }
        }

        if (action.Block == "call_func") {
            return environment.funcReturnTypes[action.Action] ?? "any"
        }

        if (AD.DFActionMap[action.Block] && AD.DFActionMap[action.Block]![action.Action]) {
            return AD.DFActionMap[action.Block]![action.Action]?.ReturnType!
        } else {
            return null
        }
    }

    function NewTempVar(type: string | undefined): VariableItem {
        tempVarCounter++
        let varitem = new VariableItem(null, "line", `${TC_HEADER}REG_${tempVarCounter}`)
        varitem.IsTemporary = true
        SetVarType(varitem,type)
        return varitem
    }

    function GetType(item: CodeItem | null): string {
        if (item == null) {
            return "none"
        } else if (item instanceof GameValueItem) {
            return AD.DFGameValueMap[item.Value]!.ReturnType || "any"
        } else if (item instanceof VariableItem) {
            if (item.StoredType) {
                return item.StoredType
            } else {
                return CombinedVarContext.VariableTypes[item.Scope][item.Name] || "any"
            }
        } else {
            return item.itemtype
        }
    }


    //make sure to call this AFTER the new domain is pushed
    function ApplyIfStatementTypeInferences(action: IfActionBlock) {
        let variable = action.Arguments[0] as VariableItem
        if (!(variable instanceof VariableItem)) {return}

        switch (action.Action) {
            case "VarIsType":
                let option = action.Tags[0].Option
                SetVarType(variable,
                    option == "Number" ? "num" :
                    option == "String" ? "str" :
                    option == "Styled Text" ? "txt" :
                    option == "Location" ? "loc" :
                    option == "Item" ? "item" :
                    option == "List" ? "list" :
                    option == "Potion effect" ? "pot" :
                    option == "Particle" ? "par" : 
                    option == "Vector" ? "vec" :
                    option == "Dictionary" ? "dict" : "any"
                )
                return
            case "=":
                let varType: string | undefined = undefined
                //figure out what type the chest args are
                for (let i = 1; i < action.Arguments.length; i++) {
                    let type = GetType(action.Arguments[i])
                    if (!varType) {
                        varType = type
                    } else if (varType != type || type == "any") {
                        //if the types of values to compare to are mixed then just dont do anything
                        return null
                    }
                }
                SetVarType(variable,varType!)
        }
    }

    const ITEM_PARAM_DEFAULTS = {
        loc: {
            Pitch: new NumberItem([],"0"),
            Yaw: new NumberItem([],"0")
        },
        snd: {
            Volume: new NumberItem([],"1"),
            Pitch: new NumberItem([],"1"),
            Variant: null
        },
        pot: {
            Amplifier: new NumberItem([],"1"),
            Duration: new NumberItem([],"1000000")
        },
        item: {
            Count: new NumberItem([],"1"),
        },
        par: {
            Amount: new NumberItem([],"1"),
            Motion: new VectorItem([], 1, 0, 0),
            "Motion Variation": new NumberItem([],"100"),
            Color: new StringItem([],"#FF0000"),
            "Fade Color": new StringItem([],"#000000"),
            "Color Variation": new NumberItem([],"0"),
            Material: new StringItem([],"oak_log"),
            Size: new NumberItem([], "1"),
            "Size Variation": new NumberItem([], "0"),
            Roll: new NumberItem([], "0"),
            Opacity: new NumberItem([],"100")
        }
    }

    const PARTICLE_FIELD_TYPES = {
        Amount: "num",
        Motion: "vec",
        "Motion Variation": "num",
        Color: "str",
        "Fade Color": "str",
        "Color Variation": "num",
        Material: "str",
        Size: "num",
        "Size Variation": "num",
        Roll: "num",
        Opacity: "num",
    }

    //takes in a Token from the parser and converts it to a CodeItem
    //codeBlock[] is the code generated to create the item and should generally be pushed right after this function is called
    function ToItem(token: Token): [CodeBlock[],CodeItem] {
        let code: CodeBlock[] = []
        let variableComponents: string[] = []

        function err(error: any) {
            if (!environment.skipConstructorValidation) {
                throw error
            }
        }

        function solveArg(expr: ExpressionToken,paramName: string,type: string, variableComponentsList: any[] = variableComponents): [CodeBlock[],CodeItem] {
            let solved = SolveExpression(expr)
            //if code was required to generate this component
            if (solved[0].length > 0) {
                code.push(...solved[0])
                variableComponentsList.push(paramName)
            }
            //if this component is a variable
            if (solved[1] instanceof VariableItem) {
                variableComponentsList.push(paramName)
            }


            //if this component is a %mathing number
            if ((type == "num" || type == "any") && solved[1] instanceof NumberItem && Number.isNaN(Number(solved[1].Value))) {
                variableComponentsList.push(paramName)
            }

            //if this string is doing %var
            //% to detect strings doing %var() feels really hacky and is probably gonna break 
            //but as of right now there aren't any sounds with % in the name so i do not care
            if (type == "str" && solved[1] instanceof StringItem && solved[1].Value.includes("%")) {
                variableComponentsList.push(paramName)
            }


            let resultType = GetType(solved[1])
            if (resultType != type && type != "any") {
                err(new TCError(`Expected ${type} for ${paramName}, got ${resultType}`,0,expr.CharStart,expr.CharEnd))
            }
            return [solved[0],solved[1]]
        }

        if (token instanceof NumberToken) {
            return [code,new NumberItem([token.CharStart,token.CharEnd],token.Number)]
        }
        else if (token instanceof StringToken) {
            return [code,new StringItem([token.CharStart,token.CharEnd],token.String)]
        }
        else if (token instanceof VariableToken) {
            return [code,new VariableItem([token.CharStart,token.CharEnd],VALID_VAR_SCOPES[token.Scope]!,token.Name, token.Type)]
        } 
        //location
        else if (token instanceof LocationToken) {
            let components: Dict<any> = {}

            //error for too many args
            if (token.RawArgs.length > 5) {
                err(new TCError(`Location takes at most 5 arguments, ${token.RawArgs.length} were provided instead`, 3, token.CharStart, token.CharEnd))
            }

            for (const component of ["X","Y","Z","Pitch","Yaw"]) {
                //defaults
                let defaultValue = ITEM_PARAM_DEFAULTS.loc[component]
                if (!token[component]) {
                    if (defaultValue !== undefined) {
                        components[component] = defaultValue
                        continue
                    } else { 
                        err(new TCError(`Location is missing ${component} coordinate`,0,token.CharStart,token.CharEnd))
                    }
                }

                let solved = solveArg(token[component],component,"num")
                components[component] = solved[1]
            }

            if (variableComponents.length > 0) {
                let returnVar = NewTempVar("loc")
                code.push(
                    new ActionBlock("set_var","SetAllCoords",[returnVar,components.X,components.Y,components.Z,components.Pitch,components.Yaw],[new TagItem([],"Coordinate Type","Plot coordinate","set_var","SetAllCoords")])
                )
                return [code,returnVar]
            } else {
                return [code,new LocationItem([token.CharStart,token.CharEnd],components.X.Value,components.Y.Value,components.Z.Value,components.Pitch.Value,components.Yaw.Value)]
            }
        //vector
        } else if (token instanceof VectorToken) {
            let components: Dict<any> = {}

            if (token.RawArgs.length > 3) {
                err(new TCError(`Vector takes at most 3 arguments, ${token.RawArgs.length} were provided instead`, 0, token.CharStart, token.CharEnd))
            }
            
            let i = 0
            for (const component of ["X","Y","Z"]) {
                if (token.RawArgs[i] == null) { err(new TCError(`Vector is missing ${component} coordinate`, 3, token.CharStart, token.CharEnd)) }

                let solved = solveArg(token[component],component,"num")
                components[component] = solved[1]
                i++
            }

            if (variableComponents.length > 0) {
                let returnVar = NewTempVar("vec")
                code.push(
                    new ActionBlock("set_var","Vector",[returnVar,components.X,components.Y,components.Z])
                )
                return [code,returnVar]
            } else {
                return [code, new VectorItem([token.CharStart,token.CharEnd],components.X.Value,components.Y.Value,components.Z.Value)]
            }
        //sound
        } else if (token instanceof SoundToken) {
            let components: Dict<any> = {}

            //error handling
            if (token.RawArgs.length > 4) {
                err(new TCError(`Sound takes at most 4 arguments, ${token.RawArgs.length} were provided instead`, 3, token.CharStart, token.CharEnd))
            }
            if (token.RawArgs[0] == null) {
                err(new TCError("Sound must specify an ID (str)", 2, token.CharStart, token.CharEnd))
            }

            for (const component of ["SoundId","Volume","Pitch","Variant"]) {
                //defaults
                let defaultValue = ITEM_PARAM_DEFAULTS.snd[component]
                if (defaultValue !== undefined && !token[component]) { 
                    components[component] = defaultValue
                    continue
                }

                let solved = solveArg(token[component],component,(component == "SoundId" || component == "Variant") ? "str" : "num")
                components[component] = solved[1]
            }

            //error for trying to apply key to custom sound
            if (token.IsCustom && components.Variant) {
                err(new TCError(`Custom sounds cannot specify variant`,0,token.CharStart,token.CharEnd))
            }

            let item = new SoundItem([token.CharStart,token.CharEnd],null,null,1,1)
            let tempVar = NewTempVar("snd")
            let latestItem: SoundItem | VariableItem = item

            //i totally dont need to be repeating code here but im lazy

            //if sound id needs to be set with code
            if (variableComponents.includes("SoundId")) {
                code.push(
                    token.IsCustom ? new ActionBlock("set_var","SetCustomSound",[tempVar,latestItem,components.SoundId]) :
                    new ActionBlock("set_var","SetSoundType",[tempVar,latestItem,components.SoundId])
                )
                latestItem = tempVar
                item[token.IsCustom ? "CustomKey" : "SoundId"] = "Pling"
            } else {
                //error for invalid sound id
                if (!token.IsCustom && !AD.Sounds.has(components.SoundId.Value)) {
                    err(new TCError(`Invalid sound type '${components.SoundId.Value}'`,0,token.SoundId!.CharStart,token.SoundId!.CharEnd))
                }
                item[token.IsCustom ? "CustomKey" : "SoundId"] = components.SoundId.Value
            }

            //if pitch needs to be set with code
            if (variableComponents.includes("Pitch")) {
                code.push(new ActionBlock("set_var","SetSoundPitch",[tempVar,latestItem,components.Pitch]))
                latestItem = tempVar
            } else {
                item.Pitch = Number(components.Pitch.Value)
            }

            //if volume needs to be set with code
            if (variableComponents.includes("Volume")) {
                code.push(new ActionBlock("set_var","SetSoundVolume",[tempVar,latestItem,components.Volume]))
                latestItem = tempVar
            } else {
                item.Volume = Number(components.Volume.Value)
            }

            //if variant needs to be set with code
            if (variableComponents.includes("Variant")) {
                code.push(new ActionBlock("set_var","SetSoundVariant",[tempVar,latestItem,components.Variant]))
                latestItem = tempVar
            } else if (components.Variant) {
                //error for invalid variant id
                if (!token.IsCustom && !variableComponents.includes("SoundId") && !AD.SoundVariants[AD.SoundInternalIds?.[components.SoundId.Value!]!]?.includes(components.Variant.Value)) {
                    err(new TCError(`Invalid variant '${components.Variant.Value}' for sound '${components.SoundId.Value}'`,0,token.Variant!.CharStart,token.Variant!.CharEnd))
                }
                item.Variant = components.Variant.Value
            }

            return [code,latestItem]
        }
        //game value
        else if (token instanceof GameValueToken) {
            let domain: Domain = DomainList[token.Target || "game"]!

            //error for invalid value
            if (domain.Values[token.Value] == undefined) {
                if (domain instanceof TargetDomain) {
                    if (domain.SupportsGameValues == false) {
                        //throw special error if this domain doesnt support game values
                        err(new TCError(`Target '${domain.Identifier}' does not support game values`, 2, token.Segments.valueName![0], token.Segments.valueName![1]))
                        //throw special error if this gv is valid for players but not entities and the target is an entity
                    } else if (!AD.TCEntityGameValues[token.Value] && domain.ActionType == "entity") {
                        err(new TCError(`Invalid entity game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1]))
                    } else {
                        err(new TCError(`Invalid targeted game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1]))
                    }
                }
                else {
                    if (domain.Identifier == "game") {
                        //throw special error for game game values
                        err(new TCError(`Invalid game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1]))
                    } else {
                        err(new TCError(`'${domain.Identifier}' does not contain value '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1]))
                    }
                }
            }

            return [code, new GameValueItem([token.CharStart,token.CharEnd],
                //DomainList[token.Target as string]!.Values[token.Value],
                AD.TCGameValueMap[token.Value]!.DFId,
                token.Target == "game" ? "Default" : TargetDomains[token.Target!].Target
            )]
        }
        //styled text
        else if (token instanceof TextToken) {
            return [code, new TextItem([token.CharStart,token.CharEnd],token.Text)]
        }
        //potion
        else if (token instanceof PotionToken) {
            let components: Dict<any> = {}

            //error for missing potion type
            if (!token.Potion) {
                err(new TCError(`Potion effect must specify a type (str)`,0,token.CharStart,token.CharEnd))
            }

            for (const component of ["Potion","Amplifier","Duration"]) {
                //defaults
                let defaultValue = ITEM_PARAM_DEFAULTS.pot[component]
                if (defaultValue !== undefined && !token[component]) { 
                    components[component] = defaultValue
                    continue
                }

                let solved = solveArg(token[component],component,component == "Potion" ? "str" : "num")
                components[component] = solved[1]
            }
            
            let item = new PotionItem([token.CharStart,token.CharEnd],"Absorption",0,0)
            let tempVar = NewTempVar("pot")
            let latestItem: PotionItem | VariableItem = item

            //if potion type needs to be set with code
            if (variableComponents.includes("Potion")) {
                code.push(
                    new ActionBlock("set_var","SetPotionType",[tempVar,latestItem,components.Potion])
                )
                latestItem = tempVar
            } else {
                item.Potion = components.Potion.Value
            }

            //if amp needs to be set with code
            if (variableComponents.includes("Amplifier")) {
                code.push(
                    new ActionBlock("set_var","SetPotionAmp",[tempVar,latestItem,components.Amplifier])
                )
                latestItem = tempVar
            } else {
                //potion item data uses ids starting at 0 for some reason so when amplifier is compiled
                //into an item the provided value has to be bumped down by 1
                item.Amplifier = components.Amplifier.Value - 1
            }

            //if dur needs to be set with code
            if (variableComponents.includes("Duration")) {
                code.push(
                    new ActionBlock("set_var","SetPotionDur",[tempVar,latestItem,components.Duration])
                )
                latestItem = tempVar
            } else {
                item.Duration = components.Duration.Value
            }
            
            return [code,latestItem]
        }
        //items
        else if (token instanceof ItemToken) {
            let components: Dict<any> = {}
            let item: ItemItem | VariableItem = new ItemItem([token.CharStart,token.CharEnd],"minecraft:stone",1)
            let tempVar = NewTempVar("item")
            let latestItem: ItemItem | VariableItem = item

            if (token.Mode == "library") {
                // error for missing fields
                if (!token.Library) {
                    err(new TCError(`Library item must specify a library id (str)`,0,token.CharStart,token.CharEnd))
                }
                if (!token.Id) {
                    err(new TCError(`Library item must specify an item id (str)`,0,token.CharStart,token.CharEnd))
                }
                
                for (const component of ["Library","Id","Count"]) {
                    let defaultValue = ITEM_PARAM_DEFAULTS.item[component]
                    if (defaultValue !== undefined && !token[component]) { 
                        components[component] = defaultValue
                        continue
                    }

                    let solved = solveArg(token[component],component,component == "Count" ? "num" : component == "Id" ? "any" : "str")
                    components[component] = solved[1]
                }
                //make sure stuff actually exists
                let library = environment.itemLibraries?.[components.Library.Value]
                if (!library && !variableComponents.includes("Library")) {
                    err(new TCError(`Invalid library id '${components.Library.Value}'`,0,token.Library?.CharStart!,token.Library?.CharEnd!))
                }
                let itemData = library?.items?.[components.Id.Value]
                if (library && !itemData && !variableComponents.includes("Id")) {
                    err(new TCError(`Invalid item id '${components.Id.Value}' for library '${components.Library.Value}'`,0,token.Id?.CharStart!,token.Id?.CharEnd!))
                }

                //insert by variable
                if (library?.compilationMode == "insertByVar" || variableComponents.includes("Library") || variableComponents.includes("Id")) {
                    let values = {
                        "Library": "",
                        "Id": ""
                    }
                    for (const field of ["Library","Id"]) {
                        if (components[field] instanceof VariableItem) {
                            if (components[field].Scope == "line") {
                                values[field] = `%var(${components[field].Name})`
                            } else {
                                let tempVar = NewTempVar(undefined)
                                CodeLine.push(
                                    new ActionBlock("set_var","=",[tempVar,components[field]])
                                )
                                values[field] = `%var(${tempVar.Name})`
                            }
                        } else {
                            values[field] = components[field].Value
                        }
                    }
                    
                    item = new VariableItem([],"unsaved",`@__TC_ITEM:${values.Library}:${values.Id}`)
                    latestItem = item
                }
                //insert directly
                else {
                    item.Id = itemData?.material!
                    item.Nbt = itemData?.componentsString
                    item.DFNbt = itemData?.version!
                }

                //implement this AFTER the client mod is done
                // err(new TCError("Library items are not implemented yet",0,token.CharStart,token.CharEnd))
            } else {
                if (token.Nbt) { err(new TCError("NBT on item constructors is not implemented yet",0,token.Nbt.CharStart,token.Nbt.CharEnd))}


                for (const component of ["Id","Count"]) {
                    let defaultValue = ITEM_PARAM_DEFAULTS.item[component]
                    if (defaultValue !== undefined && !token[component]) { 
                        components[component] = defaultValue
                        continue
                    }

                    let solved = solveArg(token[component],component,component == "Count" ? "num" : "str")
                    components[component] = solved[1]
                }
                
                if (variableComponents.includes("Id")) {
                    code.push(
                        new ActionBlock("set_var","SetItemType",[tempVar,latestItem,components.Id])
                    )
                    latestItem = tempVar
                } else {
                    item.Id = components.Id.Value
                }

            }
            if (variableComponents.includes("Count") || item instanceof VariableItem) {
                if (components.Count.Value != 1) {
                    code.push(
                        new ActionBlock("set_var","SetItemAmount",[tempVar,latestItem,components.Count])
                    )
                    latestItem = tempVar
                }
            } else {
                let val = Number(components.Count.Value)
                //throw error for stack size being too high
                if (val > 99) {
                    err(new TCError("Stack size cannot be greater than 99",0,token.Count?.CharStart!,token.Count?.CharEnd!))
                }

                //throw error for non-integer stack size
                if (Math.floor(val) != val) {
                    err(new TCError("Stack size must be a whole number",0,token.Count?.CharStart!,token.Count?.CharEnd!))
                }

                item.Count = Number(val)
            }

            return [code,latestItem]
        }
        else if (token instanceof ParticleToken) {
            //error for missing particle type
            if (!token.Type) {
                err(new TCError(`Particle effect must specify a type (str)`,0,token.CharStart,token.CharEnd))
            }
            
            let item = new ParticleItem([token.CharStart,token.CharEnd],"Rain",{Amount: 1, HorizontalSpread: 0, VerticalSpread: 0},{})
            let tempVar = NewTempVar("par")
            let latestItem: ParticleItem | VariableItem = item
            
            //if particle type needs to be set with code
            let solvedType = solveArg(token.Type!,"Type","str")[1] as StringItem
            if (variableComponents.includes("Type")) {
                code.push(
                    new ActionBlock("set_var","SetParticleType",[tempVar,latestItem,solvedType])
                )
                latestItem = tempVar
            } else {
                //error for invalid particle type
                if (!AD.Particles[solvedType.Value]) {
                    err(new TCError(`Invalid particle type '${solvedType.Value}'`,0,token.Type!.CharStart,token.Type!.CharEnd))
                }

                item.Particle = solvedType.Value
            }

            //make sure data is just a dictionary (or at least peacefully non-existant)
            let data: DictionaryToken
            if (token.Data == null) {
                data = new DictionaryToken([],[],[])
            }
            else if (token.Data.Expression.length == 1 && token.Data.Expression[0] instanceof DictionaryToken) {
                data = token.Data.Expression[0]
            }
            else {
                err(new TCError("Particle data must be a compile-time constant dictionary",0,token.Data.CharStart,token.Data.CharEnd))
            }
            
            let fields: Dict<any> = {}
            let spread: ExpressionToken | null = null

            let validFields = AD.AllParticleFields
            if (solvedType instanceof StringItem && AD.Particles[solvedType.Value] != undefined) {
                validFields = AD.Particles[solvedType.Value]!.Fields
            }

            let i = -1
            for (const fieldExpression of data!.Keys) {
                i++; 
                if (!(fieldExpression.Expression.length == 1 && fieldExpression.Expression[0] instanceof StringToken)) {
                    err(new TCError("Particle data key must be a compile-time constant string",0,fieldExpression.CharStart,fieldExpression.CharEnd))
                }
                
                let key = (fieldExpression.Expression[0] as StringToken).String
                let value = data!.Values[i]

                //error for invalid key
                if (!validFields.includes(key)) {
                    if (solvedType instanceof StringItem) {
                        err(new TCError(`'${key}' is not a valid field of particle '${solvedType.Value}'`,0,fieldExpression.CharStart,fieldExpression.CharEnd))
                    }
                    else {
                        err(new TCError(`'${key}' is not a valid particle field`,0,fieldExpression.CharStart,fieldExpression.CharEnd))
                    }
                }

                //if type is variable then all par-specific fields must be set with code since their data gets stripped when applied to the default particle
                if (solvedType instanceof VariableItem && !(key == "Amount" || key == "Spread") && !variableComponents.includes(key)) {
                    variableComponents.push(key)
                }
                
                //spread has special handling since its represented as a list by tc but not df
                if (key == "Spread") {
                    spread = value
                    continue
                }

                let solved = solveArg(value,key,PARTICLE_FIELD_TYPES[key])
                fields[key] = solved[1]
            }

            //= start field parsing!! =\\

            // amount

            if (variableComponents.includes("Amount")) {
                code.push(
                    new ActionBlock("set_var","SetParticleAmount",[tempVar,latestItem,fields.Amount || ITEM_PARAM_DEFAULTS.par.Amount])
                )
                latestItem = tempVar
            } 
            else {
                item.Cluster.Amount = fields.Amount?.Value || ITEM_PARAM_DEFAULTS.par.Amount.Value
            }

            // motion

            if (variableComponents.includes("Motion") || variableComponents.includes("Motion Variation")) {
                item.Data.x = 0
                item.Data.y = 0
                item.Data.z = 0
                item.Data.motionVariation = 0
                code.push(
                    new ActionBlock("set_var","SetParticleMotion",[tempVar,latestItem,fields.Motion || ITEM_PARAM_DEFAULTS.par.Motion, fields["Motion Variation"] || ITEM_PARAM_DEFAULTS.par["Motion Variation"]])
                )
                latestItem = tempVar
            }
            else {
                let motion = ITEM_PARAM_DEFAULTS.par.Motion
                if (fields.Motion) {
                    motion = fields.Motion
                }
                item.Data.x = motion.X
                item.Data.y = motion.Y
                item.Data.z = motion.Z

                item.Data.motionVariation = fields["Motion Variation"]?.Value || ITEM_PARAM_DEFAULTS.par["Motion Variation"].Value
            }

            // color

            if (variableComponents.includes("Color") || variableComponents.includes("Color Variation")) {
                item.Data.rgb = 0
                item.Data.colorVariation = 0
                code.push(
                    new ActionBlock("set_var","SetParticleColor",[tempVar,latestItem,fields.Color || ITEM_PARAM_DEFAULTS.par.Color,fields["Color Variation"] || ITEM_PARAM_DEFAULTS.par["Color Variation"]])
                )

                latestItem = tempVar
            }
            else {
                item.Data.rgb = IntegerizeHexColor(fields["Color"] || ITEM_PARAM_DEFAULTS.par.Color)
                item.Data.colorVariation = fields["Color Variation"]?.Value || ITEM_PARAM_DEFAULTS.par["Color Variation"].Value
            }

            // fade color

            if (variableComponents.includes("Fade Color")) {
                item.Data.rgb_fade = 0
                code.push(
                    new ActionBlock("set_var","SetParticleFade",[tempVar,latestItem,fields["Fade Color"] || ITEM_PARAM_DEFAULTS.par["Fade Color"]])
                )

                latestItem = tempVar
            }
            else {
                item.Data.rgb_fade = IntegerizeHexColor(fields["Fade Color"] || ITEM_PARAM_DEFAULTS.par["Fade Color"])
            }

            // material

            if (variableComponents.includes("Material")) {
                item.Data.material = "oak_log"
                code.push(
                    new ActionBlock("set_var","SetParticleMat",[tempVar,latestItem,fields.Material || ITEM_PARAM_DEFAULTS.par.Material])
                )

                latestItem = tempVar
            }
            else {
                item.Data.material = fields.Material?.Value || ITEM_PARAM_DEFAULTS.par.Material.Value
            }

            // size

            if (variableComponents.includes("Size") || variableComponents.includes("Size Variation")) {
                item.Data.size = 0
                item.Data.sizeVariation = 0
                code.push( 
                    new ActionBlock("set_var","SetParticleSize",[tempVar,latestItem,fields.Size || ITEM_PARAM_DEFAULTS.par.Size,fields["Size Variation"] || ITEM_PARAM_DEFAULTS.par["Size Variation"]])
                )

                latestItem = tempVar
            }
            else {
                item.Data.size = fields.Size?.Value || ITEM_PARAM_DEFAULTS.par.Size.Value
                item.Data.sizeVariation = fields["Size Variation"]?.Value || ITEM_PARAM_DEFAULTS.par["Size Variation"].Value
            }

            // roll
            
            if (variableComponents.includes("Roll")) {
                item.Data.roll = 0
                code.push(
                    new ActionBlock("set_var","SetParticleRoll",[tempVar,latestItem,fields.Roll || ITEM_PARAM_DEFAULTS.par.Roll])
                )

                latestItem = tempVar
            }
            else {
                item.Data.roll = fields.Roll?.Value || ITEM_PARAM_DEFAULTS.par.Roll.Value
            }

            // opacity

            if (variableComponents.includes("Opacity")) {
                item.Data.opacity = 10
                code.push(
                    new ActionBlock("set_var","SetParticleOpac",[tempVar,latestItem,fields.Opacity || ITEM_PARAM_DEFAULTS.par.Opacity])
                )

                latestItem = tempVar
            }
            else {
                item.Data.opacity = fields.Opacity?.Value ?? ITEM_PARAM_DEFAULTS.par.Opacity.Value
            }

            if (spread == null) {
                item.Cluster.HorizontalSpread = 0
                item.Cluster.VerticalSpread = 0
            }
            else {
                let list = spread.Expression[0] as ListToken
                let spreadVariableComponents: number[] = [];

                //validation
                if (!(spread.Expression.length == 1 && list instanceof ListToken)) {
                    if (list instanceof VariableToken) {
                        err(new TCError("Expected list [horizontal, vertical] for spread (the list itself cannot yet be a variable, however min and max can be variables)",0,spread.CharStart,spread.CharEnd)) 
                    } else if (list instanceof ExpressionToken && list.Expression.length == 1 && list.Expression[0] instanceof ListToken) {
                        err(new TCError("Expected list [horizontal, vertical] for spread (the list cannot be wrapped in parentheses because i'm too lazy to actually parse it and you should know better. in fact shame on you for even trying. i hope you waste the next 30 minutes parkouring on your compiled code.)",0,spread.CharStart,spread.CharEnd)) 
                    } else {
                        err(new TCError(`Expected list [horizontal, vertical] for spread`,0,spread.CharStart,spread.CharEnd)) 
                    }
                }
                if (list.Items.length != 2 || list.Items[0] == null || list.Items[1] == null) {
                    err(new TCError(`Spread list must contain 2 values, ${list.Items.length} were provided`,0,spread.CharStart,spread.CharEnd))
                }

                //solve
                let horizontal = solveArg(list.Items[0]!,"Horizontal Spread", "num",spreadVariableComponents)[1] as NumberItem
                let vertical = solveArg(list.Items[1]!,"Vertical Spread", "num",spreadVariableComponents)[1] as NumberItem

                //apply
                if (spreadVariableComponents.length > 0) {
                    code.push(
                        new ActionBlock("set_var","SetParticleSprd",[tempVar,latestItem,horizontal,vertical])
                    )

                    latestItem = tempVar
                } else {
                    item.Cluster.HorizontalSpread = Number(horizontal.Value)
                    item.Cluster.VerticalSpread = Number(vertical.Value)
                }
            }

            return [code,latestItem]
        }
        //lists
        else if (token instanceof ListToken) {
            let returnVar = NewTempVar("list")

            let currentAction = "CreateList"
            let currentChest: CodeItem[] = [returnVar]

            //max of 27 items in a chest; one slot has to be the variable 
            //and this number is decremented by one because lists start at 0 in js
            
            let i = -1 //curent index in the list token
            for (let expression of token.Items) {
                i++
                if (expression == null) { continue }
                let expressionResults = SolveExpression(expression)
                code.push(...expressionResults[0])
                currentChest.push(expressionResults[1])

                //if the current action's chest is full, push it and start a new action
                if (currentChest.length >= 27) {
                    code.push(new ActionBlock("set_var",currentAction,currentChest))
                    currentAction = "AppendValue"
                    currentChest = [returnVar]
                }
            }

            //push final creation/append action
            code.push(new ActionBlock("set_var",currentAction,currentChest))

            return [code, returnVar]
        }
        //dictionaries
        else if (token instanceof DictionaryToken) {
            let keyListResults = ToItem(new ListToken([],token.Keys))
            code.push(...keyListResults[0])

            let valueListResults = ToItem(new ListToken([],token.Values))
            code.push(...valueListResults[0])

            let returnVar = NewTempVar("dict")
            code.push(
                new ActionBlock("set_var","CreateDict",[returnVar,keyListResults[1],valueListResults[1]])
            )

            return [code, returnVar]
        }
        
        process.stderr.write(JSON.stringify(token))
        throw new Error("Could not convert token to item")
    }

    //operations
    function OPR_NumOnNum(left, right, opr: string, blockopr: string): [CodeBlock[],CodeItem] {
        //if at least one thing is a variable
        if (left instanceof VariableItem || right instanceof VariableItem || left instanceof GameValueItem || right instanceof GameValueItem) {
            let leftIsLine = (left instanceof VariableItem && left.Scope == "line")
            let rightIsLine = (right instanceof VariableItem && right.Scope == "line")

            //%conditions where %math is supported
            if (leftIsLine && rightIsLine) {
                let item: NumberItem = new NumberItem([left.CharStart, right.CharEnd], `%math(%var(${left.Name})${opr}%var(${right.Name}))`)
                if (left.IsTemporary) {item.TempVarEquivalent = left.Name}
                return [[], item]
            }
            else if (leftIsLine && right instanceof NumberItem) {
                let item: NumberItem = new NumberItem([left.CharStart, right.CharEnd], `%math(%var(${left.Name})${opr}${right.Value})`)
                if (left.IsTemporary) {item.TempVarEquivalent = left.Name}
                return [[], item]
            }
            else if (left instanceof NumberItem && rightIsLine) {
                let item = new NumberItem([left.CharStart, right.CharEnd], `%math(${left.Value}${opr}%var(${right.Name}))`)
                if (left.TempVarEquivalent) {item.TempVarEquivalent = left.TempVarEquivalent}
                return [[], item]
            }

            //otherwise use set var


            let returnvar = NewTempVar("num")
            let code = new ActionBlock("set_var", blockopr, [returnvar, left, right],blockopr == "%" ? [new TagItem([],"Remainder Mode","Modulo","set_var","%")] : [] )
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
        return [[], new StringItem([left.CharStart,left.CharEnd], `${left.Value}${right.Value}`)]
    }

    function OPR_TextAdd(left, right): [CodeBlock[],CodeItem] {
        //if either left or right is a variable
        //or if either left or right aren't strings
        if (
            (left instanceof VariableItem || !(left instanceof TextItem || left instanceof StringItem)) || 
            (right instanceof VariableItem || !(right instanceof TextItem || right instanceof StringItem))
        ) {
            let returnvar = NewTempVar("txt")
            let code = new ActionBlock("set_var", "StyledText", [returnvar, left, right])
            return [[code], returnvar]
        }

        //otherwise just combine the two values
        return [[], new TextItem([left.CharStart,left.CharEnd], `${left.Value}${right.Value}`)]
    }

    function OPR_VecMultVec(left, right, opr: string): [CodeBlock[], CodeItem] {
        let components: Dict<any> = {}
        let code: CodeBlock[] = []
        for (const component of ["X","Y","Z"]) {
            //remember to exclude 1!!

            //get the component of left vector
            let leftCompVar: VariableItem | NumberItem | GameValueItem
            //if left vector is a variabl;e
            if (left instanceof VariableItem || left instanceof GameValueItem) {
                leftCompVar = NewTempVar("num")
                code.push(
                    new ActionBlock("set_var","GetVectorComp",[leftCompVar,left],[new TagItem([],"Component",component,"set_var","GetVectorComp")])
                )
            //if left vector is a constant
            } else {
                leftCompVar = new NumberItem([],left[component])
            }

            //get the component of right vector
            let rightCompVar: VariableItem | NumberItem | GameValueItem
            //if right vector is a variable
            if (right instanceof VariableItem || right instanceof GameValueItem) {
                rightCompVar = NewTempVar("num")
                code.push(
                    new ActionBlock("set_var","GetVectorComp",[rightCompVar,right],[new TagItem([],"Component",component,"set_var","GetVectorComp")])
                )
            //if right vector is a constant
            } else {
                rightCompVar = new NumberItem([],right[component])
            }


            //multiply them together
            let multiplyResults = OPERATIONS.num[opr].num(leftCompVar,rightCompVar)
            //push any code generated by multiplication
            if (multiplyResults[0]) { code.push(...multiplyResults[0]) }

            components[component] = multiplyResults[1]
        }

        let returnVar = NewTempVar("vec")
        //set vec block
        code.push(
            new ActionBlock("set_var","Vector",[returnVar,components.X,components.Y,components.Z])
        )

        return [code,returnVar]
    }

    const OPERATIONS = {
        num: {
            "+": {
                num: function(left, right): [CodeBlock[],CodeItem] {
                    return OPR_NumOnNum(left,right,"+","+")
                },
                str: OPR_StringAdd,
                txt: OPR_TextAdd
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
            "%": {
                num: function(left, right): [CodeBlock[],CodeItem] {
                    return OPR_NumOnNum(left,right,"%","%")
                }
            },
            "^": {
                num: function(left, right): [CodeBlock[],CodeItem] {
                    //if both sides are just constant numbers
                    if (!isNaN(left.Value) && !isNaN(right.Value)) {
                        return [[],new NumberItem([left.CharStart,left.CharEnd],String(Number(left.Value) ** Number(right.Value)) )]
                    }

                    let returnVar = NewTempVar("num")
                    let code = new ActionBlock("set_var","Exponent",[returnVar,left,right])

                    return [[code],returnVar]
                }
            }
        },
        str: {
            "+": {
                str: OPR_StringAdd,
                num: OPR_StringAdd,
                txt: OPR_TextAdd
            },
            "*": {
                num: function(left, right): [CodeBlock[], CodeItem] {
                    let returnvar = NewTempVar("str")
                    let code = new ActionBlock("set_var","RepeatString",[returnvar,left,right])

                    return [[code],returnvar]
                }
            }
        },
        loc: {
            "+": {
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    let returnVar = NewTempVar("loc")
                    let code = new ActionBlock("set_var","ShiftOnVector",[returnVar,left,right],[new TagItem([],"Add Location Rotation","False","set_var","ShiftOnVector")])

                    return [[code],returnVar]
                },
                txt: OPR_TextAdd
            },
            "-": {
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    let code: CodeBlock[] = []
                    let returnVar = NewTempVar("loc")

                    //multiply vector by -1
                    let vecResults = OPERATIONS.vec["*"].num(right,new NumberItem([],"-1"))
                    if (vecResults[0]) {code.push(...vecResults[0])}

                    code.push(
                        new ActionBlock("set_var","ShiftOnVector",[returnVar,left,vecResults[1]],[new TagItem([],"Add Location Rotation","False","set_var","ShiftOnVector")])
                    )

                    return [code,returnVar]
                },
            }
        },
        vec: {
            "+": {
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    let returnVar = NewTempVar("vec")
                    let code = new ActionBlock("set_var","AddVectors",[returnVar,left,right])

                    return [[code], returnVar]
                },
                txt: OPR_TextAdd
            },
            "-": {
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    let returnVar = NewTempVar("vec")
                    let code = new ActionBlock("set_var","SubtractVectors",[returnVar,left,right])

                    return [[code], returnVar]
                },
            },
            "*": {
                num: function(left, right): [CodeBlock[], CodeItem] {
                    let returnVar = NewTempVar("vec")
                    let code = new ActionBlock("set_var","MultiplyVector",[returnVar,left,right])

                    return [[code], returnVar]
                },
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    return OPR_VecMultVec(left,right,"*")
                }
            },
            "/": {
                num: function(left, right): [CodeBlock[],CodeItem] {
                    right = new VectorItem(right.meta,right.Value,right.Value,right.Value)
                    return OPR_VecMultVec(left,right,"/")
                },
                vec: function(left, right): [CodeBlock[], CodeItem] {
                    return OPR_VecMultVec(left,right,"/")
                }
            }
        },
        snd: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        pot: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        par: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        list: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        dict: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        item: {
            "+": {
                txt: OPR_TextAdd
            }
        },
        txt: {
            "+": {
                num: OPR_TextAdd,
                str: OPR_TextAdd,
                txt: OPR_TextAdd,
                loc: OPR_TextAdd,
                vec: OPR_TextAdd,
                snd: OPR_TextAdd,
                pot: OPR_TextAdd,
                par: OPR_TextAdd,
                list: OPR_TextAdd,
                dict: OPR_TextAdd,
                item: OPR_TextAdd
            }
        }
    }

    const OrderOfOperations = [
        ["^"],
        ["*","/","%"],
        ["+","-"],
        ["==", "!=", "<", ">", "<=", ">="],
    ]

    function SolveExpression(exprToken: ExpressionToken): [CodeBlock[], CodeItem] {
        let code: CodeBlock[] = []
        let expression: (Token | CodeItem)[] = []

        //initial validation
        for (let i = 0; i < exprToken.Expression.length; i++ ){
            const token = exprToken.Expression[i]
            if (token instanceof OperatorToken) {
                if (i == 0){ 
                    throw new TCError(`Expressions cannot begin with '${token.Operator}'`,0,token.CharStart,token.CharEnd)
                }
                if (i == exprToken.Expression.length - 1) {
                    throw new TCError(`Expressions cannot end on '${token.Operator}'`,0,token.CharStart,token.CharEnd)
                }
                if (exprToken.Expression[i-1] instanceof OperatorToken) {
                    throw new TCError(`Expected value following '${(exprToken.Expression[i-1] as OperatorToken).Operator}', got '${token.Operator}'`,0,token.CharStart,token.CharEnd)
                }
            }
            else if (token instanceof TypeOverrideToken) {
                if (!(exprToken.Expression[i-1] instanceof ActionToken || exprToken.Expression[i-1] instanceof IndexerToken)) {
                    throw new TCError("Invalid type override placement",0,token.CharStart,token.CharEnd)
                }
            }
            else if (!(token instanceof IndexerToken) && exprToken.Expression.length > i + 1 && !(exprToken.Expression[i+1] instanceof OperatorToken || exprToken.Expression[i+1] instanceof TypeOverrideToken || exprToken.Expression[i+1] instanceof IndexerToken)) {
                throw new TCError("Expected operator between values",0,exprToken.CharStart,exprToken.Expression[i+1].CharEnd)
            }
        }

        //if an index is present as a key in here, item conversion will skip it
        let skipIndexes: Dict<boolean> = {}

        //special case for action if statements
        if (exprToken.Expression.length == 1 && exprToken.Expression[0] instanceof ActionToken && exprToken.Expression[0].Type == "comparison") {
            let action = exprToken.Expression[0] as ActionToken
            let domain = DomainList[action.DomainId]!

            ActionNameErrorChecks(domain,action)

            let codeblock = "if_var"
            if (domain instanceof TargetDomain) {
                codeblock = domain.ActionType == "player" ? "if_player" : "if_entity"
            }
            else if (domain?.Identifier == "game") {
                codeblock = "if_game"
            }

            let args
            if (action.Params) {
                let argResults = SolveArgs(action.Params)
                code.push(...argResults[0])
                args = argResults[1]
            }

            let tags
            if (action.Tags) {
                let tagResults = SolveTags(action.Tags, codeblock, domain.Conditions[action.Action]!.DFId)
                code.push(...tagResults[0])
                tags = tagResults[1]
            }

            code.push(
                new IfActionBlock(codeblock, domain.Conditions[action.Action]!.DFId, args, tags, domain instanceof TargetDomain ? domain.Target : null, exprToken.Not)
            )

            return [code,expression[0]]
        }

        //convert expression tokens to code items and solve stuff like actions and indexing
        let i = -1;
        for (const token of exprToken.Expression) {
            i++
            if (skipIndexes[i]) {continue}

            //type override token in a place type override tokens should not be
            if (token instanceof TypeOverrideToken) {
                throw new TCError("Type override must immediately follow an action, variable, or index operation",0,token.CharStart,token.CharEnd)
            }
            else if (token instanceof OperatorToken) {
                expression.push(token)
            } else if (token instanceof ExpressionToken) {
                //solve sub expression
                let results = SolveExpression(token)
                code.push(...results[0])
                expression[i] = results[1]
            } else if (token instanceof IndexerToken) {
                let referrent = expression[expression.length-1]
                //error for indexing something thats not even an item
                if (!(referrent instanceof CodeItem)) {
                    throw new TCError("Indexer must immediately follow a list, dictionary, or variable",0,token.CharStart,token.CharEnd)
                }

                //solve expression for index to use
                let expressionResults = SolveExpression(token.Index)
                code.push(...expressionResults[0])

                //handle provided type override
                let returnType: string | undefined = undefined
                let typeOverrideToken = exprToken.Expression[i + 1]
                if (typeOverrideToken instanceof TypeOverrideToken) {
                    returnType = typeOverrideToken.Type
                    skipIndexes[i + 1] = true
                }

                let tempVar = NewTempVar(returnType)

                let referrentType = GetType(referrent)
                code.push(
                    new ActionBlock("set_var",referrentType == "list" ? "GetListValue" : "GetDictValue",[tempVar,referrent,expressionResults[1]])
                )
                //replace the list variable with the value variable
                expression[expression.length-1] = tempVar
            } else if (token instanceof ActionToken) {
                //convert action token to code block
                let action = token
                let domain: Domain = DomainList[action.DomainId]!
                
                ActionNameErrorChecks(domain,action)
                
                //arguments
                //a temporary variable is automatically inserted as the first chest slot to get the returned value of the function
                let tempVar = NewTempVar("num")//num is just a placeholder type and is reassigned after return type is gotten
                
                let args: (CodeItem | null)[] = [tempVar] 
                if (action.Params) {
                    let argResults = SolveArgs(action.Params)
                    code.push(...argResults[0])
                    args.push(...argResults[1])
                }

                //tags
                let tags
                if (action.Tags) {
                    let tagResults = SolveTags(action.Tags,domain.ActionCodeblock!,domain.Actions[action.Action]!.DFId)
                    code.push(...tagResults[0])
                    tags = tagResults[1]
                }

                
                let actionBlock = new ActionBlock(domain.ActionCodeblock!,domain.Actions[action.Action]!.DFId,args,tags,domain instanceof TargetDomain ? domain.Target : null)

                let returnType = GetReturnType(actionBlock)
                let rawReturnType = GetReturnType(actionBlock,true)

                //if next token is char override
                let typeOverrideToken = exprToken.Expression[i+1]
                if (typeOverrideToken instanceof TypeOverrideToken) {
                    //error for trying to specify an action that returns null
                    if (!returnType) {
                        throw new TCError(`'${token.Action}' cannot have its type specified because it never returns a value`,0,typeOverrideToken.CharStart,typeOverrideToken.CharEnd)
                    }
                    //error for trying to specify an action that only returns one type as the type that it doesnt return
                    if (rawReturnType != "any" && typeOverrideToken.Type != returnType) { 
                        throw new TCError(`'${token.Action}' cannot have its type specified as ${typeOverrideToken.Type} because it always returns ${returnType}`,0,typeOverrideToken.CharStart,typeOverrideToken.CharEnd)
                    }

                    returnType = typeOverrideToken.Type
                    skipIndexes[i+1] = true
                }

                //if this action doesn't have a return type, throw error
                if (!returnType) {
                    throw new TCError("Only actions which return a value can be used in expressions",0,token.CharStart,token.CharEnd)
                } else if (returnType == "any") {
                    throw new TCError("Expected return type must be manually specified to use this action in expressions (e.g. action(): str)",0,token.CharStart,token.CharEnd)
                }

                SetVarType(tempVar,returnType)

                //add the action to the code line
                code.push(actionBlock)
                //add the temporary variable containing the action's result to the expression in place of the action
                expression.push(tempVar)
            } else if (token instanceof CallToken) {
                if (token.Type == "process") {
                    throw new TCError("Processes cannot be started from within expressions.",0,token.CharStart,token.CharEnd)
                }
                
                //arguments
                //a temporary variable is automatically inserted as the first chest slot to get the returned value of the function
                let tempVar = NewTempVar("num")//num is just a placeholder type and is reassigned after return type is gotten
                
                let args: (CodeItem | null)[] = [tempVar] 
                if (token.Arguments) {
                    let argResults = SolveArgs(token.Arguments)
                    code.push(...argResults[0])
                    args.push(...argResults[1])
                }

                let actionBlock = new ActionBlock("call_func",token.Name,args)
                let returnType = environment.funcReturnTypes[token.Name]
                if (!returnType) {
                    throw new TCError(`Only functions which return values can be used in expressions.`,0,token.CharStart,token.CharEnd)
                }

                SetVarType(tempVar,returnType)
                code.push(actionBlock)
                expression.push(tempVar)
            } else {
                let toItemResults = ToItem(token)
                code.push(...toItemResults[0])
                expression.push(toItemResults[1])
            }
        }

        let ifAction: IfActionBlock | null = null

        //normal expression
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

                    //comparison operators
                    if (VALID_COMPARISON_OPERATORS.includes(item.Operator)) {
                        ifAction = new IfActionBlock("if_var", item.Operator == "==" ? "=" : item.Operator, [left, right], [], null, exprToken.Not)
                    }
                    //normal operators
                    else {
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
                }
                i++
            }
        }

        if (ifAction) {
            code.push(ifAction)
        }
        else if (expression.length > 1) {
            throw new Error("Failed to condense expression")
        }

        //@ts-ignore
        return [code, expression[0]]
    }

    function SolveArgs(list: ListToken): [CodeBlock[], (CodeItem | null)[]] {
        let code: CodeBlock[] = []
        let args: (CodeItem | null)[] = []
        for (let v of list.Items!) {
            if (v == null) { 
                args.push(null)
                continue 
            }
            let expressionResults = SolveExpression(v)
            code.push(...expressionResults[0])
            args.push(expressionResults[1])
        }


        return [code,args]
    }

    function SolveTags(dict: Dict<ActionTag>, codeblock: string, actionDFName: string): [CodeBlock[],TagItem[]] {
        let tags: TagItem[] = []
        let validTags = AD.DFActionMap[codeblock]![actionDFName]!.Tags
        for (let [name, tag] of Object.entries(dict)) {
            if (!validTags[name]) { throw new TCError(`Invalid tag name: '${name}'`,4,tag!.CharStart,tag!.CharEnd) }
            if (!validTags[name]!.Options.includes(tag!.Value)) { throw new TCError(`Invalid tag option: '${tag!.Value}'`,4,tag!.CharStart,tag!.CharEnd) }
            tags.push(new TagItem(
                [-1,-1],
                name,
                tag!.Value,
                codeblock,
                actionDFName,
                //@ts-ignore SHUT UP I KNOW WHAT MY CODE DOES!!!!!!! GRRRRR
                tag?.Variable ? ToItem(tag.Variable)[1] : null
            ))
        }

        return [[],tags]
    }

    function SolveConditionExpression(expression: ExpressionToken): [CodeBlock[], CodeItem, IfActionBlock] {
        let expressionResults = SolveExpression(expression)

        let ifBlock = expressionResults[0][expressionResults[0].length - 1] 

        //error if the condition was invalid
        if (!(ifBlock instanceof IfActionBlock)) {
            throw new TCError("Condition must either be an if action or include a comparison",0,expression.CharStart,expression.CharEnd)
        }

        //account for if actions that exist on multiple different if blocks having differentiated names
        let dfName = AD.DifferentiatedDFActionMap[ifBlock.Block]![ifBlock.Action]!.DFId
        ifBlock.Action = dfName

        return [expressionResults[0], expressionResults[1], ifBlock]
    }



    //this variable will be 1 for the first line after the closing bracket of an if statement
    let ComingFromIfStatement = 0
    let CodeLine: Array<CodeBlock> = []

    let headerMode = true
    let headerData = {
        codeblock: undefined as undefined | EventHeaderToken,
        lsCancel: false as false | KeywordHeaderToken,
        params: [] as ParamItem[],
        returnParams: [] as ParamItem[]
    }
    let existingParams: string[] = []

    let i = -1
    for (let line of lines) {
        i++

        if (ComingFromIfStatement > 0) { ComingFromIfStatement-- }

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
                if ((header.Type == "dict" || header.Type == "list") && header.DefaultValue) {
                    throw new TCError(`Parameters of type '${header.Type}' cannot have default values`,0,header.DefaultValue!.CharStart,header.DefaultValue!.CharEnd)
                }
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
            else if (header instanceof ReturnsHeaderToken) {
                headerData.returnParams.unshift(new ParamItem([header.CharStart,header.CharEnd],"@__TC_RV_1","var",false,false))
            }

            //done with headers, apply them
            if (!(header instanceof HeaderToken) || i == lines.length-1) {
                if (headerData.codeblock) {
                    let block
                    if (headerData.codeblock.Codeblock == "PLAYER_EVENT" || headerData.codeblock.Codeblock == "ENTITY_EVENT") {
                        if (!AD.DFActionMap[headerData.codeblock.Codeblock == "PLAYER_EVENT" ? "event" : "entity_event"]![headerData.codeblock.Event]!.Cancellable && headerData.lsCancel) {
                            throw new TCError(`${headerData.codeblock.Codeblock == "PLAYER_EVENT" ? "Player" : "Entity"} event '${headerData.codeblock.Event}' is not cancellable`,0,headerData.lsCancel.CharStart,headerData.lsCancel.CharEnd)
                        }
                        block = new EventBlock(headerData.codeblock.Codeblock, headerData.codeblock.Event, headerData.lsCancel == false ? false : true)
                    }
                    else if (headerData.lsCancel) {
                        throw new TCError("Lagslayer cancel can only be applied to events",0,headerData.lsCancel.CharStart,headerData.lsCancel.CharEnd)
                    }

                    // error for too many params
                    if (headerData.params.length + headerData.returnParams.length > MAX_LINE_VARS) {
                        if (headerData.returnParams.length > 0) {
                            throw new TCError(`The combined total number of parameters and return values that a function has cannot exceed ${MAX_LINE_VARS}.`,0,-1,-1)
                        } else {
                            throw new TCError(`The total number of parameters that a function has cannot exceed ${MAX_LINE_VARS}.`,0,-1,-1)
                        }
                    }
                    
                    if (headerData.codeblock.Codeblock == "FUNCTION") {
                        block = new FunctionBlock(headerData.codeblock.Event, [...headerData.returnParams,...headerData.params])
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
        else if (line[0] instanceof HeaderToken) {
            throw new TCError("All headers must appear at the top of the file, before any actual code",0,line[0].CharStart,line[0].CharEnd)
        }

        //opening bracket
        if (HighestContext.BracketType != "none" && HighestContext.OpeningBracketResolved == false) {
            if (line[0] instanceof BracketToken && line[0].Type == "open") {
                CodeLine.push(new BracketBlock("open",HighestContext.BracketType))
                HighestContext.OpeningBracketResolved = true
                CodeLine.push(...HighestContext.HeldPostBracketCode)
                continue
            }

            throw new TCError(`Expected opening bracket following ${HighestContext.BracketType} statement`,0,lines[i-1][0].CharStart,lines[i-1][0].CharEnd)
        }

        //closing bracket
        if (line[0] instanceof BracketToken && line[0].Type == "close") {
            //if there is no opening counterpart, throw error
            if (HighestContext.BracketType == "none") {
                throw new TCError(`Closing bracket has no opening counterpart`,0,line[0].CharStart,line[0].CharEnd)
            }

            CodeLine.push(new BracketBlock("close",HighestContext.BracketType))

            if (HighestContext.CreatorToken instanceof IfToken) {
                ComingFromIfStatement = 2
            }

            PopContext()
        }

        //action
        if (line[0] instanceof ActionToken) {
            let action = line[0]
            let domain: Domain = DomainList[action.DomainId]!

            ActionNameErrorChecks(domain,action)
            
            let args
            if (action.Params) {
                let argResults = SolveArgs(action.Params)
                CodeLine.push(...argResults[0])
                args = argResults[1]
            }

            //tags
            let tags
            if (action.Tags) {
                let tagResults = SolveTags(action.Tags,domain.ActionCodeblock!,domain.Actions[action.Action]!.DFId)
                CodeLine.push(...tagResults[0])
                tags = tagResults[1]
            }

            let actionBlock = new ActionBlock(domain.ActionCodeblock!,domain.Actions[action.Action]!.DFId,args,tags,domain instanceof TargetDomain ? domain.Target : null)

            //if this action has a return type, mark variable as that type
            let returnType = GetReturnType(actionBlock)
            if (returnType) {
                //there must be a variable in slot 1
                //check for variable token to make sure temp var doesnt count
                if (!(line[0].Params && line[0].Params.Items[0] && line[0].Params.Items[0].Expression[0] instanceof VariableToken && line[0].Params.Items[0].Expression.length == 1)) {
                    throw new TCError(`First argument must be a variable`,0,line[0].CharStart,line[0].CharEnd)
                }

                SetVarType(args[0],returnType)
            }
            
            //push action
            CodeLine.push(actionBlock)
        }
        //call function
        else if (line[0] instanceof CallToken) {
            let action = line[0]

            //args
            let args
            if (action.Arguments && action.Type == "function") {
                let argResults = SolveArgs(action.Arguments)
                CodeLine.push(...argResults[0])
                args = argResults[1]
            }

            //tags
            let tags
            if (action.Type == "process") {
                let tagResults = SolveTags(action.Tags || {},"start_process","dynamic")
                CodeLine.push(...tagResults[0])
                //missing tags must be filled here since the action block constructor doesnt know about process action being "dynamic"
                tags = FillMissingTags("start_process","dynamic",tagResults[1])
            }

            let actionBlock = new ActionBlock(action.Type == "function" ? "call_func" : "start_process",action.Name,args,tags)
            actionBlock.ActionNameField = "data" //WARNING! EVEN THOUGH THIS SEEMS REDUNDANT, EVERYTHING BREAKS IF YOU REMOVE IT!!

            CodeLine.push(actionBlock)
        }
        //control
        else if (line[0] instanceof ControlBlockToken) {
            // set return value
            if (line[0].ReturnValue) {
                if (headerData.codeblock?.Codeblock != "FUNCTION") {
                    throw new TCError("Only functions can return values.",0,line[0].CharStart,line[0].CharEnd)
                } 
                let declaredReturnType = environment.funcReturnTypes[headerData.codeblock.Event]
                if (!declaredReturnType) {
                    throw new TCError("Return type must be declared using the 'RETURNS' header to return values.",0,line[0].CharStart,line[0].CharEnd)
                }

                let solved = SolveExpression(line[0].ReturnValue)
                let solvedType = GetType(solved[1])
                if (solvedType != "any" && declaredReturnType != "any" && solvedType != declaredReturnType) {
                    throw new TCError(`Value type (${solvedType}) does not match the declared return type (${declaredReturnType})`,0,line[0].ReturnValue.CharStart,line[0].ReturnValue.CharEnd)
                }
                CodeLine.push(
                    ...solved[0],
                    new ActionBlock("set_var","=",[new VariableItem([],"line","@__TC_RV_1"),solved[1]])
                )
            }

            let action = line[0]
            let args
            if (action.Params) {
                let argResults = SolveArgs(action.Params)
                CodeLine.push(...argResults[0])
                args = argResults[1]
            }

            //tags
            let tags
            if (action.Tags) {
                let tagResults = SolveTags(action.Tags,"control",action.Action)
                CodeLine.push(...tagResults[0])
                tags = tagResults[1]
            }

            //push action
            CodeLine.push(new ActionBlock("control",action.Action,args,tags))
        }
        //if
        else if (line[0] instanceof IfToken) {
            let newContext = new Context()
            newContext.BracketType = "if"
            newContext.CreatorToken = line[0]
            PushContext(newContext)

            let expressionResults = SolveExpression(line[0].Condition)

            //error if the condition was invalid
            if (!(expressionResults[0][expressionResults[0].length - 1] instanceof IfActionBlock)) {
                throw new TCError("Condition must either be an if action or include a comparison",0,line[0].Condition.CharStart,line[0].Condition.CharEnd)
            }

            ApplyIfStatementTypeInferences(expressionResults[0][expressionResults[0].length - 1] as IfActionBlock)

            CodeLine.push(...expressionResults[0])
        }
        //else
        else if (line[0] instanceof ElseToken) {
            let newContext = new Context()
            newContext.BracketType = "if"
            newContext.CreatorToken = line[0]
            PushContext(newContext)

            if (ComingFromIfStatement != 1) {
                throw new TCError("Else must follow immediately after the closing bracket of an if statement",0,line[0].CharStart,line[0].CharEnd)
            }

            CodeLine.push(new ElseBlock())
        }
        //repeat
        else if (line[0] instanceof RepeatToken) {
            let newContext = new Context()
            newContext.BracketType = "repeat"
            newContext.CreatorToken = line[0]
            PushContext(newContext)

            //repeat forever
            if (line[0] instanceof RepeatForeverToken) {
                CodeLine.push(
                    new ActionBlock("repeat","Forever",[],[])
                )
            }
            //repeat multiple
            else if (line[0] instanceof RepeatMultipleToken) {
                let expressionResults = SolveExpression(line[0].Amount)
                //push any code generated by expression
                if (expressionResults[0].length > 0) { CodeLine.push(...expressionResults[0]) }

                if (line[0].Variable) {
                    //error if you try to define the i variable as a type other than nunber
                    if (line[0].Variable.Type && line[0].Variable.Type != "num") {
                        throw new TCError("Index variable must be num",0,line[0].Variable.CharStart,line[0].Variable.CharEnd)
                    }

                    SetVarType(line[0].Variable,"num")

                    CodeLine.push(
                        new ActionBlock("repeat","Multiple",[ToItem(line[0].Variable)[1],expressionResults[1]])
                    )
                } else {
                    CodeLine.push(
                        new ActionBlock("repeat","Multiple",[expressionResults[1]])
                    )
                }
            }
            //repeat while
            else if (line[0] instanceof RepeatWhileToken) {
                let expressionResults = SolveConditionExpression(line[0].Condition)
                let code = expressionResults[0]
                let ifBlock = expressionResults[2]

                //if the values in the if chest require extra code blocks to evaluate, the whole expression must 
                //be evaluated inside the repeat or else its value won't get updated for each iteration
                //the idea is to have the whole expression at the start of the repeat, then check the inverse of that condition and if the inverse is true, break
                if (code.length > 1) {
                    //add repeat forever
                    CodeLine.push(new ActionBlock("repeat","Forever",[],[]))
                    //invert if block
                    ifBlock.Not = !ifBlock.Not

                    code.push(
                        new BracketBlock("open","if"), //opening bracket after the if
                        new ActionBlock("control","StopRepeat",[]), //break that actually kills the loop
                        new BracketBlock("close","if") //closing bracket after the if
                    )

                    newContext.HeldPostBracketCode = code
                } 
                //the entire expression is contained within the if block's chest so the repeat while can just do that
                else {
                    //replace if block returned by expression with repeat block
                    code[code.length-1] = new SubActionBlock("repeat","While",ifBlock.Arguments,ifBlock.Tags,ifBlock.Not,ifBlock.Action)
                    CodeLine.push(...code)
                }

                if (ifBlock.Arguments[0] instanceof VariableItem) {
                    let storedType = ifBlock.Arguments[0].StoredType ?? "any"
                    if (storedType != "any") {
                        SetVarType(ifBlock.Arguments[0],storedType)
                    }
                }
            }
            //repeat on action
            else if (line[0] instanceof RepeatForActionToken) {
                let action = line[0]
                //error for invalid action name
                if (AD.TCActionMap.repeat![action.Action] == null) {
                    throw new TCError(`Invalid repeat action '${action.Action}'`, 0, action.CharStart, action.CharEnd)
                }
                let dfId = AD.TCActionMap.repeat![action.Action]?.DFId!

                let args: (CodeItem | null)[] = line[0].Variables.map( (token) => ToItem(token)[1] )
                if (action.Arguments) {
                    let argResults = SolveArgs(action.Arguments)
                    CodeLine.push(...argResults[0])
                    args.push(...argResults[1])
                }

                //tags
                let tags
                if (action.Tags) {
                    let tagResults = SolveTags(action.Tags,"repeat",dfId)
                    CodeLine.push(...tagResults[0])
                    tags = tagResults[1]
                }

                let codeBlock = new ActionBlock("repeat",dfId,args,tags)
                SetVarType(line[0].Variables[0],GetReturnType(codeBlock)!)

                //push action
                CodeLine.push(codeBlock)
            }
            //iterate over list/dictionary
            else if (line[0] instanceof RepeatForInToken) {
                let expressionResults = SolveExpression(line[0].IterableExpression)
                CodeLine.push(...expressionResults[0])

                let iterableType = GetType(expressionResults[1])

                //make sure theres the right amount of variables
                const variableAmounts = {list: 1, dict: 2}
                //error for non-iterable type
                if (!variableAmounts[iterableType]){
                    throw new TCError(`${iterableType} cannot be iterated over`,0,line[0].IterableExpression.CharStart,line[0].IterableExpression.CharEnd-1)
                }
                //error for wrong amount of variables
                else if (line[0].Variables.length != variableAmounts[iterableType]) {
                    throw new TCError(`Iterating over ${iterableType} returns ${variableAmounts[iterableType]} ${variableAmounts[iterableType] == 1 ? "variable" : "variables"}, ${line[0].Variables.length} ${line[0].Variables.length == 1 ? "was" : "were"} provided instead.`,0,line[0].Variables[0].CharStart,line[0].Variables[line[0].Variables.length - 1].CharEnd)
                }


                if (iterableType == "dict") {
                    SetVarType(line[0].Variables[0],"str")
                    let storedType = line[0].Variables[1].Type ?? "any"
                    if (storedType != "any") {
                        SetVarType(line[0].Variables[1],storedType)
                    }
                } else if (iterableType == "list") {
                    let storedType = line[0].Variables[0].Type ?? "any"
                    if (storedType != "any") {
                        SetVarType(line[0].Variables[0],line[0].Variables[0].Type ?? "any")
                    }
                }

                let variableItems = line[0].Variables.map( (token) => ToItem(token)[1] )
                CodeLine.push(
                    new ActionBlock("repeat",iterableType == "list" ? "ForEach" : "ForEachEntry",[...variableItems,expressionResults[1]])
                )
            }
        }
        //select
        else if (line[0] instanceof SelectActionToken) {
            let args
            if (line[0].Arguments) {
                let argResults = SolveArgs(line[0].Arguments)
                CodeLine.push(...argResults[0])
                args = argResults[1]
            }

            let actionDFName = AD.TCActionMap.select_obj![line[0].Action]!.DFId

            if (line[0].ConditionExpression) {
                //tags
                let tags
                if (line[0].Tags) {
                    let tagResults = SolveTags(line[0].Tags, "select_obj", actionDFName)
                    CodeLine.push(...tagResults[0])
                    tags = tagResults[1]
                }

                //solve conditon
                let expressionResults = SolveConditionExpression(line[0].ConditionExpression)
                let code = expressionResults[0]
                let ifBlock = expressionResults[2]

                //error for using entity? with PlayersByCondition or player? with EntitiesByCondition
                if (actionDFName == "PlayersCond" && ifBlock.Block == "if_entity") {
                    throw new TCError("Cannot use entity condition to select players",0,line[0].ConditionExpression.CharStart,line[0].ConditionExpression.CharEnd)
                } else if (actionDFName == "EntitiesCond" && ifBlock.Block == "if_player") {
                    throw new TCError("Cannot use player condition to select entities",0,line[0].ConditionExpression.CharStart,line[0].ConditionExpression.CharEnd)
                }

                //replace if block returned by expression with repeat block
                code[code.length-1] = new SubActionBlock("select_obj",actionDFName,ifBlock.Arguments,ifBlock.Tags,ifBlock.Not,ifBlock.Action)

                CodeLine.push(...expressionResults[0])
            } else {
                //tags
                let tags
                if (line[0].Tags) {
                    let tagResults = SolveTags(line[0].Tags, "select_obj", actionDFName)
                    CodeLine.push(...tagResults[0])
                    tags = tagResults[1]
                }

                CodeLine.push(
                    new ActionBlock("select_obj",actionDFName,args,tags)
                )
            }
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
                let assignmentOpr = line[1] as OperatorToken

                let left = ToItem(line[0])[1]
                let rightResults = SolveExpression(line[2] as ExpressionToken)
                //if code is required to generate right, push it
                if (rightResults[0].length > 0) {
                    CodeLine.push(...rightResults[0])
                }
                let right = rightResults[1]

                let typeleft = GetType(left)
                let typeright = GetType(right)

                if (assignmentOpr.Operator == "=") { 
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
                        assignmentOpr.Operator == "+=" ? "+" :
                        assignmentOpr.Operator == "-=" ? "-" :
                        assignmentOpr.Operator == "*=" ? "*" :
                        assignmentOpr.Operator == "/=" ? "/" :
                        assignmentOpr.Operator == "^=" ? "^" :
                        assignmentOpr.Operator == "%=" ? "%" :
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
            //assignment to a dictionary/list
            else if (line[1] instanceof IndexerToken) {
                let [generatedCode, rootVarItem] = ToItem(line[0])
                CodeLine.push(...generatedCode)

                //get path of indexers
                let path: [IndexerToken,TypeOverrideToken?,CodeItem?][] = []
                let tokenIndex = 1
                while (line[tokenIndex] instanceof IndexerToken) {
                    let entry: [IndexerToken,TypeOverrideToken?] = [line[tokenIndex] as IndexerToken]
                    tokenIndex++
                    if (line[tokenIndex] instanceof TypeOverrideToken) {
                        entry[1] = line[tokenIndex] as TypeOverrideToken
                        tokenIndex++
                    }
                    path.push(entry)
                }

                let assignmentOpr = (line[tokenIndex] as OperatorToken)
                let valueExpr = line[tokenIndex+1] as ExpressionToken

                let reinsertionBlocks: CodeBlock[] = []

                //drill down through path
                let indexeeItem = rootVarItem
                let indexeeTempVar = NewTempVar(path[path.length-1][1]?.Type)
                let valueVar: VariableItem; if (assignmentOpr.Operator != "=") { valueVar = NewTempVar(path[path.length-1][1]?.Type) }

                let indexeeType: string | undefined = undefined
                let indexerItem: CodeItem
                for (let i = 0; i < path.length; i++) {
                    let lastEntry = path[i-1]
                    let thisEntry = path[i]
                    
                    //figure out type of indexee
                    if (i === 0) {
                        indexeeType = GetType(rootVarItem)
                    } else if (lastEntry[1] != undefined) {
                        indexeeType = lastEntry[1]!.Type
                    } else {
                        throw new TCError(`Could not infer value type and no type was specified`,0,lastEntry[0].CharStart,lastEntry[0].CharEnd)
                    }
                    
                    //solve expression of indexer
                    let indexExprCode: CodeBlock[]
                    [indexExprCode, indexerItem] = SolveExpression(thisEntry[0].Index)
                    CodeLine.push(...indexExprCode)

                    if (i < path.length-1) {
                        //create codeblocks for the indexing operation
                        if (indexeeType == "dict" || indexeeType == "list") {
                            //add reinsertion codeblock if this value isn't grabbed by reference
                            let thisEntryType: string
                            if (thisEntry[1] != undefined) {
                                thisEntryType = thisEntry[1].Type
                            }
                            else {
                                throw new TCError(`Could not infer value type and no type was specified`,0,thisEntry[0].CharStart,thisEntry[0].CharEnd)
                            }

                            let newTempVar = NewTempVar(indexeeType)
                            if (thisEntryType == "list") {
                                reinsertionBlocks.unshift(
                                    new ActionBlock("set_var",indexeeType == "dict" ? "SetDictValue" : "SetListValue",[indexeeItem,indexerItem,newTempVar])
                                )
                            }
                            indexeeTempVar = newTempVar

                            //codeblock for actual get operation
                            CodeLine.push(
                                new ActionBlock("set_var",indexeeType == "dict" ? "GetDictValue" : "GetListValue",[i == path.length - 1 ? valueVar! : indexeeTempVar,indexeeItem,indexerItem])
                            )
                        }
                        else {
                            throw new TCError(`Type '${indexeeType}' cannot be indexed into`,0,thisEntry[0].CharStart,thisEntry[0].CharEnd)
                        }
                        indexeeItem = indexeeTempVar
                    }
                }

                //solve expression of value 
                let [valueExprCode, valueItem] = SolveExpression(valueExpr)

                if (assignmentOpr.Operator !== "=") {
                    let typeleft: string
                    let typeright = GetType(valueItem)
                    if (path[path.length-1][1] == undefined) {
                        throw new TCError(`Could not infer value type and no type was specified`,0,path[path.length-1][0].CharStart,path[path.length-1][0].CharEnd)
                    }
                    typeleft = path[path.length-1][1]!.Type

                    let opr = 
                        assignmentOpr.Operator == "+=" ? "+" :
                        assignmentOpr.Operator == "-=" ? "-" :
                        assignmentOpr.Operator == "*=" ? "*" :
                        assignmentOpr.Operator == "/=" ? "/" :
                        assignmentOpr.Operator == "%=" ? "%" :
                        "INVALID OPERATOR"

                    //error for unsupported operation
                    if (OPERATIONS[typeleft] == undefined || OPERATIONS[typeleft][opr] == undefined || OPERATIONS[typeleft][opr][typeright] == undefined) {
                        throw new TCError(`${typeleft} cannot ${opr} with ${typeright}`, 0, assignmentOpr.CharStart, assignmentOpr.CharEnd)
                    }

                    //get left value
                    let [indexerExprCode, finalIndexerItem] = SolveExpression(path[path.length-1][0].Index)
                    
                    let left = NewTempVar(typeleft)
                    CodeLine.push(
                        ...indexerExprCode,
                        new ActionBlock("set_var",indexeeType == "dict" ? "GetDictValue" : "GetListValue",[left,indexeeItem,finalIndexerItem]),
                        ...valueExprCode,
                    )

                    // run the operation
                    let result = OPERATIONS[typeleft][opr][typeright](left, valueItem)

                    //push any code generated by operation
                    CodeLine.push(...result[0])

                    valueItem = result[1]
                } else {
                    CodeLine.push(...valueExprCode)
                }

                CodeLine.push(
                    new ActionBlock("set_var",indexeeType == "dict" ? "SetDictValue" : "SetListValue",[indexeeItem,indexerItem!,valueItem]),
                    ...reinsertionBlocks
                )
            }
        }
        //debug print variable
        else if (line[0] instanceof DebugPrintVarTypeToken) {
            throw new TCError(`${line[0].Variable.Scope} variable '${line[0].Variable.Name}' has type ${CombinedVarContext.VariableTypes[VALID_VAR_SCOPES[line[0].Variable.Scope]!][line[0].Variable.Name]}\n`,0,line[0].CharStart,line[0].CharEnd)
        }
    }

    //error if there are unclosed brackets
    if (ContextStack.length > 1) {
        throw new TCError(`${HighestContext.BracketType == "if" ? "If" : "Repeat"} statement never closed`,0,HighestContext.CreatorToken?.CharStart!,HighestContext.CreatorToken?.CharEnd!)
    }

    //== code injections ==\\
    let injections = environment.codeInjections[
        headerData.codeblock?.Codeblock == "PLAYER_EVENT" ? "playerEvents" :
        headerData.codeblock?.Codeblock == "ENTITY_EVENT" ? "entityEvents" :
        headerData.codeblock?.Codeblock == "FUNCTION" ? "functions" :
        "processes"
    ][headerData.codeblock?.Event!]
    if (injections) {
        CodeLine.splice(1,0,...injections.before.flat())
        CodeLine.push(...injections.after.flat())
    }

    //== optimization passes ==\\
    //the order they appear in the array is the order they will be executed

    function OptimizePercentMath(block: CodeBlock) {
        if (!(block instanceof ActionBlock)) { return }

        block.Arguments.forEach(item => {
            if (!(item instanceof NumberItem)) { return }

            let value = (item as NumberItem).Value
            let mathExpression: TextCode.MathTextCodeToken
            try {
                mathExpression = TextCode.TokenizeMath(value)
                let flat = mathExpression.Flatten()

                // if the entire expression is one operation, combine all constants
                let operation = flat.GetIsSingleOperator()
                if (operation == "+" || operation == "*") {
                    let total = operation == "+" ? 0 : 1
                    
                    let i = 0; while (i < flat.Expression.length) {
                        let token = flat.Expression[i]
                        if (token instanceof TextCode.NumberToken) {
                            // add to total
                            if (operation == "+") {
                                total += Number(token.Value)
                            } else {
                                total *= Number(token.Value)
                            }

                            // remove tokens
                            if (i == flat.Expression.length-1) {
                                flat.Expression.splice(i-1,2)
                            } else {
                                flat.Expression.splice(i,2)
                            }
                        } else {
                            i++
                        }
                    }

                    // add constant back onto the end
                    if ( (operation == "+" && total != 0) || (operation == "*" && total != 1) ) {
                        flat.Expression.push(new TextCode.OperatorToken([],operation),new TextCode.NumberToken([],total.toString()))
                    }
                }

                if (flat.Expression.length == 1 && flat.Expression[0] instanceof TextCode.NumberToken) {
                    item.Value = flat.Expression[0].Compile()
                } else {
                    item.Value = flat.Compile()
                }
            } catch { }
        });
    }

    let codeIndex = -1
    const OptimizationPasses = [
        // Clean up %math expressions before messing with them \\
        OptimizePercentMath,

        // Condense to incrementer \\
        function(block: CodeBlock, nextBlock: CodeBlock) {
            //require this block to be action with arguments
            if (!(block instanceof ActionBlock) || block.Arguments.length < 1) { return }

            //require next block to be action block with arguments
            if (!(nextBlock instanceof ActionBlock) || nextBlock.Arguments.length < 2) { return }


            if (block.Action == "+" && nextBlock.Action == "=") {
                let thisTempVar = block.Arguments[0] as VariableItem 
                let nextTempVar = nextBlock.Arguments[1] as VariableItem

                let thisRealVar = block.Arguments[1] as VariableItem
                let nextRealVar = nextBlock.Arguments[0] as VariableItem
                //require this block and next block to both use the same var
                if (nextTempVar.Name != thisTempVar.Name) { return }
                if (thisRealVar.Name != nextRealVar.Name) { return }
                
                //remove temp var and real from + block
                block.Arguments.splice(0,2)

                //replace temp var in = block with this block's contents
                nextBlock.Arguments.splice(1,1,...block.Arguments)

                //remove + block
                CodeLine.splice(codeIndex, 1)

                nextBlock.Action = "+="
                codeIndex -= 2
            } 
            else if (block.Action == "+" && nextBlock.Action == "+=") {
                let thisTempVar = block.Arguments[0] as VariableItem | NumberItem
                let nextTempVar = nextBlock.Arguments[1] as VariableItem | NumberItem

                let thisTempVarName = thisTempVar instanceof VariableItem ? thisTempVar.Name : thisTempVar.TempVarEquivalent

                //if the temp var of the next chest is a %math operation, include that in this new chest
                if (nextTempVar instanceof NumberItem) {
                    let mathCode = TextCode.TokenizeMath(nextTempVar.Value)
                    let index = TextCode.FindVariable(thisTempVarName,mathCode.Expression)

                    //require this block and next block to both use the same temp var
                    if (index == null) { return }
                        
                    // remove this temp var from the %math since it no longer exists
                    if (index == mathCode.Expression.length-1) {
                        mathCode.Expression.splice(index-1,2)
                    } else {
                        mathCode.Expression.splice(index,2)                        
                    }
                    nextTempVar.Value = mathCode.Compile()

                    nextTempVar.TempVarEquivalent = thisTempVarName
                    block.Arguments.push(nextTempVar)
                } else {
                    //require this block and next block to both use the same temp var
                    if (thisTempVarName != nextTempVar.Name) { return }
                }

                //replace temp var with final var
                block.Arguments[0] = nextBlock.Arguments[0]

                //move everything after the temp var of next chest into this chest
                for (let i = 2; i < nextBlock.Arguments.length; i++) {
                    block.Arguments.push(nextBlock.Arguments[i])
                }

                //remove += block
                CodeLine.splice(codeIndex + 1,1)

                block.Action = "+="
                codeIndex -= 2
            }
            else if (block.Action == "+=" && nextBlock.Action == "+=") {
                //make sure this block and the next block are actually modifying the same variable
                let thisVar = block.Arguments[0] as VariableItem
                let nextVar = nextBlock.Arguments[0] as VariableItem
                if (thisVar.Name != nextVar.Name) {return}

                //move all contents of next chest into this chest
                for (let i = 1; i < nextBlock.Arguments.length; i++) {
                    block.Arguments.push(nextBlock.Arguments[i])
                }

                //remove next block
                CodeLine.splice(codeIndex + 1, 1)

                codeIndex -= 2
            }
        },

        // Condense incremeter contents (combine constants & line vars) \\
        function(block: CodeBlock) {
            //require this block to be action with arguments
            if (!(block instanceof ActionBlock) || block.Arguments.length < 1) { return }
            //require this block to be an incremeter action
            if (block.Action != "+=") { return }

            let total = 0
            let expressionEntries: string[] = []

            for (let i = block.Arguments.length - 1; i > -1; i--) {
                let item = block.Arguments[i]

                if (item instanceof NumberItem) {
                    //if item is a %math expression
                    if (isNaN(Number(item.Value))) {
                        expressionEntries.push(item.Value)
                    }
                    //if item is a constant number
                    else {
                        total += Number(item.Value)
                    }
                    block.Arguments.splice(i, 1)
                    //if item is a line var
                } else if (item instanceof VariableItem && item.Scope == "line") {
                    expressionEntries.push(`%var(${item.Name})`)
                    block.Arguments.splice(i, 1)
                }
            }

            //combine expression
            if (total > 0) { expressionEntries.push(String(total)) }
            block.Arguments.push(new NumberItem([], `%math(${expressionEntries.join("+")})`))
        },

        // Condense setting a temp var to a value and immediately setting a var to that temp var \\
        function(block: CodeBlock, nextBlock: CodeBlock) {
            //make sure blocks are the right type
            if (!(block instanceof ActionBlock)) { return }
            if (!(nextBlock instanceof ActionBlock && nextBlock.Block == "set_var" && nextBlock.Action == "=")) { return }

            //make sure this is an action that sets a value
            let returnType = GetReturnType(block)
            if (returnType) {
                //make sure variables match up
                if (block.Arguments[0] instanceof VariableItem && nextBlock.Arguments[1] instanceof VariableItem && nextBlock.Arguments[0] instanceof VariableItem && block.Arguments[0].Name == nextBlock.Arguments[1].Name) {
                    //make sure this block is actually a setter and not a modifier
                    let firstParameter = AD.DFActionMap["set_var"]?.[block.Action]?.Parameters[0]?.Groups[0][0]
                    let secondParameter = AD.DFActionMap["set_var"]?.[block.Action]?.Parameters[1]?.Groups[0][0]
                    if (secondParameter?.Description.match(/.+ to change/g)) {
                        return
                    }
                    if (
                        (block.Block == "call_func" && block.Arguments[0].IsTemporary && nextBlock.Arguments[0].Scope != "saved") ||
                        (firstParameter?.DFType == "VARIABLE" && firstParameter?.Description == "Variable to set")
                    ) {
                        block.Arguments[0] = nextBlock.Arguments[0]
                        //remove = block
                        CodeLine.splice(codeIndex+1,1)
                    }
                }
            }

        },

        // Split incrementers that are longer than 27 items \\ (this isn't technically optimization but i don't care)
        //mitosis reference??????
        function (block: CodeBlock) {
            if (!(block instanceof ActionBlock)) { return }
            if (block.Action != "+=") { return }

            let incrementee = block.Arguments[0] as VariableItem

            if (block.Arguments.length > 27) {
                let newArgs = block.Arguments.splice(27)
                
                let clone = new VariableItem([],incrementee.Scope,incrementee.Name,incrementee.StoredType)
                if (incrementee.IsTemporary) { clone.IsTemporary = true}
                clone.CharStart = incrementee.CharStart
                clone.CharEnd = incrementee.CharEnd

                newArgs.unshift(clone)

                let newBlock = new ActionBlock("set_var","+=",newArgs)
                CodeLine.splice(codeIndex+1,0,newBlock)
            }
        },

        //##########################################################################\\
        //#### NO CODE OPTIMIZATIONS THAT ADD/REMOVE CODEBLOCKS PAST THIS POINT ####\\
        //##########################################################################\\

        // Clean up %math one final time \\
        OptimizePercentMath,

        // Final error checking \\
        function(block: CodeBlock) {
            if (!(block instanceof ActionBlock)) { return }

            let args = block.Arguments
            let tags = block.Tags
            let combinedChest = [...args, ...tags]

            //error if chest item count surpasses 27
            if (combinedChest.length > 27) {
                let deNulledArgs = args.filter(x => x) as CodeItem[]
                //if chest is entirely null items for some reason, ignore it
                if (deNulledArgs.length == 0) {
                    return
                }

                throw new TCError("Chest item count cannot surpass 27 (including tags)", 0, deNulledArgs[28 - tags.length - 1].CharStart, deNulledArgs[args.length - 1].CharEnd)
            }
        }
    ]

    if (!DEBUG_MODE.disableOptimization) {
        for (let func of OptimizationPasses) {
            codeIndex = -1
            while (codeIndex < CodeLine.length) {
                codeIndex++
                func(CodeLine[codeIndex], CodeLine[codeIndex+1])
            }
        }
    }

    if (!headerData.codeblock) {
        throw new TCError("File is neither a function, process, or event.",0,-1,-1)
    }

    let results: CompileResults = {
        code: CodeLine,
        type: headerData.codeblock.Codeblock as any,
        name: headerData.codeblock.Event
    }

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
    else if (item instanceof VectorItem) {
        return {
            "id": "vec",
            "data": {
                "x": item.X,
                "y": item.Y,
                "z": item.Z
            }
        }
    }
    else if (item instanceof SoundItem) {
        return {
            "id": "snd",
            "data": {
                "pitch": item.Pitch,
                "vol": item.Volume,
                "sound": item.SoundId ? item.SoundId : undefined,
                "variant": item.Variant ? item.Variant : undefined,
                "key": item.CustomKey ? item.CustomKey : undefined
            }
        }
    }
    else if (item instanceof TextItem) {
        return {
            "id": "comp",
            "data": {
                "name": item.Value
            }
        }
    }
    else if (item instanceof PotionItem) {
        return {
            "id": "pot",
            "data": {
                "pot": item.Potion,
                "dur": item.Duration,
                "amp": item.Amplifier
            }
        }
    }
    else if (item instanceof GameValueItem) {
        return {
            "id": "g_val",
            "data": {
                "type": item.Value,
                "target": item.Target
            }
        }
    }
    else if (item instanceof ItemItem) {
        return {
            "id": "item",
            "data": {
                "item": `{count:${item.Count}b,DF_NBT:${item.DFNbt},id:"${item.Id}",components:${item.Nbt}}`
            }
        }
    }
    else if (item instanceof ParticleItem) {
        return {
            "id": "part",
            "data": {
                "particle": item.Particle,
                "cluster": {
                    "amount": item.Cluster.Amount,
                    "horizontal": item.Cluster.HorizontalSpread,
                    "vertical": item.Cluster.VerticalSpread
                },
                "data": item.Data
            }
        }
    }
    else {
        process.stderr.write(JSON.stringify(item))
        throw new Error(`Failed to convert item of type '${item.itemtype}' to JSON`)
    }
}

export function JSONize(code: Array<CodeBlock>): string {
    let blocks: Array<Object> = []
    for (let block of code) {
        if (block instanceof ActionBlock) {
            let chest: any[] = []
            let slotIndex = 0
            //convert items
            for (const item of block.Arguments) {
                if (item != null) {
                    chest.push({
                        "item": JSONizeItem(item),
                        "slot": slotIndex
                    })
                }
                slotIndex++
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
                    "slot": item.ChestSlot
                }
                //variable
                if (item.Variable) {
                    tag.item.data["variable"] = JSONizeItem(item.Variable)
                }

                chest.push(tag)
                i--
            }

            blocks.push({
                "id": "block",
                "block": block.Block,
                "args": {"items": chest},
                [block.ActionNameField]: block.Action,
                "target": block.Target ? block.Target : undefined,
                "attribute": (block instanceof IfActionBlock || block instanceof SubActionBlock) && block.Not ? "NOT" : undefined,
                "subAction": block instanceof SubActionBlock && block.Subaction ? block.Subaction : undefined
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
                            "type": DF_TYPE_MAP[param.Type],
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
        else if (block instanceof BracketBlock) {
            blocks.push({
                "id": "bracket",
                "direct": block.Direction,
                "type": block.Type == "if" ? "norm" : block.Type
            })
        }
        else if (block instanceof ElseBlock) {
            blocks.push({
                "id": "block",
                "block": "else"
            })
        }
        else {
            process.stderr.write(JSON.stringify(block))
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

//compiles insertByVar type libraries into their setup functions
//this assumes the library has already been validated; it does not do its own validation of items
export function CompileLibrary(library: ItemLibrary) {
    let funcName = `@__TC_IL_${library.id}`
    let CodeLine: Array<CodeBlock> = [
        new FunctionBlock(funcName,[])
    ]
    for (const [itemId, item] of Object.entries(library.items)) {
        if (itemId == "dummy") {print(item?.componentsString)}
        CodeLine.push(
            new ActionBlock("set_var","=",[new VariableItem([],"unsaved",`@__TC_ITEM:${library.id}:${itemId}`), new ItemItem([],item?.material!,1,item?.componentsString, item?.version)])
        )
    }

    return {
        code: CodeLine,
        type: "FUNCTION",
        name: funcName
    } as CompileResults
}