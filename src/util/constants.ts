export const ITEM_DF_NBT = 3705

//valid types
export enum ValueType {
    "str" = "str", //idk why i have to define them this way but typescript gets mad if i don't
    "num" = "num",
    "vec" = "vec",
    "loc" = "loc",
    "pot" = "pot",
    "var" = "var",
    "snd" = "snd",
    "txt" = "txt",
    "item" = "item",
    "list" = "list",
    "dict" = "dict",
    "par" = "par",
    "any" = "any"
}

//value: type name that df uses in code item serialization
export const DF_TYPE_MAP = {
    [ValueType.str]: "txt",
    [ValueType.txt]: "comp",
    [ValueType.num]: "num",
    [ValueType.loc]: "loc",
    [ValueType.vec]: "vec",
    [ValueType.snd]: "snd",
    [ValueType.par]: "part",
    [ValueType.pot]: "pot",
    [ValueType.item]: "item",
    [ValueType.any]: "any",
    [ValueType.var]: "var",
    [ValueType.list]: "list",
    [ValueType.dict]: "dict",
}

//==========[ keywords ]=========\\
//keywords that will trigger control block parsing if encountered
export const VALID_CONTROL_KEYWORDS = ["break","continue","return","returnmult","wait","endthread"]

//keywords that are valid in a parameter's modifier list
export const VALID_PARAM_MODIFIERS = ["plural","optional"]

//key: keywords that trigger variable parsing in terracotta
//value: the corresponding df scope id
export const VALID_VAR_SCOPES = {
    "global": "unsaved",
    "saved": "saved",
    "local": "local",
    "line": "line"
}

//keywords that if placed on their own at the top of a file will be parsed as a header
export const VALID_HEADER_KEYWORDS = ["LAGSLAYER_CANCEL"]

//keywords that are valid line starter blocks
export const VALID_LINE_STARTERS = ["PLAYER_EVENT","ENTITY_EVENT","PROCESS","FUNCTION"]

//operators that can be used to assign a value to a variable
export const VALID_ASSIGNMENT_OPERATORS = ["=", "+=", "-=", "*=", "/=", "%="]

//operators that can be used in expressions
export const VALID_MATH_OPERATORS = ["+", "-", "*", "/", "^", "%"]

//operators that do comparisons
export const VALID_COMPARISON_OPERATORS = ["==", "!=", "<", ">", "<=", ">="]

//==========[ misc ]=========\\

//game values that cannot be applied to entities
export const PLAYER_ONLY_GAME_VALUES = ["Food Level","Food Saturation","Food Exhaustion","Attack Damage","Attack Speed","Attack Cooldown","Attack Cooldown Ticks","Experience Level","Experience Progress","Held Slot","Ping","Steer Sideways Movement","Steer Forward Movement","Hotbar Items","Inventory Items","Cursor Item","Inventory Menu Items","Game Mode","Open Inventory Title"]

//==========[ domain lists ]=========\\

//controls which select actions go with the create keyword
//! IF A SELECTION ACTION ISN'T PRESENT IN THESE TABLES IT WON'T BE ACCESSIBLE AT ALL !
//df id
export const CREATE_SELECTION_ACTIONS = ["RandomPlayer","LastEntity","EntityName","PlayerName","AllEntities","Reset","EventTarget","EntitiesCond","AllPlayers","Invert","PlayersCond"]

//controls which select actions go with the filter keyword
//! IF A SELECTION ACTION ISN'T PRESENT IN THESE TABLES IT WON'T BE ACCESSIBLE AT ALL !
//df id
export const FILTER_SELECTION_ACTIONS = ["FilterRandom","FilterDistance","FilterRay","FilterCondition","FilterSort"]

//controls which set var actions go into which domains
//! IF A SET_VAR ACTION ISN'T PRESENT IN THIS TABLE IT WON'T BE ACCESSIBLE AT ALL !
export const TYPE_DOMAIN_ACTIONS = {
    var: [
        //stuff in var category
        "=","RandomValue","PurgeVars",
        //stuff in world category
        "GetBlockType","GetBlockData","GetAllBlockData","GetBlockGrowth","GetBlockPower","GetLight"," GetSignText ","ContainerName","ContainerLock","GetContainerItems","GetLecternBook","GetLecternPage","Raycast",
        //stuff in misc category
        "BlockHardness","BlockResistance","RGBColor","HSBColor","HSLColor","GetColorChannels"
    ],
    num: ["+", "-", "x", "/", "%", "+=", "-=", "Exponent", "Root", "Logarithm", "ParseNumber", "AbsoluteValue", "ClampNumber", "WrapNum", "Average", "RandomNumber", " RoundNumber ", "MinNumber", "MaxNumber", "NormalRandom", "Sine", "Cosine", "Tangent", "Noise", "GradientNoise", "CellularNoise", "ValueNoise", "Bitwise"],
    str: ["String", "ReplaceString", "RemoveString", "TrimString", "SplitString", "JoinString", "SetCase", "StringLength", "RepeatString", "FormatTime", "TranslateColors"],
    txt: ["StyledText", "ClearFormatting", "GetMiniMessageExpr", "ParseMiniMessageExpr", "TrimStyledText", "ContentLength"],
    loc: ["GetCoord", "SetCoord", "SetAllCoords", "ShiftOnAxis", "ShiftAllAxes", "ShiftInDirection", "ShiftAllDirections", "ShiftToward", "ShiftOnVector", "GetDirection", " SetDirection ", "ShiftRotation", "FaceLocation", "AlignLoc", "Distance", "GetCenterLoc", "RandomLoc"],
    item: ["GetItemType", "SetItemType", " GetItemName ", " SetItemName ", " GetItemLore ", "GetLoreLine", " SetItemLore ", "GetItemAmount", "SetItemAmount", "GetMaxItemAmount", "GetItemDura", "SetItemDura", "SetBreakability", " GetItemEnchants ", " SetItemEnchants ", "AddItemEnchant", "RemItemEnchant", "ClearEnchants", "GetHeadOwner", "SetHeadTexture", " GetBookText ", "SetBookText", "GetItemTag", "GetAllItemTags", "SetItemTag", "RemoveItemTag", "ClearItemTag", "SetModelData", "GetItemEffects", "SetItemEffects", "SetItemFlags", "GetCanPlaceOn", "SetCanPlaceOn", "GetCanDestroy", "SetCanDestroy", "GetItemRarity", "GetLodestoneLoc", "SetLodestoneLoc", "SetArmorTrim", "GetItemColor", "SetItemColor", "GetItemAttribute", "AddItemAttribute", "SetMapTexture"],
    list: ["CreateList", "AppendValue", "AppendList", "GetListValue", "PopListValue", "SetListValue", "GetValueIndex", "ListLength", "InsertListValue", "RemoveListValue", "RemoveListIndex", "DedupList", "TrimList", "SortList", "ReverseList", "RandomizeList", "FlattenList"],
    dict: ["CreateDict", "SetDictValue", "GetDictValue", "GetDictSize", "RemoveDictEntry", "ClearDict", "GetDictKeys", "GetDictValues", "AppendDict", "SortDict"],
    par: ["GetParticleType", "SetParticleType", "GetParticleAmount", "SetParticleAmount", "GetParticleSprd", "SetParticleSprd", "GetParticleSize", "SetParticleSize", "GetParticleMat", "SetParticleMat", "GetParticleColor", "SetParticleColor", "GetParticleMotion", "SetParticleMotion", "GetParticleRoll", "SetParticleRoll"],
    vec: ["Vector", "VectorBetween", "GetVectorComp", "SetVectorComp", "GetVectorLength", "SetVectorLength", "MultiplyVector", "AddVectors", "SubtractVectors", "AlignVector", "RotateAroundAxis", "RotateAroundVec", "ReflectVector", "CrossProduct", "DotProduct", "DirectionName"],
    pot: ["GetPotionType", "SetPotionType", "GetPotionAmp", "SetPotionAmp", "GetPotionDur", "SetPotionDur"],
    snd: ["GetSoundType", "SetSoundType", "GetSoundVariant", "SetSoundVariant", "GetCustomSound", "SetCustomSound", "GetSoundPitch", "SetSoundPitch", "GetSoundVolume", "SetSoundVolume"],
}

//controls which if var actions go into which domains
//! IF A IF_VAR ACTION ISN'T PRESENT IN THIS TABLE IT WON'T BE ACCESSIBLE AT ALL !
export const TYPE_DOMAIN_CONDITIONS = {
    var: ["=", "!=", " InRange ", "VarExists", "VarIsType"],
    num: [">=", ">", "<=", "<"],
    str: ["StringMatches", "Contains", "StartsWith", "EndsWith",],
    txt: [],
    loc: ["LocIsNear"],
    item: ["ItemEquals", "ItemIsBlock", "BlockIsSolid", "ItemHasTag", "ItemHasEnchant"],
    list: ["ListContains", "ListValueEq"],
    dict: ["DictHasKey", "DictValueEquals"],
    par: [],
    vec: [],
    pot: [],
    snd: [],
}