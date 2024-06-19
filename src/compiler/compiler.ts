import { ActionTag, ActionToken, BracketToken, CallToken, ControlBlockToken, DebugPrintVarTypeToken, DictionaryToken, ElseToken, EventHeaderToken, ExpressionToken, GameValueToken, IfToken, IndexerToken, ItemToken, KeywordHeaderToken, ListToken, LocationToken, NumberToken, OperatorToken, ParamHeaderToken, PotionToken, RepeatForActionToken, RepeatForInToken, RepeatForeverToken, RepeatMultipleToken, RepeatToken, RepeatWhileToken, SelectActionToken, SoundToken, StringToken, TextToken, Token, TypeOverrideToken, VariableToken, VectorToken } from "../tokenizer/tokenizer"
import { VALID_VAR_SCOPES, VALID_LINE_STARTERS, VALID_COMPARISON_OPERATORS, DF_TYPE_MAP } from "../util/constants"
import { DEBUG_MODE, print } from "../main"
import { Domain, DomainList, TargetDomain, TargetDomains } from "../util/domains"
import * as fflate from "fflate"
import { TCError } from "../util/errorHandler"
import * as AD from "../util/actionDump"
import * as TextCode from "../util/textCodeParser"

const VAR_HEADER = `@__TC_`

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

export class CompileResults {
    Code: Array<CodeBlock>
}

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

    //if this number is a %math expression, this var represents
    //a temp var name that this item can safely replace when condensing
    TempVarEquivalent: string
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
    IsTemporary: boolean = false
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

class VectorItem extends CodeItem {
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

class SoundItem extends CodeItem {
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

class TextItem extends CodeItem {
    constructor(meta,value: string) {
        super("txt",meta)
        this.Value = value
    }

    Value: string
}

class PotionItem extends CodeItem {
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

class GameValueItem extends CodeItem {
    constructor(meta,value,target) {
        super("gval",meta)
        this.Value = value
        this.Target = target
    }

    Value: string
    Target: string
}

class ItemItem extends CodeItem {
    constructor(meta,id: string,count: number) {
        super("item",meta)
        this.Id = id
        this.Count = count
    }
    Id: string
    Count: number
}

class TagItem extends CodeItem {
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
    constructor(block: string, action: string, args: Array<CodeItem> = [], tags: TagItem[] = [], target: string | null = null) {
        super(block)
        this.Action = action
        this.Arguments = args
        this.Tags = FillMissingTags(block,action,tags)
        this.Target = target
    }
    Action: string
    Arguments: Array<CodeItem>
    Tags: Array<TagItem>
    Target: string | null = null
    
    //what key to use for action name when compiling to json
    //most actions use "action", call func and start process use "data"
    ActionNameField: string = "action"
}

class IfActionBlock extends ActionBlock {
    constructor(block: string, action: string, args: Array<CodeItem>, tags: TagItem[], target: string | null, not: boolean) {
        super(block,action,args,tags,target)
        this.Not = not
    }
    Not: boolean
}

class SubActionBlock extends ActionBlock {
    constructor(block: string, action: string, args: Array<CodeItem>, tags: TagItem[], not: boolean, subaction: string | null = null) {
        super(block,action,args,tags,null)
        this.Subaction = subaction
        this.Not = not
    }

    Not: boolean
    Subaction: string | null
}

class ElseBlock extends CodeBlock {
    constructor() {
        super("else")
    }
}

class BracketBlock extends CodeBlock {
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

export function Compile(lines: Array<Array<Token>>): CompileResults {
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
                let lowerValue = ContextStack[ContextStack.length-1].VariableTypes[scope][name]
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
            ContextStack[ContextStack.length-1].VariableTypes[VALID_VAR_SCOPES[variable.Scope]][variable.Name] = type
            CombinedVarContext.VariableTypes[VALID_VAR_SCOPES[variable.Scope]][variable.Name] = type
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
                }
            }
        }

        if (AD.DFActionMap[action.Block] && AD.DFActionMap[action.Block]![action.Action]) {
            return AD.DFActionMap[action.Block]![action.Action]?.ReturnType!
        } else {
            return null
        }
    }

    function NewTempVar(type: string | undefined): VariableItem {
        tempVarCounter++
        let varitem = new VariableItem(null, "line", `${VAR_HEADER}REG_${tempVarCounter}`)
        varitem.IsTemporary = true
        SetVarType(varitem,type)
        return varitem
    }

    function GetType(item: CodeItem): string {
        if (item instanceof GameValueItem) {
            return AD.DFGameValueMap[item.Value]!.ReturnType || "any"
        } else if (item instanceof VariableItem) {
            if (item.StoredType) {
                return item.StoredType
            } else {
                return CombinedVarContext.VariableTypes[item.Scope][item.Name] || "num"
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
        }
    }

    //takes in a Token from the parser and converts it to a CodeItem
    //codeBlock[] is the code generated to create the item and should generally be pushed right after this function is called
    function ToItem(token: Token): [CodeBlock[],CodeItem] {
        let code: CodeBlock[] = []
        let variableComponents: string[] = []

        function solveArg(expr: ExpressionToken,paramName: string,type: string): [CodeBlock[],CodeItem] {
            let solved = SolveExpression(expr)
            //if code was required to generate this component
            if (solved[0].length > 0) {
                code.push(...solved[0])
                variableComponents.push(paramName)
            }
            //if this component is a variable
            if (solved[1] instanceof VariableItem) {
                variableComponents.push(paramName)
            }


            //if this component is a %mathing number
            if (type == "num" && solved[1] instanceof NumberItem && Number.isNaN(Number(solved[1].Value))) {
                variableComponents.push(paramName)
            }

            //if this string is doing %var
            //% to detect strings doing %var() feels really hacky and is probably gonna break 
            //but as of right now there aren't any sounds with % in the name so i do not care
            if (type == "str" && solved[1] instanceof StringItem && solved[1].Value.includes("%")) {
                variableComponents.push(paramName)
            }


            let resultType = GetType(solved[1])
            if (resultType != type) {
                throw new TCError(`Expected ${type} for ${paramName}, got ${resultType}`,0,expr.CharStart,expr.CharEnd)
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
            return [code,new VariableItem([token.CharStart,token.CharEnd],VALID_VAR_SCOPES[token.Scope],token.Name, token.Type)]
        } 
        //location
        else if (token instanceof LocationToken) {
            let components: Dict<any> = {}

            //error for too many args
            if (token.RawArgs.length > 5) {
                throw new TCError(`Location takes at most 5 arguments, ${token.RawArgs.length} were provided instead`, 3, token.CharStart, token.CharEnd)
            }

            for (const component of ["X","Y","Z","Pitch","Yaw"]) {
                //defaults
                let defaultValue = ITEM_PARAM_DEFAULTS.loc[component]
                if (!token[component]) {
                    if (defaultValue !== undefined) {
                        components[component] = defaultValue
                        continue
                    } else { 
                        throw new TCError(`Location is missing ${component} coordinate`,0,token.CharStart,token.CharEnd)
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
                throw new TCError(`Vector takes at most 3 arguments, ${token.RawArgs.length} were provided instead`, 0, token.CharStart, token.CharEnd)
            }
            
            let i = 0
            for (const component of ["X","Y","Z"]) {
                if (token.RawArgs[i] == null) { throw new TCError(`Vector is missing ${component} coordinate`, 3, token.CharStart, token.CharEnd) }

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
                throw new TCError(`Sound takes at most 4 arguments, ${token.RawArgs.length} were provided instead`, 3, token.CharStart, token.CharEnd)
            }
            if (token.RawArgs[0] == null) {
                throw new TCError("Sound is missing ID", 2, token.CharStart, token.CharEnd)
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
                throw new TCError(`Custom sounds cannot specify variant`,0,token.CharStart,token.CharEnd)
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
                    throw new TCError(`Invalid sound type '${components.SoundId.Value}'`,0,token.SoundId.CharStart,token.SoundId.CharEnd)
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
                        throw new TCError(`Target '${domain.Identifier}' does not support game values`, 2, token.Segments.valueName![0], token.Segments.valueName![1])
                        //throw special error if this gv is valid for players but not entities and the target is an entity
                    } else if (!AD.TCEntityGameValues[token.Value] && domain.ActionType == "entity") {
                        throw new TCError(`Invalid entity game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1])
                    } else {
                        throw new TCError(`Invalid targeted game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1])
                    }
                }
                else {
                    if (domain.Identifier == "game") {
                        //throw special error for game game values
                        throw new TCError(`Invalid game value: '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1])
                    } else {
                        throw new TCError(`'${domain.Identifier}' does not contain value '${token.Value}'`, 2, token.Segments.valueName![0], token.Segments.valueName![1])
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
                throw new TCError(`Potion effect must specify a type (str)`,0,token.CharStart,token.CharEnd)
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
            } else {
                item.Duration = components.Duration.Value
            }
            
            return [code,latestItem]
        }
        //items
        else if (token instanceof ItemToken) {
            let components: Dict<any> = {}
            if (token.Mode == "library") {
                //implement this AFTER the client mod is done
                throw new TCError("Library items are not implemented yet",0,token.CharStart,token.CharEnd)
            } else {
                if (token.Nbt) { throw new TCError("NBT on item constructors is not implemented yet",0,token.Nbt.CharStart,token.Nbt.CharEnd)}


                for (const component of ["Id","Count"]) {
                    let defaultValue = ITEM_PARAM_DEFAULTS.item[component]
                    if (defaultValue !== undefined && !token[component]) { 
                        components[component] = defaultValue
                        continue
                    }

                    let solved = solveArg(token[component],component,component == "Id" ? "str" : "num")
                    components[component] = solved[1]
                }

                let item = new ItemItem([token.CharStart,token.CharEnd],"minecraft:stone",1)
                let tempVar = NewTempVar("item")
                let latestItem: ItemItem | VariableItem = item
                
                if (variableComponents.includes("Id")) {
                    code.push(
                        new ActionBlock("set_var","SetItemType",[tempVar,latestItem,components.Id])
                    )
                    latestItem = tempVar
                } else {
                    item.Id = components.Id.Value
                }

                if (variableComponents.includes("Count")) {
                    code.push(
                        new ActionBlock("set_var","SetItemAmount",[tempVar,latestItem,components.Count])
                    )
                } else {
                    let val = Number(components.Count.Value)
                    //throw error for stack size being too high
                    if (val > 64) {
                        throw new TCError("Stack size cannot be greater than 64",0,token.Count?.CharStart!,token.Count?.CharEnd!)
                    }

                    //throw error for non-integer stack size
                    if (Math.floor(val) != val) {
                        throw new TCError("Stack size must be a whole number",0,token.Count?.CharStart!,token.Count?.CharEnd!)
                    }

                    item.Count = Number(val)
                }

                return [code,latestItem]
            }
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
            let leftIsLine = (left instanceof VariableItem && left.Scope == "line")
            let rightIsLine = (right instanceof VariableItem && right.Scope == "line")

            //%conditions where %var is supported
            if (leftIsLine && rightIsLine) {
                return [[], new TextItem([left.CharStart, right.CharEnd], `%var(${left.Name})%var(${right.Name})`)]
            }
            else if (leftIsLine && right instanceof TextItem) {
                return [[], new TextItem([left.CharStart, right.CharEnd], `%var(${left.Name})${right.Value}`)]
            }
            else if (left instanceof TextItem && rightIsLine) {
                return [[], new TextItem([left.CharStart, right.CharEnd], `${left.Value}%var(${right.Name})`)]
            }

            //otherwise use set var

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
                
                let args: CodeItem[] = [tempVar] 
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

    function SolveArgs(list: ListToken): [CodeBlock[], CodeItem[]] {
        let code: CodeBlock[] = []
        let args: CodeItem[] = []
        for (let v of list.Items!) {
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
    let headerData: Dict<any> = {
        codeblock: null,
        lsCancel: false,
        params: []
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
            actionBlock.ActionNameField = "data"

            CodeLine.push(actionBlock)
        }
        //control
        else if (line[0] instanceof ControlBlockToken) {
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
            }
            //repeat on action
            else if (line[0] instanceof RepeatForActionToken) {
                let action = line[0]
                let args = line[0].Variables.map( (token) => ToItem(token)[1] )
                if (action.Arguments) {
                    let argResults = SolveArgs(action.Arguments)
                    CodeLine.push(...argResults[0])
                    args.push(...argResults[1])
                }

                //tags
                let tags
                if (action.Tags) {
                    let tagResults = SolveTags(action.Tags,"repeat",action.Action)
                    CodeLine.push(...tagResults[0])
                    tags = tagResults[1]
                }

                //push action
                CodeLine.push(new ActionBlock("repeat",action.Action,args,tags))
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
            console.log(`${line[0].Variable.Scope} variable '${line[0].Variable.Name}' has type ${CombinedVarContext.VariableTypes[VALID_VAR_SCOPES[line[0].Variable.Scope]][line[0].Variable.Name]}`)
        }
    }

    //error if there are unclosed brackets
    if (ContextStack.length > 1) {
        throw new TCError(`${HighestContext.BracketType == "if" ? "If" : "Repeat"} statement never closed`,0,HighestContext.CreatorToken?.CharStart!,HighestContext.CreatorToken?.CharEnd!)
    }

    //optimization passes
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
                //require this block and next block to both use the same temp var
                if (nextTempVar.Name != thisTempVar.Name) { return }
                
                //remove temp var from + block
                block.Arguments.shift()

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
                let nextTempVarName = nextTempVar instanceof VariableItem ? nextTempVar.Name : nextTempVar.TempVarEquivalent

                //require this block and next block to both use the same temp var
                if (thisTempVarName != nextTempVarName) { return }

                //replace temp var with final var
                block.Arguments[0] = nextBlock.Arguments[0]

                //if the temp var of the next chest is a %math operation, include that in this new chest
                if (nextTempVar instanceof NumberItem) {
                    nextTempVar.TempVarEquivalent = thisTempVarName
                    block.Arguments.push(nextTempVar)
                }

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
                throw new TCError("Chest item count cannot surpass than 27 (including tags)", 0, args[28 - tags.length - 1].CharStart, args[args.length - 1].CharEnd)
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
        //this is gonna need to heavily overhauled at some point to actually parse nbt
        return {
            "id": "item",
            "data": {
                "item": `{ Count:${item.Count}b,DF_NBT:3700,id:"${item.Id}"}`
            }
        }
    }
    else {
        console.log(item)
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
            console.log(block)
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