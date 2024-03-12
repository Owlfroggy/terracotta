const ACTION_DUMP = await Bun.file("actiondump.json").json()

//key: function name in terracotta, value: sign value in df
let ValidPlayerActions: Dict<string> = {}


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

for (const action of ACTION_DUMP.actions) {
    if (action.codeblockName == "PLAYER ACTION") {
        let name = action.icon.name.replace(/ /g,"")

        if (name.length == 0) {continue}

        if (PlayerActionOverrides[action.name]) {
            name = PlayerActionOverrides[action.name]
        }
        
        ValidPlayerActions[name] = action.name
    }
}

export {ValidPlayerActions}