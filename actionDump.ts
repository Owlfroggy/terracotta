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

//key: function name in terracotta, value: sign value in df
export let ValidPlayerActions: Dict<Action> = {}
export let ValidPlayerCompActions: Dict<Action> = {}
export let ValidPlayerGameValues: Dict<string> = {}


//name overrides
//key: dimaondfire id, value: func name in terracotta
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

const PlayerCompActionOverrides = {

}

const GameValueOverrides = {
    "X-Coordinate": "X",
    "Y-Coordinate": "Y",
    "Z-Coordinate": "Z"
}

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
    }

    //if this is not a supported code block, skip it
    if (validActions == null) { continue }

    //remove all spaces in code block name
    let name = action.icon.name.replace(/ /g,"")

    //if code block name is empty, skip it
    if (name.length == 0) {continue}
 
    if (overrides[action.name]) {
        name = validActions[action.name]
    }
    validActions[name] = new Action(name,action.name,getTags(action))
}

//convert game values
for (const value of ACTION_DUMP.gameValues) {
    let name = value.icon.name.replace(/ /g,"")
    if (GameValueOverrides[value.icon.name]) {name = GameValueOverrides[value.icon.name]}

    //plot game values
    if (value.category == "Event Values" || value.category == "Plot Values") {
        
    }
    //targeted game values 
    else {
        ValidPlayerGameValues[name] = value.icon.name
    }
}