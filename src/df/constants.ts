import { Type } from "../typeProcessor/type.ts";

export enum DFRank {
    OVERLORD = "Overlord",
    MYTHIC = "Mythic",
    EMPEROR = "Emperor",
    NOBLE = "Noble",
    UNRANKED = ""
};

export enum DFValueType {
    NUMBER = "NUMBER",
    LOCATION = "LOCATION",
    VECTOR = "VECTOR",
    ITEM = "ITEM",
    LIST = "LIST",
    POTION = "POTION",
    PARTICLE = "PARTICLE",
    SOUND = "SOUND",
    COMPONENT = "COMPONENT",
    TEXT = "TEXT",
    DICT = "DICT",
    VARIABLE = "VARIABLE",
    ANY_TYPE = "ANY_TYPE",
    BLOCK_TAG = "BLOCK_TAG",
    BLOCK = "BLOCK",
    ENTITY_TYPE = "ENTITY_TYPE",
    PROJECTILE = "PROJECTILE",
    VEHICLE = "VEHICLE",
    SPAWN_EGG = "SPAWN_EGG",
    BYTE = "BYTE",
    NONE = "NONE",
}

export enum DFCodeblockName {
    PLAYER_EVENT = "PLAYER EVENT",
    ENTITY_EVENT = "ENTITY EVENT",
    GAME_EVENT = "GAME EVENT",
    PLAYER_ACTION = "PLAYER ACTION",
    ENTITY_ACTION = "ENTITY ACTION",
    GAME_ACTION = "GAME ACTION",
    SET_VARIABLE = "SET VARIABLE",
    IF_PLAYER = "IF PLAYER",
    IF_ENTITY = "IF ENTITY",
    IF_GAME = "IF GAME",
    IF_VARIABLE = "IF VARIABLE",
    ELSE = "ELSE",
    FUNCTION = "FUNCTION",
    PROCESS = "PROCESS",
    CALL_FUNCTION = "CALL FUNCTION",
    START_PROCESS = "START PROCESS",
    REPEAT = "REPEAT",
    CONTROL = "CONTROL",
    SELECT_OBJECT = "SELECT OBJECT",
    BRACKET = "BRACKET",
}

export enum TargetType {
    UNSET = "",
    SELECTION = "Selection",
    DEFAULT = "Default",
    KILLER = "Killer",
    DAMAGER = "Damager",
    VICTIM = "Victim",
    SHOOTER = "Shooter",
    PROJECTILE = "Projectile",
    ALL_PLAYERS = "AllPlayers",
    ALL_ENTITIES = "AllEntities",
    ALL_MOBS = "AllMobs",
    LAST_ENTITY = "LastEntity"
}

export enum RANK_ORDER {
    "",
    "Noble",
    "Emperor",
    "Mythic",
    "Overlord",
};


export function getCodeblockIdentifier(name: DFCodeblockName) {
    switch (name) {
        case DFCodeblockName.PLAYER_EVENT:  return "event";
        case DFCodeblockName.ENTITY_EVENT:  return "entity_event";
        case DFCodeblockName.GAME_EVENT:    return "game_event";
        case DFCodeblockName.PLAYER_ACTION: return "player_action";
        case DFCodeblockName.ENTITY_ACTION: return "entity_action";
        case DFCodeblockName.GAME_ACTION:   return "game_action";
        case DFCodeblockName.SET_VARIABLE:  return "set_var";
        case DFCodeblockName.IF_PLAYER:     return "if_player";
        case DFCodeblockName.IF_ENTITY:     return "if_entity";
        case DFCodeblockName.IF_GAME:       return "if_game";
        case DFCodeblockName.IF_VARIABLE:   return "if_var";
        case DFCodeblockName.ELSE:          return "else";
        case DFCodeblockName.FUNCTION:      return "func";
        case DFCodeblockName.PROCESS:       return "process";
        case DFCodeblockName.CALL_FUNCTION: return "call_func";
        case DFCodeblockName.START_PROCESS: return "start_process";
        case DFCodeblockName.REPEAT:        return "repeat";
        case DFCodeblockName.CONTROL:       return "control";
        case DFCodeblockName.SELECT_OBJECT: return "select_obj";
        case DFCodeblockName.BRACKET:       return "bracket";
        default: throw new Error(`No identifier for codeblock '${name}'`);
    }
}

export enum GameValueTargetType {
    UNTARGETED,
    TARGETS_PLAYERS,
    TARGETS_ENTITIES,
    TARGETS_ANYTHING,
}

//key: how a return type appears in the action dump
//value: terracotta type name

export const dfTypeToTC: Map<DFValueType, Type> = new Map([
    [DFValueType.NUMBER,        Type.num],
    [DFValueType.LOCATION,      Type.loc],
    [DFValueType.VECTOR,        Type.vec],
    [DFValueType.ITEM,          Type.item],
    [DFValueType.LIST,          Type.list(Type.any)],
    [DFValueType.POTION,        Type.pot],
    [DFValueType.PARTICLE,      Type.par],
    [DFValueType.SOUND,         Type.snd],
    [DFValueType.COMPONENT,     Type.txt],
    [DFValueType.TEXT,          Type.str],
    [DFValueType.DICT,          Type.dict(Type.any)],
    [DFValueType.VARIABLE,      Type.var],
    [DFValueType.ANY_TYPE,      Type.any],
    [DFValueType.BLOCK_TAG,     Type.str],
    [DFValueType.BLOCK,         Type.item],
    [DFValueType.ENTITY_TYPE,   Type.item],
    [DFValueType.PROJECTILE,    Type.item],
    [DFValueType.VEHICLE,       Type.item],
    [DFValueType.SPAWN_EGG,     Type.item],
    [DFValueType.BYTE,          Type.num]
]);

export const dfTypeToString: Map<DFValueType, string> = new Map([
    [DFValueType.NUMBER,        "Number"],
    [DFValueType.LOCATION,      "Location"],
    [DFValueType.VECTOR,        "Vector"],
    [DFValueType.ITEM,          "Item"],
    [DFValueType.LIST,          "List"],
    [DFValueType.POTION,        "Potion"],
    [DFValueType.PARTICLE,      "Particle"],
    [DFValueType.SOUND,         "Sound"],
    [DFValueType.COMPONENT,     "Styled Text"],
    [DFValueType.TEXT,          "String"],
    [DFValueType.DICT,          "Dictionary"],
    [DFValueType.VARIABLE,      "Variable"],
    [DFValueType.ANY_TYPE,      "Any Value"],
    [DFValueType.BLOCK_TAG,     "Block Tag"],
    [DFValueType.BLOCK,         "Block"],
    [DFValueType.ENTITY_TYPE,   "Entity Type"],
    [DFValueType.PROJECTILE,    "Projectile"],
    [DFValueType.VEHICLE,       "Vehicle"],
    [DFValueType.SPAWN_EGG,     "Spawn Egg"],
    [DFValueType.BYTE,          "Byte"],
    [DFValueType.NONE,          "None"]
]);

export const tcTypeToDF: {[tcTypeName: string]: DFValueType} = {
    "num": DFValueType.NUMBER,
    "loc": DFValueType.LOCATION,
    "vec": DFValueType.VECTOR,
    "item": DFValueType.ITEM,
    "list": DFValueType.LIST,
    "pot": DFValueType.POTION,
    "par": DFValueType.PARTICLE,
    "snd": DFValueType.SOUND,
    "txt": DFValueType.COMPONENT,
    "str": DFValueType.TEXT,
    "dict": DFValueType.DICT,
    "var": DFValueType.VARIABLE,
    "any": DFValueType.ANY_TYPE,
}

export const tcTypeToDFParamType: {[tcTypeName: string]: string} = {
    "num": "num",
    "loc": "loc",
    "vec": "vec",
    "item": "item",
    "list": "list",
    "pot": "pot",
    "par": "part",
    "snd": "snd",
    "txt": "comp",
    "str": "txt",
    "dict": "dict",
    "var": "var",
    "any": "any",
}