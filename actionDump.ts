//middleman between action dump and the rest of the code

const ACTION_DUMP = await Bun.file("actiondump.json").json()

export class Action {
    constructor(tcName: string, dfName: string, tags: Dict<Array<string>>){
        this.TCName = tcName
        this.DFName = dfName
        this.Tags = tags
    }

    DFName: string
    TCName: string
    Tags: Dict<Array<string>>
}

//key: terracotta name, value: diamondfire id
export const ValidLineStarters = {
    "PLAYER_EVENT": "event",
    "ENTITY_EVENT": "entity_event",
    "FUNCTION": "func",
    "PROCESS": "process"
}

//key: function name in terracotta, value: sign value in df
export let ValidPlayerActions: Dict<Action> = {}
export let ValidPlayerCompActions: Dict<Action> = {}
export let ValidPlayerGameValues: Dict<string> = {}

export let ValidEntityActions: Dict<Action> = {}
export let ValidEntityCompActions: Dict<Action> = {}
export let ValidEntityGameValues: Dict<string> = {}

export let ValidGameActions: Dict<Action> = {}
export let ValidGameCompActions: Dict<Action> = {}
export let ValidGameGameValues: Dict<string> = {}

export let ValidSelectionEntityComparisons: Dict<Action> = {}
export let ValidSelectionPlayerComparisons: Dict<Action> = {}

//name overrides
//key: dimaondfire id, value: func name in terracotta

//players
const PlayerActionOverrides = {
    "DisableBlocks": "DisableBlockModification",
    "EnableBlocks": "EnableBlockModification",
    "SetNamePrefix": "SetNameAffix",
    "PlayEntitySound": "PlaySoundFromEntity",
    "SendToPlot": "SendToPlot",
    "MobDisguise": "DisguiseAsMob",
    "AdventureMode": "SetToAdventureMode",
    "SpectatorMode": "SetToSpectatorMode",
    "CreativeMode": "SetToCreativeMode",
    "SurvivalMode": "SetToSurvivalMode"
}
const PlayerCompActionOverrides = {}

//entities
const EntityActionOverrides = {
    "SetBaby": "SetIsBaby",
    "TDisplaySeeThru": "SetTextDisplaySeeThrough",
    "DispRotAxisAngle": "SetDisplayRotationFromAxisAngle"
}
const EntityCompActionOverrides = {
    "HasPlayer": "HasPlayer"
}

//game
const GameActionOverrides = {
    "LaunchProj": "LaunchProjectile"
}
const GameCompActionOverrides = {}

//game values
const GameValueOverrides = {
    "X-Coordinate": "X",
    "Y-Coordinate": "Y",
    "Z-Coordinate": "Z"
}

//all targeted gvs that work with players but not entities
//why isnt this in the action dump akjdfhgnbadm,nfvlkjhdfh
//df game value names
export const InvalidEntityGameValues = [
    "Food Level", 
    "Food Saturation", 
    "Food Exhaustion", 
    "Attack Damage", 
    "Attack Speed", 
    "Attack Cooldown", 
    "Attack Cooldown Ticks", 
    "Experience Level",
    "Experience Progress",
    "Held Slot",
    "Ping",
    "Steer Sideways Movement",
    "Steer Forward Movement",
    "Hotbar Items",
    "Inventory Items",
    "Cursor Item",
    "Inventory Menu Items",
    "Saddle Item",
    "Entity Item",
    "Game Mode",
    "Open Inventory Title",
]

function getTags(actionData): Dict<Array<string>> {
    let actionJson = {}

    for (const tag of actionData.tags) {
        let tagList: Array<string> = []

        actionJson[tag.name] = tagList
        
        for (const option of tag.options) {
            tagList.push(option.name)
        }
    }
    return actionJson
}

function codeifyName(name: string): string {
    //convert characters following spaces to uppercase
    for (let i = 0; i < name.length; i++) {
        if (name[i] == " ") {
            name = name.substring(0, i+1) + name[i+1].toUpperCase() + name.substring(i+2)
        }
    }
    //remove spaces
    name = name.replace(/ /g,"")

    return name
}

//convert code blocks
for (const action of ACTION_DUMP.actions) {
    let overrides
    let validActions

    //figure out what tables to use for this code block
    switch (action.codeblockName) {
        case "PLAYER ACTION":
            overrides = PlayerActionOverrides
            validActions = ValidPlayerActions
            break
        case "IF PLAYER":
            overrides = PlayerCompActionOverrides
            validActions = ValidPlayerCompActions
            break
        case "ENTITY ACTION":
            overrides = EntityActionOverrides
            validActions = ValidEntityActions
            break
        case "IF ENTITY":
            overrides = EntityCompActionOverrides
            validActions = ValidEntityCompActions
            break
        case "GAME ACTION":
            overrides = GameActionOverrides
            validActions = ValidGameActions
            break
        case "IF GAME":
            overrides = GameCompActionOverrides
            validActions = ValidGameCompActions
            break
    }

    //if this is not a supported code block, skip it
    if (validActions == null) { continue }

    //remove all spaces in code block name
    //let name = action.icon.name.replace(/ /g,"")
    let name = codeifyName(action.icon.name)

    //if code block name is empty, skip it
    if (name.length == 0) {continue}
 
    if (overrides[action.name]) {
        name = overrides[action.name]
    }

    validActions[name] = new Action(name,action.name,getTags(action))
}

//= valid selection conditions =\\
//if player
for (let [tcName, action] of Object.entries(ValidPlayerCompActions)) {
    if (ValidEntityCompActions[tcName]) {
        //if this is one of the things thats in both if entity and if player, specify this as the player version
        ValidSelectionPlayerComparisons[tcName] = new Action(tcName,"P"+action?.DFName,action?.Tags!)
    } else {
        ValidSelectionPlayerComparisons[tcName] = action
    }
}

//if player
for (let [tcName, action] of Object.entries(ValidEntityCompActions)) {
    if (ValidPlayerCompActions[tcName]) {
        //if this is one of the things thats in both if entity and if player, specify this as the entity version
        ValidSelectionEntityComparisons[tcName] = new Action(tcName,"E"+action?.DFName,action?.Tags!)
    } else {
        ValidSelectionEntityComparisons[tcName] = action
    }
}

/* view names when deciding overrides */
// for (let [k,v] of Object.entries(ValidGameCompActions)) {
//     console.log(k,"  :  ",v?.DFName)
// }

//convert game values
for (const value of ACTION_DUMP.gameValues) {
    let name = value.icon.name.replace(/ /g,"")
    if (GameValueOverrides[value.icon.name]) {name = GameValueOverrides[value.icon.name]}

    //plot game values
    if (value.category == "Event Values" || value.category == "Plot Values") {
        ValidGameGameValues[name] = value.icon.name
    }
    //targeted game values 
    else {
        ValidPlayerGameValues[name] = value.icon.name
        if (!InvalidEntityGameValues.includes(value.icon.name)) {
            ValidEntityGameValues[name] = value.icon.name
        }
    }
}