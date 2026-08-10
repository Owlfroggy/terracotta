import { Expression } from "../ast/expression.ts";
import { ParameterSignature } from "../compiler/namespace/definition.ts";
import { getWidestType, ListTypeData, Type } from "../typeProcessor/type.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { getTagsAndArgTypes } from "../util/utils.ts";

const firstListGenericType = (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
    let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
    if (argTypes.length > 0 && argTypes[0].matches(Type.list)) {
        return (argTypes[0].data as ListTypeData).genericType;
    }
    return Type.unknown;
};

const tagDifferentiatedMaterial = (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
    let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
    if (argTypes.length > 0 && argTypes[0].matches(Type.list)) {
        return (argTypes[0].data as ListTypeData).genericType;
    }
    return Type.unknown;
};

export const OVERRIDES: {
    actionNames: {[codeblock: string]: {[dfName: string]: string}},
    tagNames: {[dfName: string]: string},
    gameValueNames: {[dfName: string]: string},
    returnTypes: {[codeblock: string]: {[actionDFName: string]: Type | ((args: Expression[], types: TypeProcessor, methodCallOf?: Type) => Type) }},
    returnValueAtEndActions: {[codeblock: string]: Set<string>},
    gameValueReturnTypes: {[dfName: string]: Type},
    actionSignatures: {[codeblock: string]: {[actionDFName: string]: ParameterSignature[]}},
    autocompleteSortPrefixes: {[codeblock: string]: {[actionDFName: string]: string}}
} = {
    actionNames: {
        "PLAYER EVENT": {
            "Leave": "leave",
            "Join": "join"
        },
        "ENTITY EVENT": {

        },
        "GAME EVENT": {
            "LagSlayRecover": "lagSlayRecover"
        },
        "PLAYER ACTION": {
            "DisableBlocks": "disableBlockModification",
            "EnableBlocks": "enableBlockModification",
            "SetNamePrefix": "setNameAffix",
            "PlayEntitySound": "playSoundFromEntity",
            "SendToPlot": "sendToPlot",
            "MobDisguise": "disguiseAsMob",
            "AdventureMode": "setToAdventureMode",
            "SpectatorMode": "setToSpectatorMode",
            "CreativeMode": "setToCreativeMode",
            "SurvivalMode": "setToSurvivalMode",
            "ActionBar": "sendActionBar",
            "SendTitle": "sendTitle",
            "SetTabListInfo": "setTabListInfo",
            "SetPlayerWeather": "setWeather",
            "SetPlayerTime": "setTime",
            "AttackAnimation": "sendAttackAnimation",
            "SetMaxHealth": "setMaxHealth",
        },
        "ENTITY ACTION": {
            "SetBaby": "setIsBaby",
            "TDisplaySeeThru": "setTextDisplaySeeThrough",
            "DispRotAxisAngle": "setDisplayRotationFromAxisAngle",
            "SetCustomTag": "setTag",
            "GetCustomTag": "getTag",
            "RemoveCustomTag": "removeTag",
            "GetAllEntityTags": "getAllTags",
            "SendAnimation": "sendAnimation",
            "AttackAnimation": "sendAttackAnimation",
            "RideEntity": "ride",
            "SetItem": "setItem",
            "SetWitherInvul": "setWitherInvulnerability",
            "SetInvulTicks": "setInvulnerabilityTicks"
        },
        "GAME ACTION": {
            "LaunchProj": "launchProjectile",
            "RedstoneStrength": "setRedstoneStrength"
        },
        "SET VARIABLE": {
            "PurgeVars": "purgeMatching",
            "=": "set",
            "Raycast": "raycast",
            "RandomValue": "setToRandom",
            "GetContainerItems": "getContainerItems",
            "JsonToValue": "fromJSON",
            "ValueToJson": "toJSON",
            "AbsoluteValue": "abs",
            "%": "remainder",
            "+": "add",
            "-": "subtract",
            "/": "divide",
            "Bitwise": "bitwise",
            "RandomNumber": "random",
            "Average": "average",
            "x": "multiply",
            "MinNumber": "min",
            "Sine": "sin",
            "NormalRandom": "normalRandom",
            "Logarithm": "log",
            "WrapNum": "wrap",
            "BounceNum": "bounce",
            "Root": "root",
            "MaxNumber": "max",
            "Tangent": "tan",
            "ArcTangent2": "atan2",
            "+=": "increment",
            " RoundNumber ": "round",
            "-=": "decrement",
            "Cosine": "cos",
            "ParseNumber": "parse",
            "Exponent": "exponent",
            "ClampNumber": "clamp",
            "Interpolate": "interpolate",
            "RepeatString": "repeat",
            "JoinString": "join",
            "SplitString": "split",
            "TrimString": "trim",
            "ReplaceString": "replace",
            "SetCase": "setCase",
            "RemoveString": "remove",
            "StringLength": "len",
            "GzipCompress": "gzipCompress",
            "GzipDecompress": "gzipDecompress",
            "Base64Encode": "base64Encode",
            "Base64Decode": "base64Decode",
            "SanitizeTags": "sanitizeMiniMessage",
            "StringToBytes": "toBytes",
            "BytesToString": "fromBytes",
            "GetRegexGroup": "getRegexGroup",
            "AllRegexGroups": "getAllRegexGroups",
            "NamedRegexGrps": "getNamedRegexGroups",
            "IndexOfSubstring": "find",
            "SegmentString": "segment",
            "ParseMiniMessage": "parseExpression",
            "TrimStyledText": "trim",
            "GetMiniMessageExpr": "getExpression",
            "ContentLength": "len",
            "JoinStyledText": "joinStyled",
            "ShiftAllAxes": "shiftAllAxes",
            "ShiftOnVector": "shiftOnVector",
            "ShiftRotation": "shiftRotation",
            "ShiftOnAxis": "shiftOnAxis",
            "GetCenterLoc": "getCenter",
            "AlignLoc": "align",
            "FaceLocation": "faceLocation",
            "SetAllCoords": "setAllCoordinates",
            "ShiftInDirection": "shiftInDirection",
            "Distance": "getDistance",
            "GetDirection": "getDirection",
            "GetCoord": "getCoordinate",
            "RandomLoc": "random",
            " SetDirection ": "setDirection",
            "SetCoord": "setCoordinate",
            "ShiftToward": "shiftToward",
            "ShiftAllDirections": "shiftAllDirections",
            "ClampLoc": "clamp",
            "ClearItemTag": "clearTags",
            "GetItemAttribute": "getAttribute",
            " GetItemName ": "getName",
            "GetItemRarity": "getRarity",
            "AddItemAttribute": "addAttribute",
            "SetItemDura": "setDurability",
            "SetBreakability": "setBreakability",
            " GetItemLore ": "getLore",
            "SetItemTag": "setTag",
            "GetItemAmount": "getStackSize",
            "GetItemDura": "getDurability",
            " SetItemName ": "setName",
            "SetLodestoneLoc": "setLodestoneLocation",
            "SetItemAmount": "setStackSize",
            "AddItemEnchant": "addEnchant",
            "GetItemType": "getMaterial",
            "GetLoreLine": "getLoreLine",
            "RemoveItemTag": "removeTag",
            "GetLodestoneLoc": "getLodestoneLocation",
            "GetMaxAmount": "getMaxStackSize",
            "SetMaxAmount": "setMaxStackSize",
            " SetItemEnchants ": "setEnchantments",
            "SetItemType": "setMaterial",
            "GetItemColor": "getColor",
            " GetItemEnchants ": "getEnchantments",
            "SetItemColor": "setColor",
            " SetItemFlags ": "setVisiblityFlags",
            "GetItemEffects": "getPotionEffects",
            " SetItemLore ": "setLore",
            "AddItemLore": "addLore",
            "SetItemEffects": "setPotionEffects",
            "GetItemTag": "getTag",
            "ClearEnchants": "clearEnchantments",
            "RemItemEnchant": "removeEnchantment",
            "GetAllItemTags": "getAllTags",
            "SetItemGlowing": "setGlowing",
            "SetItemMaxDura": "setMaxDurablity",
            "GetBlockDrops": "getBlockDrops",
            "RemoveItemAttrs": "removeAttributes",
            "ClearItemAttrs": "clearAttributes",
            "SetBreakSound": "setBreakSound",
            "SetTooltipStyle": "setTooltipStyle",
            "GetItemLeftover": "getUseLeftover",
            "SetModelDataNums": "setModelDataNumbers",
            "GetModelDataNums": "getModelDataNumbers",
            "SetItemRarity": "setRarity",
            "SetModelDataStrs": "setModelDataStrings",
            "GetModelDataStrs": "getModelDataStrings",
            "SetItemLeftover": "setUseLeftover",
            "SetItemModel": "setModel",
            "GetTooltipStyle": "getTooltipStyle",
            "GetBreakSound": "getBreakSound",
            "HiddenComponents": "setHiddenComponents",
            "GetItemModel": "getModel",
            "SetAllItemTags": "setAllTags",
            " SetHeadTexture ": "setHeadTexture",
            "AppendValue": "append",
            "PopListValue": "pop",
            "ListLength": "len",
            "ReverseList": "reverse",
            "DedupList": "removeDuplicates",
            "RemoveListIndex": "remove",
            "FlattenList": "flatten",
            "SetListValue": "set",
            "GetListValue": "get",
            "InsertListValue": "insert",
            "SortList": "sort",
            "CreateList": "create",
            "AppendList": "appendList",
            "TrimList": "trim",
            "GetValueIndex": "find",
            "RandomizeList": "randomize",
            "RemoveListValue": "removeValue",
            "DestructureList": "destructure",
            "SegmentList": "segment",
            "ClearDict": "clear",
            "SortDict": "sort",
            "CreateDict": "create",
            "SetDictValue": "set",
            "GetDictSize": "len",
            "GetDictValues": "getValues",
            "GetDictKeys": "getKeys",
            "AppendDict": "append",
            "RemoveDictEntry": "remove",
            "GetDictValue": "get",
            "SetParticleType": "setType",
            "GetParticleMat": "getMaterial",
            "SetParticleSprd": "setSpread",
            "GetParticleMotion": "getMotion",
            "SetParticleMotion": "setMotion",
            "GetParticleRoll": "getRoll",
            "GetParticleAmount": "getAmount",
            "SetParticleColor": "setColor",
            "SetParticleAmount": "setAmount",
            "GetParticleType": "getType",
            "SetParticleMat": "setMaterial",
            "SetParticleSize": "setSize",
            "GetParticleSprd": "getSpread",
            "GetParticleColor": "getColor",
            "SetParticleRoll": "setRoll",
            "GetParticleSize": "getSize",
            "SetParticleOpac": "setOpacity",
            "GetParticleOpac": "getOpacity",
            "SetParticleFade": "setFade",
            "GetParticleFade": "getFade",
            "SetParticleDur": "setDuration",
            "GetParticleDur": "getDuration",
            "SetParticlePower": "setPower",
            "GetParticlePower": "getPower",
            "ClampVector": "clamp",
            "MultiplyVector": "multiply",
            "VectorBetween": "between",
            "GetVectorComp": "getComponent",
            "RotateAroundVec": "rotateAroundVec",
            "CrossProduct": "cross",
            "DotProduct": "dot",
            "DirectionName": "getDirectionName",
            "SetVectorLength": "setLength",
            "AlignVector": "align",
            "RotateAroundAxis": "rotateAroundAxis",
            "SubtractVectors": "subtract",
            "Vector": "set",
            "ReflectVector": "reflect",
            "AddVectors": "add",
            "SetVectorComp": "setComponent",
            "GetVectorLength": "len",
            "RotationVector": "fromRotation",
            "RandomVector": "random",
            "SwapVectorComp": "swap",
            "GetPotionType": "getType",
            "SetPotionDur": "setDuration",
            "SetPotionType": "setType",
            "SetPotionAmp": "setAmplifier",
            "GetPotionAmp": "getAmplifier",
            "GetPotionDur": "getDuration",
            "GetSoundVolume": "getVolume",
            "GetCustomSound": "getCustomKey",
            "SetSoundType": "setType",
            "GetSoundType": "getType",
            "GetSoundVariant": "getVariant",
            "SetSoundVolume": "setVolume",
            "SetSoundPitch": "setPitch",
            "SetCustomSound": "setCustomKey",
            "SetSoundVariant": "setVariant",
            "GetSoundPitch": "getPitch",
        },
        "IF PLAYER": {},
        "IF ENTITY": {
            "HasCustomTag": "hasTag",
            "IsRidingEntity": "isRiding"
        },
        "IF GAME": {
            "HasPlayer": "hasPlayer",
            "IsChunkLoaded": "chunkIsLoaded",
            "EventChunkNew": "chunkIsNew",
            "HasEntitiesName": "hasEntitiesWithName",
            "HasEntitiesUUID": "hasEntitiesWithUUID",
        },
        "IF VARIABLE": {
            "=": "equals",
            "!=": "doesNotEqual",
            " InRange ": "isInRange",
            "VarExists": "exists",
            "VarIsType": "isType",
            "ValueIsEmpty": "isEmpty",
            ">": "greaterThan",
            ">=": "greaterThanOrEqualTo",
            "<": "lessThan",
            "<=": "lessThanOrEqualTo",
            "StringMatches": "matches",
            "Contains": "contains",
            "StartsWith": "startsWith",
            "EndsWith": "endsWith",
            "IsFiltered": "isFiltered",
            "LocIsNear": "isNear",
            "ItemEquals": "equals",
            "ItemIsBlock": "isBlock",
            "BlockIsSolid": "isSolid",
            "ItemHasTag": "hasTag",
            "ItemHasEnchant": "hasEnchantment",
            "ItemIsUnbreakable": "isUnbreakable",
            "IsTooltipVisible": "isTooltipVisible",
            "ListContains": "contains",
            "ListValueEq": "valueEquals",
            "ListSizeEquals": "sizeEquals",
            "DictHasKey": "hasKey",
            "DictHasKeys": "hasKeys",
            "DictValueEquals": "valueEquals"
        },
        "SELECT OBJECT": {
            "RandomPlayer": "randomPlayers",
            "LastEntity": "lastEntity",
            "EntityName": "entitiesByName",
            "PlayerName": "playersByName",
            "AllEntities": "allEntities",
            "Reset": "reset",
            "EventTarget": "eventTarget",
            "EntitiesCond": "entitiesByCondition",
            "AllPlayers": "allPlayers",
            "Invert": "inverse",
            "PlayersCond": "playersByCondition",
            "EntityUUID": "entitiesByUUID",
            "FilterRandom": "randomly",
            "FilterDistance": "byDistance",
            "FilterRay": "byRaycast",
            "FilterCondition": "byCondition",
            "FilterSort": "bySort"
        },
        "REPEAT": {
            "Adjacent": "adjacent",
            "Path": "path",
            "Grid": "grid",
            "Sphere": "sphere",
            " Range ": "range"
        }
    },
    tagNames: {
        "Message Style": "style",
        "Time Unit": "unit",
        "Reduced Debug Info Enabled": "reduceInfo",
        "Allow Hand Crafting": "allow",
        "Bar Slot": "slot",
        "Bar Style": "style",
        "Bar Color": "color",
        "Add to Current Velocity": "addToCurrentVel",
        "New Row Position": "pos",
        "Row to Remove": "pos",
        "Inventory Kept": "kept",
        "Attribute": "attr",
        "Clear Crafting and Cursor": "clearCraftingAndCursor",
        "Container State": "state",
        "Give Experience": "unit",
        "Set Experience": "unit",
        "Text Color": "color",
        "Sound Source": "source",
        "Keep Current Rotation": "keepRot",
        "Keep Velocity": "keepVel",
        "Equipment Slot": "slot",
        "Spawn Death Drops": "spawnDrops",
        "Sidebar": "visible",
        "Alignment Mode": "align",
        "Text Type": "type",
        "Name Color": "color",
        "Allow Flight": "allow",
        "Heal Player to Max Health": "healToMax",
        "Player List Field": "field",
        "Number Format": "format",
        "Spectator Collision": "collision",
        "Name Tag Visible": "visible",
        "PVP": "pvp",
        "On Fire": "fire",
        "Disguise Visible": "visible",
        "Overwrite Effect": "overwrite",
        "Effect Particles": "particles",
        "Launch Axis": "axis",
        "Animation Arm": "arm",
        "Remainder Mode": "mode",
        "Add Location Rotation": "addRot",
        "Active Equipment Slot": "slot",
        "Division Mode": "mode",
        "Coordinate": "coord",
        "Component": "comp",
        "Coordinates": "coords",
        "Rounding Mode": "rounding",
        "Angle Units": "unit",
        "Can Always Eat": "alwaysEdible",
        "Consuming Animation": "animation",
        "Sorting Type": "type",
        "Sorting Order": "order",
        "Trim Pattern": "pattern",
        "Trim Material": "material",
        "Sine Variant": "variant",
        "Tangent Variant": "variant",
        "Cosine Variant": "variant",
        "Input": "unit",
        "Face Direction": "direction",
        "Coordinate Type": "type",
        "Model Value Type": "type",
        "Regular Expressions": "regEx",
        "Capitalization Type": "case",
        "Components to Swap": "comps",
        "Light Type": "type",
        "Distance Type": "type",
        "Allowed Tags": "allowed",
        "Parse Legacy Color Codes": "parseLegacyColors",
        "Spread": "axis",
        "Text Value": "returnValue",
        "Color Channels": "colorSpace",
        "Round Mode": "mode",
        "Sort Order": "order",
        "Consumable Property": "prop",
        "Hiding Mode": "mode",
        "Growth Unit": "unit",
        "Items to remove": "mode",
        "Request Method": "method",
        "Weapon Property": "prop",
        "Length Type": "type",
        "Cape Layer": "cape",
        "Jacket Layer": "jacket",
        "Left Sleeve Layer": "leftSleeve",
        "Right Sleeve Layer": "rightSleeve",
        "Left Pants Layer": "leftPant",
        "Right Pants Layer": "rightPant",
        "Hat Layer": "hat",
        "Horse Color": "color",
        "Horse Markings": "markings",
        "Name Tag Visibility": "visibility",
        "Friction Type": "type",
        "See-through": "seeThrough",
        "Roll Type": "type",
        "Temperature Type": "type",
        "Wolf Type": "type",
        "Skin Type": "type",
        "Text Alignment": "align",
        "Text Value Merging": "merging",
        "Billboard Type": "type",
        "Has Death Drops": "spawnDrops",
        "Parrot Color": "color",
        "Axolotl Color": "color",
        "AI": "ai",
        "Set Gene": "gene",
        "Gene Type": "type",
        "Heal Mob to Max Health": "healToMax",
        "Salmon Type": "type",
        "LLama Color": "color",
        "Mooshroom Variant": "type",
        "On Its Back": "onBack",
        "Model Type": "type",
        "Armor Stand Part": "part",
        "Digging Type": "type",
        "Fox Type": "type",
        "Has Weather Cycle": "hasCycle",
        "Apply Item Motion": "applyMotion",
        "Clone Block Entities": "Clone Block Entities",
        "Hurt Hit Entities": "hurtHitEntities",
        "Reform On Impact": "reformOnImpact",
        "End of Lifespan": "despawnBehavior",
        "Tree Type": "type",
        "Campfire Slot": "slot",
        "Inventory Type": "type",
        "Game Mode": "gamemode",
        "Hand Slot": "hand",
        "Link Filter": "link",
        "Swear Filter": "swear",
        "Caps Filter": "caps",
        "Character Spacing Filter": "space",
        "Character Drag Filter": "drag",
        "Variable Type": "type",
        "Comparison Mode" : "mode",
        "Change Location Rotation": "changeLocRot",
        "Rotate Location": "rotateLoc",
        "Allow List Changes": "allowChanges",
        "Point Locations Inwards": "pointLocInwards",
        "Compare Mode": "mode",
        "Event Target": "target",
        "Movement Key": "key",
        "Redstone Power Mode": "mode",
        "Close Player Inventory": "closePlayerInv",
    },
    gameValueNames: {
        "X-Coordinate": "x",
        "Y-Coordinate": "y",
        "Z-Coordinate": "z",
        "Invulnerability Ticks": "invulTicks",
        "UUID": "uuid",
        "CPU Usage": "cpuUsage",
        "Current Health": "health",
        "Maximum Health": "maxHealth",
        "Absorption Health": "absorption",
        "Experience Level": "xpLevel",
        "Experience Progreess": "xpProgress",
        "Entity Width": "width",
        "Entity Height": "height",
        "Event Redstone Current Strength": "redstoneStrength",
        "Event New Redstone Current Strength": "newRedstoneStrength",
    },
    returnTypes: {
        "SET VARIABLE": {
            " GetSignText ": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.signLine == "All lines")
                    return Type.list(Type.txt);
                else
                    return Type.txt;
            },
            "GetBlockType": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.returnValue == "Item")
                    return Type.item;
                else
                    return Type.str;
            },
            "GetBlockByMCTag": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.returnValue == "Item")
                    return Type.list(Type.item);
                else
                    return Type.list(Type.str);
            },
            "GetItemByMCTag": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.returnValue == "Item")
                    return Type.list(Type.item);
                else
                    return Type.list(Type.str);
            },
            "CellularNoise": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.returnType == "Origin")
                    return Type.vec;
                else
                    return Type.num;
            },
            "GetConsumable": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                switch (tags.prop) {
                    case "Animation": return Type.str;
                    case "Nutrition": return Type.num;
                    case "Saturation": return Type.num;
                    case "Sound": return Type.snd;
                    case "Use Duration": return Type.num;
                    default: return Type.num
                }
            },
            "RandomizeList": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                return argTypes[0] ?? Type.list(Type.any);
            },
            // TODO: handle index types better here
            "FlattenList": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                let flatTypes: Type[] = [];

                if (argTypes.length == 0 || !argTypes[0].matches(Type.list)) 
                    return Type.list(Type.any);

                function recurse(type: Type) {
                    if (type.matches(Type.list)) {
                        let data = type.data as ListTypeData;
                        for (let t of data.indexTypes) recurse(t);
                        recurse(data.genericType);
                    } else if (!type.matches(Type.void)) {
                        flatTypes.push(type);
                    }
                }
                recurse(argTypes[0]);

                for (let i = 1; i < flatTypes.length; i++) {
                    if (!flatTypes[i-1].strictlyMatches(flatTypes[i])) {
                        return Type.list(Type.any);
                    }
                }

                return Type.list(flatTypes[0] ?? Type.void);
            },
            "GetSoundPitch": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [_, tags] = getTagsAndArgTypes(args, types, methodCallOf);
                if (tags.returnValue == "Note (text)") {
                    return Type.str;
                } else {
                    return Type.num;
                }
            },
            " GetBookText ": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                if (argTypes.length < 2)
                    return Type.list(Type.txt);
                else
                    return Type.txt;
            },
            // TODO: make these create actions better
            "CreateList": Type.list(Type.any),
            "CreateDict": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                if (argTypes.length >= 2 && argTypes[1].matches(Type.list)) {
                    return Type.dict(argTypes[1].getMemberType());
                }
                return Type.dict(Type.any);
            },
            "GetDictValues": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                if (argTypes.length >= 1 && argTypes[0].matches(Type.dict)) {
                    return Type.list(argTypes[0].getMemberType());
                }
                return Type.dict(Type.any);
            },
            "SortDict": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                return argTypes[0] ?? Type.dict(Type.any);
            },
            "DestructureList": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                if (argTypes.length >= 1 && argTypes[0].matches(Type.list)){ 
                    let listData = (argTypes[0].data as ListTypeData);
                    // if (methodCallOf instanceof Expression) console.log("GETTING TYPE WOAH", types.evaluateExpression(methodCallOf));
                    return Type.multivalue(listData.indexTypes, listData.genericType);
                }
                return Type.multivalue([], Type.void);
            },
            "RandomValue": (args: Expression[], types: TypeProcessor, methodCallOf?: Type) => {
                let [argTypes, _] = getTagsAndArgTypes(args, types, methodCallOf);
                if (argTypes.length == 0) return Type.void;
                return getWidestType(...argTypes);
            },
            "PopListValue": firstListGenericType,
            "GetListValue": firstListGenericType,

            "WebResponse": Type.dict(Type.void, {statusText: Type.str, body: Type.str, json: Type.any}),

            "String": Type.str,
            "TranslateColors": Type.str,
            "Base64Encode": Type.list(Type.num),
            "Base64Decode": Type.list(Type.num),
            "AllRegexMatches": Type.list(Type.str),
            "AllRegexGroups": Type.list(Type.str),
            "NamedRegexGrps": Type.dict(Type.str),
            "GzipCompress": Type.list(Type.num),
            "GzipDecompress": Type.list(Type.num),
            "SegmentString": Type.list(Type.str),
            "SplitString": Type.list(Type.str),
            "StringToBytes": Type.list(Type.num),

            "-=": Type.void,
            "+=": Type.void,

            "StyledText": Type.txt,

            "SetCoord": Type.loc,
            "SetAllCoords": Type.loc,
            "ShiftOnAxis": Type.loc,
            "ShiftAllAxes": Type.loc,
            "ShiftInDirection": Type.loc,
            "ShiftAllDirections": Type.loc,
            "ShiftToward": Type.loc,
            "ShiftOnVector": Type.loc,
            "ShiftRotation": Type.loc,

            "SetAllItemTags": Type.item,
            "AddItemToolRule": Type.item,
            "ClearItemAttrs": Type.item,
            "SetBreakability": Type.item,
            "SetBreakSound": Type.item,
            "SetBundleItems": Type.item,
            "SetConsumable": Type.item,
            "SetCrossbowProj": Type.item,
            "SetItemDura": Type.item,
            "SetItemGlowing": Type.item,
            "HiddenComponents": Type.item,
            "SetItemMaxDura": Type.item,
            "SetMaxAmount": Type.item,
            "SetItemModel": Type.item,
            "SetModelDataNums": Type.item,
            "SetModelDataStrs": Type.item,
            "SetItemRarity": Type.item,
            "SetItemTool": Type.item,
            "SetItemHideTooltip": Type.item,
            "SetItemLeftover": Type.item,
            "SetItemWeapon": Type.item,

            "SetItemType": Type.item,
            " SetItemName ": Type.item,
            " SetItemLore ": Type.item,
            "AddItemLore": Type.item,
            "SetItemAmount": Type.item,
            "SetItemDurability": Type.item,
            "SetItemBreakability": Type.item,
            " SetItemEnchants ": Type.item,
            "AddItemEnchant": Type.item,
            "RemItemEnchant": Type.item,
            "ClearEnchants": Type.item,
            "SetHeadTexture": Type.item,
            " SetHeadTexture ": Type.item,
            "SetBookText": Type.item,
            "SetItemTag": Type.item,
            "RemoveItemTag": Type.item,
            "ClearItemTag": Type.item,
            "SetModelData": Type.item,
            "SetItemEffects": Type.item,
            " SetItemFlags ": Type.item,
            "SetCanPlaceOn": Type.item,
            "SetCanDestroy": Type.item,
            "SetLodestoneLoc": Type.item,
            "SetArmorTrim": Type.item,
            "SetItemColor": Type.item,
            "AddItemAttribute": Type.item,
            "SetMapTexture": Type.item,
            " GetItemEnchants ": Type.dict(Type.num),
            " GetItemLore ": Type.list(Type.txt),
            "GetBundleItems": Type.list(Type.item),
            "GetCrossbowProj": Type.list(Type.item),
            "GetModelDataNums": Type.list(Type.num),
            "GetModelDataStrs": Type.list(Type.str),
            "GetCanPlaceOn": Type.list(Type.item),
            "GetItemEffects": Type.list(Type.pot),

            
            "GetAllItems": Type.list(Type.str),
            "GetBlockShape": Type.list(Type.list(Type.void, [Type.loc, Type.loc])),

            "GetDictKeys": Type.list(Type.str),

            "SetParticleType": Type.par,
            "SetParticleAmount": Type.par,
            "SetParticleSprd": Type.par,
            "SetParticleSize": Type.par,
            "SetParticleMat": Type.par,
            "SetParticleColor": Type.par,
            "SetParticleMotion": Type.par,
            "SetParticleRoll": Type.par,
            "SetParticleOpac": Type.par,
            "SetParticleDur": Type.par,
            "SetParticleFade": Type.par,
            "SetParticlePower": Type.par,

            "VectorBetween": Type.vec,
            "SetVectorComp": Type.vec,
            "SetVectorLength": Type.vec,

            "SetPotionType": Type.pot,
            "SetPotionAmp": Type.pot,
            "SetPotionDur": Type.pot,

            "SetSoundType": Type.snd,
            "SetSoundVariant": Type.snd,
            "SetCustomSound": Type.snd,
            "SetSoundPitch": Type.snd,
            "SetSoundVolume": Type.snd,

            "RGBColor": Type.str,
            "HSBColor": Type.str,
            "HSLColor": Type.str,
            "JsonToValue": Type.any,

            "GetContainerItems": Type.list(Type.item),
        },
    },
    returnValueAtEndActions: {
        "SET VARIABLE": new Set(["DestructureList"])
    },
    gameValueReturnTypes: {
        "Event Affected Blocks": Type.list(Type.loc),
        "Event Command Arguments": Type.list(Type.str),
        "Event Sign Text": Type.list(Type.str),
        "Event Transform Entities": Type.list(Type.str),
        "Plot Player Names": Type.list(Type.str),
        "Plot Player UUIDs": Type.list(Type.str),
        "Selection Target Names": Type.list(Type.str),
        "Selection Target UUIDs": Type.list(Type.str),

        "Full Inventory Items": Type.list(Type.item),
        "Upper Inventory Items": Type.list(Type.item),
        "Trade Ingredients": Type.list(Type.item),
        "Armor Items": Type.list(Type.item),
        "Attached Leads": Type.list(Type.str),
        "Hotbar Items": Type.list(Type.item),
        "Inventory Items": Type.list(Type.item),
        "Inventory Menu Items": Type.list(Type.item),
        "Passengers ": Type.list(Type.str), // why is there a space 😭
        "Potion Effects": Type.list(Type.pot),
        "Pressed Movement Keys": Type.list(Type.str),
    },
    actionSignatures: {
        "PLAYER ACTION": {
            "SendMessage": [
                {params: [ {name: "Message to send", type: Type.any, optional: true, plural: true} ]}
            ],
            "ActionBar": [
                {params: [ {name: "Message to send", type: Type.any, optional: true, plural: true} ]}
            ],
            "ReplaceItems": [
                {params: [
                    {name: "Items", type: Type.item, optional: false, plural: true, description: 
                        "The last item in this list will be used to replace any of the other items in this list.\n\n"
                        +"The below example will replace all Emeralds and all Diamonds with Paper\n"
                        +"```tc\nplayer.replaceItems(\n\titem('emerald'),\n\titem('diamond'),\n\titem('paper')\n);\n```"
                    },
                    {name: "Amount to replace", type: Type.num, optional: true, plural: false},
                ]}
            ]
        },
        "SET VARIABLE": {
            // num
            "+": [
                {params: [ {name: "Numbers to add", type: Type.num, optional: false, plural: true} ]},
                {params: [ {name: "Vectors to add", type: Type.vec, optional: false, plural: true} ]},
            ],
            "-": [
                {params: [ {name: "Numbers to subtract", type: Type.num, optional: false, plural: true} ]},
                {params: [ {name: "Vectors to subtract", type: Type.vec, optional: false, plural: true} ]},
            ],
            "x": [
                {params: [ {name: "Numbers to multiply by", type: Type.num, optional: false, plural: true} ]},
                {params: [ {name: "Vectors to multiply by", type: Type.vec, optional: false, plural: true} ]},
            ],
            "/": [
                {params: [ {name: "Numbers to divide by", type: Type.num, optional: false, plural: true} ]},
                {params: [ {name: "Vectors to divide by", type: Type.vec, optional: false, plural: true} ]},
            ],

            // list
            "AppendValue": [ {params: [ 
                {name: "List to append to", type: Type.var(Type.list(Type.any)), optional: false, plural: false} ,
                {name: "Value(s) to append", type: Type.any, optional: false, plural: true}
            ]}, ],
            "AppendList": [ {params: [ 
                {name: "List to append to", type: Type.var(Type.list(Type.any)), optional: false, plural: false} ,
                {name: "Lists(s) to append", type: Type.list(Type.any), optional: false, plural: true}
            ]}, ],
            "RemoveListIndex": [ {params: [ 
                {name: "List to change", type: Type.var(Type.list(Type.any)), optional: false, plural: false} ,
                {name: "Index to remove", type: Type.num, optional: false, plural: true}
            ]}, ],
            "RemoveListValue": [ {params: [ 
                {name: "List to change", type: Type.var(Type.list(Type.any)), optional: false, plural: false} ,
                {name: "Value(s) to remove", type: Type.any, optional: false, plural: true}
            ]}, ],
            "InsertListValue": [ {params: [ 
                {name: "List to change", type: Type.var(Type.list(Type.any)), optional: false, plural: false} ,
                {name: "Index", type: Type.num, optional: false, plural: false},
                {name: "Value to insert", type: Type.any, optional: false, plural: false}
            ]}, ],
            "DestructureList": [ {params: [ 
                {name: "List to destructure", type: Type.list(Type.any), optional: false, plural: false} ,
            ]}, ],

            // dict
            "AppendDict": [ {params: [ 
                {name: "Dictionary to add to", type: Type.var(Type.dict(Type.any)), optional: false, plural: false} ,
                {name: "Dictionary to append", type: Type.dict(Type.any), optional: false, plural: false} ,
            ]}, ],
            "ClearDict": [ {params: [ 
                {name: "Dictionary to clear", type: Type.var(Type.dict(Type.any)), optional: false, plural: false} ,
            ]}, ],
            "RemoveDictEntry": [ {params: [ 
                {name: "Dictionary to change", type: Type.var(Type.dict(Type.any)), optional: false, plural: false} ,
                {name: "Key to remove", type: Type.str, optional: false, plural: false} ,
                {name: "Expected value(s)", type: Type.any, optional: true, plural: true} ,
            ]}, ],
            "SetDictValue": [ {params: [ 
                {name: "Dictionary to change", type: Type.var(Type.dict(Type.any)), optional: false, plural: false} ,
                {name: "Key", type: Type.str, optional: false, plural: false} ,
                {name: "Value", type: Type.any, optional: false, plural: false} ,
            ]}, ],

            // par
            "SetParticleMat": [
                {params: [ 
                    {name: "Effect to change", type: Type.par, optional: false, plural: false},
                    {name: "Particle material", type: Type.item, optional: false, plural: false}
                ]},
                {params: [ 
                    {name: "Effect to change", type: Type.par, optional: false, plural: false},
                    {name: "Particle material id", type: Type.str, optional: false, plural: false}
                ]},
            ]
        },
        "GAME ACTION": {
            "FallingBlock": [
                {params: [ 
                    {name: "Block Location", type: Type.loc, optional: false, plural: false},
                    {name: "Block Material", type: Type.item, optional: false, plural: false},
                    {name: "Block Tag(s)", type: Type.str, optional: true, plural: true}
                ]},
                {params: [ 
                    {name: "Block Location", type: Type.loc, optional: false, plural: false, description: "Converts the block at the location to a falling block"},
                ]},
            ]
        }
    },
    autocompleteSortPrefixes: {
        "SET VARIABLE": {
            "+": "\uFFFA",
            "-": "\uFFFA",
            "x": "\uFFFA",
            "/": "\uFFFA",
            "%": "\uFFFA",
            "ArcTangent2": "\uFFF0",
            "Sine": "\uFFF0",
            "Cosine": "\uFFF0",
            "Tangent": "\uFFF0",
        },
        "IF VARIABLE": {
            ">": "\uFFFF",
            ">=": "\uFFFF",
            "<": "\uFFFF",
            "<=": "\uFFFF",
        }
    }
}