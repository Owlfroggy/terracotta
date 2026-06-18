
import { NumberValue, StringValue, VectorValue } from "../compiler/codeValue.ts";
import * as fs from "node:fs/promises"
import { pathToFileURL } from "node:url";
import { DATA_PATH } from "../util/fileUtils.ts";

const ITEM_IDS_JSON   = JSON.parse((await fs.readFile( pathToFileURL(DATA_PATH+"item_ids.json") )).toString())
export const VALID_ITEM_IDS: Set<string> = new Set(ITEM_IDS_JSON);
const BLOCK_IDS_JSON   = JSON.parse((await fs.readFile( pathToFileURL(DATA_PATH+"block_ids.json") )).toString())
export const VALID_BLOCK_IDS: Set<string> = new Set(BLOCK_IDS_JSON);
/** contains block and item ids in the same set for when particles don't know what to allow */
export const BLOCK_OR_ITEM_IDS: Set<string> = new Set([...ITEM_IDS_JSON,...BLOCK_IDS_JSON]);

//controls which set var actions go into which domains
//! IF A SET_VAR ACTION ISN'T PRESENT IN THIS TABLE IT WON'T BE ACCESSIBLE AT ALL !
export const TYPE_DOMAIN_ACTIONS = {
    var: [
        //stuff in var category
        "=","RandomValue","PurgeVars",
        
        "RGBColor","HSBColor","HSLColor","GetColorChannels","WebResponse","DecimalRGB",
        //other stuff
        "JsonToValue", "ValueToJson",
    ],
    game: [
        //stuff in world category
        "GetBlockType","GetBlockData","GetAllBlockData","GetBlockGrowth","GetBlockPower","GetLight"," GetSignText ","ContainerName","ContainerLock","GetContainerItems","GetLecternBook","GetLecternPage","Raycast",
        //stuff in misc category
        "BlockHardness","BlockResistance",
    ],
    num: ["+", "-", "x", "/", "%", "+=", "-=", "Exponent", "Root", "Logarithm", "ParseNumber", "AbsoluteValue", "ClampNumber", "WrapNum", "Average", "RandomNumber", " RoundNumber ", "MinNumber", "MaxNumber", "NormalRandom", "Sine", "Cosine", "Tangent", "Noise", "GradientNoise", "CellularNoise", "ValueNoise", "Bitwise", "BounceNum", "ArcTangent2", "Interpolate", ],
    str: ["String", "ReplaceString", "RemoveString", "TrimString", "SplitString", "SetCase", "StringLength", "RepeatString", "FormatTime", "TranslateColors", "Base64Decode", "Base64Encode", "GzipDecompress", "GzipCompress", "SanitizeTags", "BytesToString", "StringToBytes", "AllRegexGroups", "GetRegexGroup", "NamedRegexGrps", "IndexOfSubstring", "SegmentString"],
    txt: ["StyledText", "ClearFormatting", "GetMiniMessageExpr", "ParseMiniMessage", "TrimStyledText", "ContentLength"],
    loc: ["GetCoord", "SetCoord", "SetAllCoords", "ShiftOnAxis", "ShiftAllAxes", "ShiftInDirection", "ShiftAllDirections", "ShiftToward", "ShiftOnVector", "GetDirection", " SetDirection ", "ShiftRotation", "FaceLocation", "AlignLoc", "Distance", "GetCenterLoc", "RandomLoc", "ClampLoc"],
    item: [
        // stuff in misc category
        "BlockHardness","BlockResistance",
        // other stuff
        "GetItemType", "SetItemType", " GetItemName ", " SetItemName ", " GetItemLore ", "GetLoreLine", " SetItemLore ", "GetItemAmount", "SetItemAmount", "GetMaxAmount", "GetItemDura", "SetItemDura", "SetBreakability", " GetItemEnchants ", " SetItemEnchants ", "AddItemEnchant", "RemItemEnchant", "ClearEnchants", "GetHeadOwner", " SetHeadTexture ", " GetBookText ", "SetBookText", "GetItemTag", "GetAllItemTags", "SetItemTag", "RemoveItemTag", "ClearItemTag", "GetItemEffects", "SetItemEffects", "GetCanPlaceOn", "SetCanPlaceOn", "GetCanDestroy", "SetCanDestroy", "GetItemRarity", "GetLodestoneLoc", "SetLodestoneLoc", "SetArmorTrim", "GetItemColor", "SetItemColor", "GetItemAttribute", "AddItemAttribute", "SetMapTexture", "SetMaxAmount", "GetBlockByMCTag", "GetItemByMCTag", "SetItemGlowing", "AddItemToolRule", "SetItemMaxDura", "SetItemTool", "SetItemHideTooltip", "GetBlockDrops", "AddItemLore", "RemoveItemAttrs", "ClearItemAttrs", "GetCrossbowProj", "SetCrossbowProj", "SetBundleItems", "SetBreakSound", "SetConsumable", "GetItemLeftover", "SetModelDataNums", "SetItemRarity", "GetBundleItems", "SetModelDataStrs", "GetModelDataStrs", "SetItemLeftover", "SetItemModel", "GetTooltipStyle", "GetModelDataNums", "GetBreakSound", "SetItemWeapon", "GetConsumable", "HiddenComponents", "GetItemModel", "SetAllItemTags", "GetItemWeapon", "SetTooltipStyle", "GetConsumable", "SetConsumable",
    ],
    list: ["CreateList", "AppendValue", "AppendList", "GetListValue", "PopListValue", "SetListValue", "GetValueIndex", "ListLength", "InsertListValue", "RemoveListValue", "RemoveListIndex", "DedupList", "TrimList", "SortList", "ReverseList", "RandomizeList", "FlattenList", "DestructureList", "JoinString"],
    dict: ["CreateDict", "SetDictValue", "GetDictValue", "GetDictSize", "RemoveDictEntry", "ClearDict", "GetDictKeys", "GetDictValues", "AppendDict", "SortDict"],
    par: ["GetParticleType", "SetParticleType", "GetParticleAmount", "SetParticleAmount", "GetParticleSprd", "SetParticleSprd", "GetParticleSize", "SetParticleSize", "GetParticleMat", "SetParticleMat", "GetParticleColor", "SetParticleColor", "GetParticleMotion", "SetParticleMotion", "GetParticleRoll", "SetParticleRoll", "SetParticleOpac", "GetParticleOpac", "GetParticleFade", "SetParticleFade", "GetParticleDur", "SetParticleDur", "SetParticlePower", "GetParticlePower"],
    vec: ["Vector", "VectorBetween", "GetVectorComp", "SetVectorComp", "GetVectorLength", "SetVectorLength", "MultiplyVector", "AddVectors", "SubtractVectors", "AlignVector", "RotateAroundAxis", "RotateAroundVec", "ReflectVector", "CrossProduct", "DotProduct", "DirectionName", "RotationVector", "RandomVector", "SwapVectorComp"],
    pot: ["GetPotionType", "SetPotionType", "GetPotionAmp", "SetPotionAmp", "GetPotionDur", "SetPotionDur"],
    snd: ["GetSoundType", "SetSoundType", "GetSoundVariant", "SetSoundVariant", "GetCustomSound", "SetCustomSound", "GetSoundPitch", "SetSoundPitch", "GetSoundVolume", "SetSoundVolume"],
}

//controls which if var actions go into which domains
//! IF A IF_VAR ACTION ISN'T PRESENT IN THIS TABLE IT WON'T BE ACCESSIBLE AT ALL !
export const TYPE_DOMAIN_CONDITIONS = {
    var: ["=", "!=", " InRange ", "VarExists", "VarIsType", "ValueIsEmpty"],
    game: [],
    num: [">=", ">", "<=", "<"],
    str: ["StringMatches", "Contains", "StartsWith", "EndsWith", "IsFiltered"],
    txt: [],
    loc: ["LocIsNear"],
    item: ["ItemEquals", "ItemIsBlock", "BlockIsSolid", "ItemHasTag", "ItemHasEnchant", "ItemIsUnbreakable"],
    list: ["ListContains", "ListValueEq", "ListSizeEquals"],
    dict: ["DictHasKey", "DictHasKeys", "DictValueEquals"],
    par: [],
    vec: [],
    pot: [],
    snd: [],
}

//controls which select actions go with the select/filter keywords
//! IF A SELECTION ACTION ISN'T PRESENT IN THESE TABLES IT WON'T BE ACCESSIBLE AT ALL !
//df name
export const CREATE_SELECTION_ACTION_LIST = ["RandomPlayer","LastEntity","EntityName","PlayerName","AllEntities","Reset","EventTarget","EntitiesCond","AllPlayers","Invert","PlayersCond","EntityUUID"]
export const FILTER_SELECTION_ACTION_LIST = ["FilterRandom","FilterDistance","FilterRay","FilterCondition","FilterSort"]


/** 
 * also serves as a registry of valid particle field names.
 * for that reason, all particle fields must be present here
 *  */
export const PARTICLE_FIELD_DEFAULTS = {
    amount: new NumberValue("1"),
    spreadHoriz: new NumberValue("0"),
    spreadVert: new NumberValue("0"),
    motion: new VectorValue("1", "0", "0"),
    motionVariation: new NumberValue("100"),
    color: new StringValue("#FF0000"),
    colorVariation: new NumberValue("0"),
    fadeColor: new StringValue("#000000"),
    material: new StringValue("oak_log"),
    size: new NumberValue("1"),
    sizeVariation: new NumberValue("0"),
    roll: new NumberValue("0"),
    opacity: new NumberValue("100"),
    power: new NumberValue("1"),
    duration: new NumberValue("20"),
}

/** only includes stuff that goes on the second-level data object */
export const DF_PAR_FIELD_TO_TC: {[dfName: string]: string} = {
    "Motion": "motion",
    "Motion Variation": "motionVariation",
    "Color": "color",
    "Fade Color": "fadeColor",
    "Color Variation": "colorVariation",
    "Material": "material",
    "Size": "size",
    "Size Variation": "sizeVariation",
    "Roll": "roll",
    "Opacity": "opacity",
    "Power": "power",
    "Duration": "duration",
}

/** whether or not a particle's material field uses block ids or item ids */
export const PAR_MATERIAL_FIELD_TYPES = {
    "Item": VALID_ITEM_IDS,
    "Dust Pillar": VALID_BLOCK_IDS,
    "Falling Dust": VALID_BLOCK_IDS,
    "Block Marker": VALID_BLOCK_IDS,
    "Block": VALID_BLOCK_IDS,
    "Block Crumble": VALID_BLOCK_IDS,
}