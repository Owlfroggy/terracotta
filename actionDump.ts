const ACTION_DUMP = await Bun.file("actiondump.json").json()

//key: function name in terracotta, value: sign value in df
export let ValidPlayerActions: Dict<string> = {}
export let ValidPlayerCompActions: Dict<string> = {}
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
    validActions[name] = action.name
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

console.log(ValidPlayerGameValues)