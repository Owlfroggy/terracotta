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

export let ValidCreateSelectActions: Dict<Action> = {}
export let ValidFilterSelectActions: Dict<Action> = {}

export let ValidSelectionEntityComparisons: Dict<Action> = {}
export let ValidSelectionPlayerComparisons: Dict<Action> = {}

export let ValidSetVarVarActions: Dict<Action> = {}
export let ValidSetVarNumActions: Dict<Action> = {}
export let ValidSetVarStringActions: Dict<Action> = {}
export let ValidSetVarTextActions: Dict<Action> = {}
export let ValidSetVarLocActions: Dict<Action> = {}
export let ValidSetVarItemActions: Dict<Action> = {}
export let ValidSetVarListActions: Dict<Action> = {}
export let ValidSetVarDictActions: Dict<Action> = {}
export let ValidSetVarParticleActions: Dict<Action> = {}
export let ValidSetVarVectorActions: Dict<Action> = {}
export let ValidSetVarPotionActions: Dict<Action> = {}
export let ValidSetVarSoundActions: Dict<Action> = {}

export let ValidSetVarVarConds: Dict<Action> = {}
export let ValidSetVarNumConds: Dict<Action> = {}
export let ValidSetVarStringConds: Dict<Action> = {}
export let ValidSetVarTextConds: Dict<Action> = {}
export let ValidSetVarLocConds: Dict<Action> = {}
export let ValidSetVarItemConds: Dict<Action> = {}
export let ValidSetVarListConds: Dict<Action> = {}
export let ValidSetVarDictConds: Dict<Action> = {}
export let ValidSetVarParticleConds: Dict<Action> = {}
export let ValidSetVarVectorConds: Dict<Action> = {}
export let ValidSetVarPotionConds: Dict<Action> = {}
export let ValidSetVarSoundConds: Dict<Action> = {}

export let ValidRepeatActions: Dict<Action> = {}

//name overrides
//key: dimaondfire id, value: func name in terracotta

//repeat
const RepeatActionOverrides = {
    "Adjacent": "AdjacentBlocks",
    "Path": "Path",
    "Grid": "Grid",
    "ForEach": "List",
    "Sphere": "Sphere",
    " Range ": "Range",
    "ForEachEntry": "Dict"
}

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

//set var
const SetVarCondActionOverrides = {
    //var
    "=": "Equals",
    "!=": "DoesNotEqual",
    "InRange": "IsInRange",
    "VarExists": "Exists",
    "VarIsType": "IsType",

    //num
    ">": "GreaterThan",
    ">=": "GreaterThanOrEqualTo",
    "<": "LessThan",
    "<=": "LessThanOrEqualTo",

    //str
    "StringMatches": "Matches",
    "Contains": "Contains",
    "StartsWith": "StartsWith",
    "EndsWith": "EndsWith",

    //loc
    "LocIsNear": "IsNear",

    //item
    "ItemEquals": "Equals",
    "ItemIsBlock": "IsBlock",
    "BlockIsSolid": "IsSolid",
    "ItemHasTag": "HasTag",
    "ItemHasEnchantment": "HasEnchantment",

    //list
    "ListContains": "Contains",
    "ListValueEq": "ValueEquals",

    //dict
    "HasKey": "HasKey",
    "DictValueEquals": "ValueEquals"
}

const SetVarActionOverrides = {
    //var domain
    "PurgeVars": "PurgeMatching",
    "=": "Set",
    "Raycast": "Raycast",
    "RandomValue": "SetToRandom",
    "GetContainerItems": "GetContainerItems",

    //num domain
    "AbsoluteValue": "Abs",
    "%": "Remainder",
    "+": "Add",
    "-": "Subtract",
    "/": "Divide",
    "Bitwise": "Bitwise",
    "RandomNumber": "Random",
    "Average": "Average",
    "x": "Multiply",
    "MinNumber": "Min",
    "Sine": "Sin",
    "NormalRandom": "NormalRandom",
    "Logarithm": "Log",
    "WrapNum": "Wrap",
    "RootNum": "Root",
    "MaxNumber": "Max",
    "Tangent": "Tan",
    "+=": "Increment",
    " RoundNumber ": "Round",
    "-=": "Decrement",
    "Cosine": "Cos",
    "ParseNumber": "ParseNumber",
    "Exponent": "Exponent",
    "ClampNumber": "Clamp",

    //string domain
    "RepeatString": "Repeat",
    "JoinSring": "Join",
    "SplitString": "Split",
    "TrimString": "Trim",
    "ReplaceString": "Replace",
    "SetCase": "SetCase",
    "RemoveString": "Remove",
    "StringLength": "Len",

    //text domain
    "ParseMiniMessageExpr": "ParseExpression",
    "TrimStyledText": "Trim",
    "GetMiniMessageExpr": "GetExpression",
    "ContentLength": "Len",

    //loc domain
    "ShiftAllAxes": "ShiftAllAxes",
    "ShiftOnVector": "ShiftOnVector",
    "ShiftRotation": "ShiftRotation",
    "ShiftOnAxis": "ShiftOnAxis",
    "GetCenterLoc": "GetCenter",
    "AlignLoc": "Align",
    "FaceLocation": "FaceLocation",
    "SetAllCoords": "SetCoords",
    "ShiftInDirection": "ShiftInDirection",
    "Distance": "GetDistance",
    "GetDirection": "GetDirection",
    "GetCoord": "GetCoord",
    "RandomLoc": "Random",
    " SetDirection ": "SetDirection",
    "SetCoord": "SetCoord",
    "ShiftToward": "ShiftToward",
    "ShiftAllDirections": "ShiftAllDirections",

    //item domain
    "ClearItemTag": "ClearTags",
    "GetItemAttribute": "GetAttribute",
    " GetItemName ": "GetName",
    "GetItemRarity": "GetRarity",
    "AddItemAttribute": "AddAttribute",
    "SetItemDura": "SetDurability",
    "SetBreakability": "SetBreakability",
    " GetItemLore ": "GetLore",
    "SetItemTag": "SetTag",
    "GetItemAmount": "GetStackSize",
    "GetItemDura": "GetDurability",
    " SetItemName ": "SetName",
    "SetLodestoneLoc": "SetLodestoneLocation",
    "SetItemAmount": "SetStackSize",
    "AddItemEnchant": "AddEnchant",
    "GetItemType": "GetMaterial",
    "GetLoreLine": "GetLoreLine",
    "RemoveItemTag": "RemoveTag",
    "GetLodestoneLoc": "GetLodestoneLocation",
    "GetMaxItemAmount": "GetMaxStackSize",
    " SetItemEnchants ": "SetEnchantments",
    "SetItemType": "SetMaterial",
    "GetItemColor": "GetColor",
    " GetItemEnchants ": "GetEnchantments",
    "SetItemColor": "SetColor",
    "SetItemFlags": "SetVisiblityFlags",
    "GetItemEffects": "GetPotionEffects",
    " SetItemLore ": "SetItemLore",
    "SetItemEffects": "SetPotionEffects",
    "GetItemTag": "GetTag",
    "ClearEnchants": "ClearEnchantments",
    "RemItemEnchant": "RemoveEnchantment",
    "GetAllItemTags": "GetAllTags",

    //list domain
    "AppendValue": "Append",
    "PopListValue": "Pop",
    "ListLength": "Len",
    "ReverseList": "Reverse",
    "DedupList": "RemoveDuplicateElements",
    "RemoveListIndex": "Remove",
    "FlattenList": "Flatten",
    "SetListValue": "Set",
    "GetListValue": "Get",
    "InsertListValue": "Insert",
    "SortList": "Sort",
    "CreateList": "Create",
    "AppendList": "AppendList",
    "TrimList": "Trim",
    "GetValueIndex": "Find",
    "RandomizeList": "Randomize",
    "RemoveListValue": "RemoveValue",

    //dict domain
    "ClearDict": "Clear",
    "SortDict": "Sort",
    "CreateDict": "Create",
    "SetDictValue": "Set",
    "GetDictSize": "Len",
    "GetDictValues": "GetValues",
    "GetDictKeys": "GetKeys",
    "AppendDict": "AppendDictionary",
    "Remove": "RemoveDictEntry",
    "GetDictValue": "Get",
    
    //par domain
    "SetParticleType": "SetType",
    "GetParticleMat": "GetMaterial",
    "SetParticleSprd": "SetSpread",
    "GetParticleMotion": "GetMotion",
    "SetParticleMotion": "SetMotion",
    "GetParticleRoll": "GetRoll",
    "GetParticleAmount": "GetAmount",
    "SetParticleColor": "SetColor",
    "SetParticleAmount": "SetAmount",
    "GetParticleType": "GetType",
    "SetParticleMat": "SetMaterial",
    "SetParticleSize": "SetSize",
    "GetParticleSpread": "GetSpread",
    "GetParticleColor": "GetColor",
    "SetParticleRoll": "SetRoll",
    "GetParticleSize": "GetSize",

    //vec domain
    "MultiplyVector": "Multiply",
    "VectorBetween": "Between",
    "GetVectorComponent": "GetComponent",
    "RotateAroundVec": "RotateAroundVec",
    "CrossProduct": "Cross",
    "DotProduct": "Dot",
    "DirectionName": "GetDirectionName",
    "SetVectorLength": "SetLength",
    "AlignVector": "Align",
    "RotateAroundAxis": "RotateAroundAxis",
    "SubtractVectors": "Subtract",
    "Vector": "Set",
    "ReflectVector": "Reflect",
    "AddVectors": "Add",
    "SetVectorComp": "SetComponent",
    "GetVectorLength": "Len",

    //pot domain
    "GetPotionType": "GetType",
    "SetPotionDur": "SetDuration",
    "SetPotionType": "SetType",
    "SetPotionAmp": "SetAmplifier",
    "GetPotionAmp": "GetAmplifier",
    "GetPotionDur": "GetDuration",

    //sound domain
    "GetSoundVolume": "GetVolume",
    "GetCustomSound": "GetCustomKey",
    "SetSoundType": "SetType",
    "GetSoundType": "GetType",
    "GetSoundVariant": "GetVariant",
    "SetSoundVolume": "SetVolume",
    "SetSoundPitch": "SetPitch",
    "SetCustomSound": "SetCustomKey",
    "SetSoundVariant": "SetVariant",
    "GetSoundPitch": "GetPitch"
}


//select object
//IMPORTANT! only actions that are listed here will make it into the final exported dicts
const CreateSelectionOverrides = { //actions here will be placed into create selection
    "RandomPlayer": "RandomPlayers",
    "LastEntity": "LastSpawnedEntity",
    "EntityName": "EntitiesByName",
    "PlayerName": "PlayersByName",
    "AllEntities": "AllEntities",
    "Reset": "Nothing",
    "EventTarget": "EventTarget",
    "EntitiesCond": "EntitiesByCondition",
    "AllPlayers": "AllPlayers",
    "Invert": "Inverse",
    "PlayersCond": "PlayersByCondition"
}

const FilterSelectionOverrides = {
    "FilterRandom": "Randomly",
    "FilterDistance": "ByDistance",
    "FilterRay": "ByRaycast",
    "FilterCondition": "ByCondition",
    "FilterSort": "BySort"
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

//set var actions
const SetVarVarActions = [
    //stuff in var category
    "=","RandomValue","PurgeVars",
    //stuff in world category
    "GetBlockType","GetBlockData","GetAllBlockData","GetBlockGrowth","GetBlockPower","GetLight"," GetSignText ","ContainerName","ContainerLock","GetContainerItems","GetLecternBook","GetLecternPage","Raycast",
    //stuff in misc category
    "BlockHardness","BlockResistance","RGBColor","HSBColor","HSLColor","GetColorChannels"
]
const SetVarNumActions = ["+","-","x","/","%","+=","-=","Exponent","Root","Logarithm","ParseNumber","AbsoluteValue","ClampNumber","WrapNum","Average","RandomNumber"," RoundNumber ","MinNumber","MaxNumber","NormalRandom","Sine","Cosine","Tangent","Noise","GradientNoise","CellularNoise","ValueNoise","Bitwise"]
const SetVarStringActions = ["String","ReplaceString","RemoveString","TrimString","SplitString","JoinString","SetCase","StringLength","RepeatString","FormatTime","TranslateColors"]
const SetVarTextActions = ["StyledText","ClearFormatting","GetMiniMessageExpr","ParseMiniMessageExpr","TrimStyledText","ContentLength"]
const SetVarLocActions = ["GetCoord","SetCoord","SetAllCoords","ShiftOnAxis","ShiftAllAxes","ShiftInDirection","ShiftAllDirections","ShiftToward","ShiftOnVector","GetDirection"," SetDirection ","ShiftRotation","FaceLocation","AlignLoc","Distance","GetCenterLoc","RandomLoc"]
const SetVarItemActions = ["GetItemType","SetItemType"," GetItemName "," SetItemName "," GetItemLore ","GetLoreLine"," SetItemLore ","GetItemAmount","SetItemAmount","GetMaxItemAmount","GetItemDura","SetItemDura","SetBreakability"," GetItemEnchants "," SetItemEnchants ","AddItemEnchant","RemItemEnchant","ClearEnchants","GetHeadOwner","SetHeadTexture"," GetBookText ","SetBookText","GetItemTag","GetAllItemTags","SetItemTag","RemoveItemTag","ClearItemTag","SetModelData","GetItemEffects","SetItemEffects","SetItemFlags","GetCanPlaceOn","SetCanPlaceOn","GetCanDestroy","SetCanDestroy","GetItemRarity","GetLodestoneLoc","SetLodestoneLoc","SetArmorTrim","GetItemColor","SetItemColor","GetItemAttribute","AddItemAttribute","SetMapTexture"]
const SetVarListActions = ["CreateList","AppendValue","AppendList","GetListValue","PopListValue","SetListValue","GetValueIndex","ListLength","InsertListValue","RemoveListValue","RemoveListIndex","DedupList","TrimList","SortList","ReverseList","RandomizeList","FlattenList"]
const SetVarDictActions = ["CreateDict","SetDictValue","GetDictValue","GetDictSize","RemoveDictEntry","ClearDict","GetDictKeys","GetDictValues","AppendDict","SortDict"]
const SetVarParticleActions = ["GetParticleType","SetParticleType","GetParticleAmount","SetParticleAmount","GetParticleSprd","SetParticleSprd","GetParticleSize","SetParticleSize","GetParticleMat","SetParticleMat","GetParticleColor","SetParticleColor","GetParticleMotion","SetParticleMotion","GetParticleRoll","SetParticleRoll"]
const SetVarVectorActions = ["Vector","VectorBetween","GetVectorComp","SetVectorComp","GetVectorLength","SetVectorLength","MultiplyVector","AddVectors","SubtractVectors","AlignVector","RotateAroundAxis","RotateAroundVec","ReflectVector","CrossProduct","DotProduct","DirectionName"]
const SetVarPotionActions = ["GetPotionType","SetPotionType","GetPotionAmp","SetPotionAmp","GetPotionDur","SetPotionDur"]
const SetVarSoundActions = ["GetSoundType","SetSoundType","GetSoundVariant","SetSoundVariant","GetCustomSound","SetCustomSound","GetSoundPitch","SetSoundPitch","GetSoundVolume","SetSoundVolume"]

const SetVarVarConds = ["=","!="," InRange ","VarExists","VarIsType"]
const SetVarNumConds = [">=",">","<=","<"]
const SetVarStringConds = ["StringMatches","Contains","StartsWith","EndsWith",]
const SetVarTextConds: Array<string> = []
const SetVarLocConds = ["LocIsNear"]
const SetVarItemConds = ["ItemEquals","ItemIsBlock","BlockIsSolid","ItemHasTag","ItemHasEnchant"]
const SetVarListConds = ["ListContains","ListValueEq"]
const SetVarDictConds = ["DictHasKey","DictValueEquals"]
const SetVarParticleConds: Array<string> = []
const SetVarVectorConds: Array<string> = []
const SetVarPotionConds: Array<string> = []
const SetVarSoundConds: Array<string> = []
    

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
        case "REPEAT":
            overrides = RepeatActionOverrides
            validActions = ValidRepeatActions
            break
        case "IF VARIABLE":
            overrides = SetVarCondActionOverrides
            validActions = 
                SetVarVarConds.includes(action.name) ? ValidSetVarVarConds :
                SetVarNumConds.includes(action.name) ? ValidSetVarNumConds :
                SetVarStringConds.includes(action.name) ? ValidSetVarStringConds :
                SetVarTextConds.includes(action.name) ? ValidSetVarTextConds :
                SetVarLocConds.includes(action.name) ? ValidSetVarLocConds :
                SetVarItemConds.includes(action.name) ? ValidSetVarItemConds :
                SetVarListConds.includes(action.name) ? ValidSetVarListConds :
                SetVarDictConds.includes(action.name) ? ValidSetVarDictConds :
                SetVarParticleConds.includes(action.name) ? ValidSetVarParticleConds :
                SetVarVectorConds.includes(action.name) ? ValidSetVarVectorConds :
                SetVarPotionConds.includes(action.name) ? ValidSetVarPotionConds :
                SetVarSoundConds.includes(action.name) ? ValidSetVarSoundConds : null
            if (validActions == null) {
                //console.log("Unassigned IF VARIABLE action:",action.name)
                continue
            }
            break
        case "SET VARIABLE":
            overrides = SetVarActionOverrides
            validActions = 
                SetVarVarActions.includes(action.name) ? ValidSetVarVarActions :
                SetVarNumActions.includes(action.name) ? ValidSetVarNumActions :
                SetVarStringActions.includes(action.name) ? ValidSetVarStringActions :
                SetVarTextActions.includes(action.name) ? ValidSetVarTextActions :
                SetVarLocActions.includes(action.name) ? ValidSetVarLocActions :
                SetVarItemActions.includes(action.name) ? ValidSetVarItemActions :
                SetVarListActions.includes(action.name) ? ValidSetVarListActions :
                SetVarDictActions.includes(action.name) ? ValidSetVarDictActions :
                SetVarParticleActions.includes(action.name) ? ValidSetVarParticleActions :
                SetVarVectorActions.includes(action.name) ? ValidSetVarVectorActions :
                SetVarPotionActions.includes(action.name) ? ValidSetVarPotionActions :
                SetVarSoundActions.includes(action.name) ? ValidSetVarSoundActions : null
            if (validActions == null) {
                //console.log("Unassigned SET VARIABLE action:",action.name)
                continue
            }
            break
    }

    //special logic for select
    if (action.codeblockName == "SELECT OBJECT") {
        if (CreateSelectionOverrides[action.name]) {
            ValidCreateSelectActions[CreateSelectionOverrides[action.name]] = new Action(CreateSelectionOverrides[action.name],action.name,getTags(action))
        } else if (FilterSelectionOverrides[action.name]) {
            ValidFilterSelectActions[FilterSelectionOverrides[action.name]] = new Action(FilterSelectionOverrides[action.name],action.name,getTags(action))
        }
    } 
    //logic for everything else
    else {
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
// for (let [k,v] of Object.entries(ValidSetVarSoundActions)) {
//     console.log(k,"  :  |"+v?.DFName+"|")
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