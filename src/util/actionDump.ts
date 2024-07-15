const ACTION_DUMP_JSON = await Bun.file("actiondump.json").json()
const OVERRIDES_JSON = await Bun.file("src/overrides.json").json()
import { ValueType, PLAYER_ONLY_GAME_VALUES } from "./constants"

//==========[ classes ]=========\\

/*
    example for how Set To RGB Color's final param data structre would look since the parameter data structure is kinda confusing:

    Parameters = [
        Parameter(
            Groups: [
                [Entry("Variable to set",var)]
            ]
        ),
        Parameter(
            Groups: [
                [Entry("Red", num), Entry("Green", num), Entry("Blue", num)],
                [Entry("R, G, B Values",list)]
            ]
        )
    ]
*/
   

export class ParameterValue {
    constructor(dfType: string | null = null, description: string = "", optional: boolean = false, plural: boolean = false, notes: string[] = []) {
        if (dfType === null) { return }
        this.DFType = dfType
        this.Description = description
        this.Optional = optional
        this.Plural = plural
        this.Notes = notes
    }

    /**type string used by the df action dump */
    DFType: string
    Plural: boolean
    Optional: boolean
    Description: string
    Notes: string[] = []
}

export type ParameterGroup = ParameterValue[]

export class Parameter {
    constructor(groups: ParameterGroup[] | null = null) {
        if (groups == null) { return }

        this.Groups = groups
    }

    //different entries in array are different possibilities (they are seperated by OR in df codeblock description)
    //arrays one level down from that all the parameters grouped into that possiblity
    Groups: ParameterGroup[] = []
}

export class Particle {
    Name: string
    Fields: string[]
}

export class Tag {
    Name: string
    Options: string[]
    Default: string
    //chest slot this tag should be placed in
    ChestSlot: number

    //df identifier
    Codeblock: string
    //df name
    Action: string
}

export class Action {
    //identifier of the code block this action belongs to
    Codeblock: string
    //sign name used by diamondfire
    DFId: string
    //name used in terracotta
    TCId: string
    //list of tags, key = tag name
    Tags: Dict<Tag>
    //description lore that shows up when you hover over the action in df
    //DOES NOT INCLUDE PARAMETER INFORMATION!!
    Description: string
    AdditionalInfo: string[]

    Parameters: Parameter[]
    ReturnValues: Parameter[]

    //will be true or false for events, undefined for non-events
    Cancellable: boolean | undefined
    CancelledAutomatically: boolean | undefined
    
    //type this action returns
    ReturnType: ValueType | null = null
}

export class GameValue {
    //name of the game value used by df
    DFId: string
    //name of the game value used by terracotta
    TCId: string
    //type this game value resolves to
    ReturnType: ValueType
    //return type string used by df
    DFReturnType: string
    
    Description: string
    ReturnDescription: string
    AdditionalInfo: string[]
}

//==========[ public data ]=========\\

//actions grouped by the code block they belong to
//first level keys are df codeblock identifier (e.g. "player_action")
//second level keys are terracotta action names
export var TCActionMap: Dict<Dict<Action>> = {}

//second level keys are diamondfire action names
export var DFActionMap: Dict<Dict<Action>> = {}

//second level keys are terracotta action names
//DFName of the actions contained within are the differentiated versions used by While and Selection subactions
export var DifferentiatedTCActionMap: Dict<Dict<Action>> = {}

//second level keys are the differentiated df names mentioned above
export var DifferentiatedDFActionMap: Dict<Dict<Action>> = {}

//game values, key = game value name used by terracotta
export var TCGameValueMap: Dict<GameValue> = {}

//game values, key = game value identifier used by diamondfire
export var DFGameValueMap: Dict<GameValue> = {}

//game values which have a target, key = game value identifier used by diamondfire
export var DFTargetedGameValues = {}

//game values which can target entities, key = game value identifier used by diamondfire
export var DFEntityGameValues = {}

//game values which have no target, key = game value identifier used by diamondfire
export var DFUntargetedGameValues = {}

//game values which have a target, key = terracotta gv name
export var TCTargetedGameValues = {}

//game values which can target entities, key = terracotta gv name
export var TCEntityGameValues = {}

//game values which have no target, key = terracotta gv name
export var TCUntargetedGameValues = {}

//key = particle name
export var Particles: Dict<Particle> = {}

//valid sound names
export var Sounds: Set<string> = new Set([])

//valid potion names
export var Potions: string[] = []

//every possible particle field (the other fields are filled when going through action dump)
export var AllParticleFields: string[] = ["Amount", "Spread"]

//this probably doesn't belong in the action dump file but whatever
export const ConstructorSignatures = { 
    "vec": [
        new Parameter([[new ParameterValue("NUMBER","X")]]),
        new Parameter([[new ParameterValue("NUMBER","Y")]]),
        new Parameter([[new ParameterValue("NUMBER","X")]]),
    ],
    "loc": [
        new Parameter([[new ParameterValue("NUMBER","X")]]),
        new Parameter([[new ParameterValue("NUMBER","Y")]]),
        new Parameter([[new ParameterValue("NUMBER","Z")]]),
        new Parameter([[new ParameterValue("NUMBER","Pitch",true)]]),
        new Parameter([[new ParameterValue("NUMBER","Yaw",true)]]),
    ],
    "pot": [
        new Parameter([[new ParameterValue("TEXT","Potion")]]),
        new Parameter([[new ParameterValue("NUMBER","Amplifier",true)]]),
        new Parameter([[new ParameterValue("NUMBER","Duration",true)]]),
    ],
    "snd": [
        new Parameter([[new ParameterValue("TEXT","Sound")]]),
        new Parameter([[new ParameterValue("NUMBER","Volume",true)]]),
        new Parameter([[new ParameterValue("NUMBER","Pitch",true)]]),
        new Parameter([[new ParameterValue("TEXT","Variant",true)]]),
    ],
    "csnd": [
        new Parameter([[new ParameterValue("TEXT","Sound")]]),
        new Parameter([[new ParameterValue("NUMBER","Volume",true)]]),
        new Parameter([[new ParameterValue("NUMBER","Pitch",true)]])
    ],
    "item": [
        new Parameter([[new ParameterValue("TEXT","Item")]]),
        new Parameter([[new ParameterValue("NUMBER","Count",true)]]),
    ],
    "litem": [
        new Parameter([[new ParameterValue("TEXT","Library")]]),
        new Parameter([[new ParameterValue("TEXT","Item")]]),
        new Parameter([[new ParameterValue("NUMBER","Count",true)]]),
    ],
    "par": [
        new Parameter([[new ParameterValue("TEXT","Particle")]]),
        new Parameter([[new ParameterValue("DICT","Data",true)]]),
    ]
}

//==========[ private data ]=========\\

//key: how a return type appears in the action dump
//value: terracotta type name
export const DFTypeToTC = {
    NUMBER: "num",
    LOCATION: "loc",
    VECTOR: "vec",
    ITEM: "item",
    LIST: "list",
    POTION: "pot",
    PARTICLE: "par",
    SOUND: "snd",
    COMPONENT: "txt",
    TEXT: "str",
    DICT: "dict",
    VARIABLE: "var",
    ANY_TYPE: "any",
    BLOCK_TAG: "str",
    BLOCK: "item",
    ENTITY_TYPE: "item",
    PROJECTILE: "item",
    VEHICLE: "item",
    SPAWN_EGG: "item",
}

export const TCTypeToDF = {
    
}

export const DFTypeToString = {
    NUMBER: "Number",
    LOCATION: "Location",
    VECTOR: "Vector",
    ITEM: "Item",
    LIST: "List",
    POTION: "Potion",
    PARTICLE: "Particle",
    SOUND: "Sound",
    COMPONENT: "Styled Text",
    TEXT: "String",
    DICT: "Dictionary",
    VARIABLE: "Variable",
    ANY_TYPE: "Any Value",
    BLOCK_TAG: "Block Tag",
    BLOCK: "Block",
    ENTITY_TYPE: "Entity Type",
    PROJECTILE: "Projectile",
    VEHICLE: "Vehicle",
    SPAWN_EGG: "Spawn Egg",
    NONE: "None"
}

//key: codeblock name (e.g. "PLAYER ACTION")
//value: codeblock identifier (e.g. "player_action")
const NameToIdentifierMap = {}

//==========[ private functions ]=========\\

function CodeifyName(name: string): string {
    //convert characters following spaces to uppercase
    for (let i = 0; i < name.length; i++) {
        if (name[i] == " " && name[i+1]) {
            name = name.substring(0, i+1) + name[i+1].toUpperCase() + name.substring(i+2)
        }
    }
    //remove spaces
    name = name.replace(/ /g,"")

    return name
}

function ParseArgumentValueThingies(args: any[]): Parameter[] {
    let result: Parameter[] = []

    let heldValues: ParameterValue[] = []
    let currentGroupList: ParameterGroup[] = []

    //shut up about the name! it makes sense ok!!!!!!!
    let currentlyORing = false

    let i = -1
    for (const arg of args) {
        i++
        if (arg.type) {
            let entry = new ParameterValue()
            entry.Description = arg.description ? arg.description.join(" ") : ""
            entry.Optional = arg.optional
            entry.Plural = arg.plural
            entry.DFType = arg.type

            if (arg.notes) {
                arg.notes.forEach((note: string[]) => {
                    entry.Notes.push(note.join(" "))
                });
            }
            heldValues.push(entry)
        }
        //we are in a parameter with OR, push all held values as a group
        else if (arg.text == "OR") {
            currentGroupList.push(heldValues)
            heldValues = []
            currentlyORing = true
        }
        //if hitting "" line or EOF
        if ( (arg.text === "") || (i+1 >= args.length) ) {
            //if this is the end of an OR parameter, push held values as group and then push parameter containing held groups
            if (currentlyORing) {
                currentGroupList.push(heldValues)

                let parameter = new Parameter()
                parameter.Groups = currentGroupList
                currentGroupList = []

                result.push(parameter)

                currentlyORing = false
            }
            //otherwise, push all held values as their own parameters
            else {
                heldValues.forEach(entry => {
                    let parameter = new Parameter()
                    parameter.Groups = [[entry]]
                    result.push(parameter)
                })
            }
            heldValues = []
        }
    }

    return result
}

//==========[ populate data tables ]=========\\

// codeblock pass \\
for (const codeblockData of ACTION_DUMP_JSON.codeblocks) {
    let id = codeblockData.identifier
    NameToIdentifierMap[codeblockData.name] = id
    TCActionMap[id] = {}
    DFActionMap[id] = {}
    DifferentiatedTCActionMap[id] = {}
    DifferentiatedDFActionMap[id] = {}
}

// action pass \\
for (const actionJson of ACTION_DUMP_JSON.actions) {
    let codeblockId = NameToIdentifierMap[actionJson.codeblockName]
    
    let nameOverrides = OVERRIDES_JSON.actionNames[codeblockId] || {}
    let returnTypeOverrides = OVERRIDES_JSON.returnTypes[codeblockId] || {}

    let dfId = actionJson.name
    let tcId = nameOverrides[actionJson.name] || CodeifyName(actionJson.icon.name)

    //return type
    let returnType: ValueType | null = returnTypeOverrides[actionJson.name] ? ValueType[returnTypeOverrides[actionJson.name]] : null
    if (actionJson.icon.returnValues && actionJson.icon.returnValues.length > 0) {
        if (actionJson.icon.returnValues.length == 1) {
            returnType = ValueType[DFTypeToTC[actionJson.icon.returnValues[0].type]]
        } 
        //if an action could return more than one type just mark it as "any"
        //and let special behavior in compiler handle it
        else {
            returnType = ValueType.any
        }
    }

    //tags
    let tags: Dict<Tag> = {}
    for (const tagJson of actionJson.tags) {
        let tag = new Tag()
        tag.Codeblock = codeblockId
        tag.Action = dfId
        tag.Name = tagJson.name
        tag.Options = tagJson.options.map((optionData) => optionData.name)
        tag.Default = tagJson.defaultOption
        tag.ChestSlot = tagJson.slot
        tags[tagJson.name] = tag
    }

    
    //parameters and return value
    let parameters: Parameter[] = []
    if (actionJson.icon?.arguments) { parameters = ParseArgumentValueThingies(actionJson.icon.arguments) }

    let returnValues: Parameter[] = []
    if (actionJson.icon?.returnValues) { returnValues = ParseArgumentValueThingies(actionJson.icon?.returnValues) }
    
    let descriptionString = actionJson.icon.description.join(" ")

    let additionalInfo = actionJson.icon.additionalInfo ? actionJson.icon.additionalInfo.map(entry => {
        return entry.join(" ")  
    }) : []

    //normal action
    let normalAction = new Action()
    normalAction.Codeblock = codeblockId
    normalAction.TCId = tcId
    normalAction.DFId = dfId
    normalAction.Tags = tags
    normalAction.ReturnType = returnType
    normalAction.Description = descriptionString
    normalAction.AdditionalInfo = additionalInfo
    normalAction.Parameters = parameters
    normalAction.ReturnValues = returnValues
    normalAction.Cancellable = actionJson.icon.cancellable
    normalAction.CancelledAutomatically = actionJson.icon.cancelledAutomatically
    
    TCActionMap[codeblockId]![tcId] = normalAction
    DFActionMap[codeblockId]![dfId] = normalAction
    
    //differentiated action
    let differentiatedAction = new Action()
    differentiatedAction.Codeblock = codeblockId
    differentiatedAction.TCId = tcId
    differentiatedAction.DFId = dfId
    differentiatedAction.Tags = tags
    differentiatedAction.ReturnType = returnType
    differentiatedAction.Description = descriptionString
    differentiatedAction.AdditionalInfo = additionalInfo
    differentiatedAction.Parameters = parameters
    differentiatedAction.ReturnValues = returnValues
    differentiatedAction.Cancellable = actionJson.icon.cancellable
    differentiatedAction.CancelledAutomatically = actionJson.icon.cancelledAutomatically
    
    //check all aliases
    for (const alias of actionJson.aliases) {
        //if this alias starts with the if block's corresponding letter assume its a differentiation
        if (
            alias[0] == "G" && codeblockId == "if_game" ||
            alias[0] == "P" && codeblockId == "if_player" ||
            alias[0] == "E" && codeblockId == "if_entity"
        ) {
            differentiatedAction.DFId = alias
            break
        }
    }

    DifferentiatedTCActionMap[codeblockId]![tcId] = differentiatedAction
    DifferentiatedDFActionMap[codeblockId]![dfId] = differentiatedAction
}

// game value pass \\
for (const gameValueJson of ACTION_DUMP_JSON.gameValues) {
    let value = new GameValue()
    value.DFId = gameValueJson.icon.name
    value.TCId = OVERRIDES_JSON.gameValues[gameValueJson.icon.name] || CodeifyName(gameValueJson.icon.name)
    value.ReturnType = DFTypeToTC[gameValueJson.icon.returnType]
    value.DFReturnType = gameValueJson.icon.returnType
    value.Description = gameValueJson.icon.description.join(" ")
    value.ReturnDescription = gameValueJson.icon.returnDescription.join(" ")
    value.AdditionalInfo = gameValueJson.icon.additionalInfo.map(entry => {
        return entry.join(" ")  
    })
3
    DFGameValueMap[value.DFId] = value
    TCGameValueMap[value.TCId] = value

    if (gameValueJson.category == "Plot Values" || gameValueJson.category == "Event Values") {
        DFUntargetedGameValues[value.DFId] = value
        TCUntargetedGameValues[value.TCId] = value
    } else {
        DFTargetedGameValues[value.DFId] = value
        TCTargetedGameValues[value.TCId] = value
    }
    if (!PLAYER_ONLY_GAME_VALUES.includes(value.DFId)) {
        DFEntityGameValues[value.DFId] = value
        TCEntityGameValues[value.TCId] = value
    }
}

// particle pass \\
for (const particleJson of ACTION_DUMP_JSON.particles) {
    let par = new Particle()
    par.Name = particleJson.icon.name
    par.Fields = [...particleJson.fields,"Amount","Spread"]
    AllParticleFields.push(...particleJson.fields)
    Particles[par.Name] = par
}
AllParticleFields = [...new Set(AllParticleFields)]

// sound pass \\
for (const soundJson of ACTION_DUMP_JSON.sounds) {
    Sounds.add(soundJson.icon.name)
}

// potion pass \\
for (const potJson of ACTION_DUMP_JSON.potions) {
    Potions.push(potJson.icon.name)
}