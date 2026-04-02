import * as fs from "node:fs/promises"
import { pathToFileURL } from "node:url";
import { DATA_PATH } from "../util/fileUtils.ts";
import { codeifyName, deColorizeString } from "../util/utils.ts";
import { Type } from "../typeProcessor/type.ts";

const ACTION_DUMP_JSON      = JSON.parse((await fs.readFile( pathToFileURL(DATA_PATH+"actiondump.json") )).toString());
const OVERRIDES_JSON        = JSON.parse((await fs.readFile( pathToFileURL(DATA_PATH+"overrides.json") )).toString());

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

enum RANK_ORDER {
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
        default: throw new Error(`No identifier for codeblock '${name}'`);
    }
}

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
    constructor(
        /**type string used by the df action dump */
        public type: DFValueType,
        public description: string = "",
        public optional: boolean = false,
        public plural: boolean = false,
        public notes: string[] = [],
    ) {}
}

export type ParameterGroup = ParameterValue[];

export class Parameter {
    constructor(
        /** different entries in array are different possibilities (they are seperated by OR in df codeblock description)
         * arrays one level down from that all the parameters grouped into that possiblity */
        public groups: ParameterGroup[] = [],
    ) {}
}

// TODO: particle fields overhaul
export class Particle {
    constructor(
        public name: string,
        public fields: string[],
    ) {}
}

export class Sound {
    constructor(
        public name: string,
        public variants: string[]
    ) {}
}

export class Potion {
    constructor(
        public name: string,
        public description: string,
    ) {}
}

export class Tag {
    constructor(
        public name: string,
        public options: {[optionName: string]: {description: string}},
        public defaultOption: string,
        /** chest slot this tag should be placed in */
        public chestSlot: number,
        public codeblock: DFCodeblockName,
        public action: string,
    ) {}
}

export class Action {
    constructor(
        public codeblock: DFCodeblockName,
        /** the name shown on signs of code blocks */
        public name: string,
        /** the name shown in the sign guis for selection actions */
        public iconName: string,
        /** the sign name used by blocks like while and select obj */
        public differentiatedName: string,
        /** Keys in this are the tag names which appear at the top of their chest item */
        public tags: {[tagName: string]: Tag},
        // this really shouldn't be in the actiondump but i don't care
        /** Keys in this are the tag names used inside terracotta */
        public tcTagMap: {[tcTagName: string]: Tag},
        /** description lore that shows up when you hover over the action in df
         * DOES NOT INCLUDE PARAMETER INFORMATION!! */
        public description: string,
        public additionalInfo: string[],
        public worksWith: string[],
    
        public parameters: Parameter[],
        public returnTypes: Parameter[],
    
        /** will be true or false for events, undefined for non-events */
        public cancellable: boolean | undefined,
        public cancelledAutomatically: boolean | undefined,
    
        public isLegacy: boolean,
        public requiresRank: DFRank = DFRank.UNRANKED,
        public worldPlotExclusive: boolean,
    ) {}
}

export enum GameValueTargetType {
    UNTARGETED,
    TARGETS_PLAYERS,
    TARGETS_ENTITIES,
    TARGETS_ANYTHING,
}

export class GameValue {
    constructor(
        public name: string,
        public type: DFValueType,
        public targetType: GameValueTargetType,
        public description: string,
        public returnDescription: string,
        public additionalInfo: string[],
        public worksWith: string[],
        public worldPlotExclusive: boolean,
    ) {}
}

//==========[ public data ]=========\\


export const actions: Map<DFCodeblockName, {[actionName: string]: Action}> = new Map();

export const gameValues: {[gameValueName: string]: GameValue} = {};

export const particles: {[particleName: string]: Particle} = {};

export const potions: {[potionName: string]: Potion} = {};

export const sounds: {[soundName: string]: Sound} = {}

//key: codeblock name (e.g. "PLAYER ACTION")
//value: codeblock identifier (e.g. "player_action")
const nameToIdentifierMap: Map<DFCodeblockName, string> = new Map();

//key: how a return type appears in the action dump
//value: terracotta type name

export const dfTypeToTC: Map<DFValueType, Type> = new Map([
    [DFValueType.NUMBER,        Type.num],
    [DFValueType.LOCATION,      Type.loc],
    [DFValueType.VECTOR,        Type.vec],
    [DFValueType.ITEM,          Type.item],
    [DFValueType.LIST,          Type.list],
    [DFValueType.POTION,        Type.pot],
    [DFValueType.PARTICLE,      Type.par],
    [DFValueType.SOUND,         Type.snd],
    [DFValueType.COMPONENT,     Type.txt],
    [DFValueType.TEXT,          Type.str],
    [DFValueType.DICT,          Type.dict],
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


/**
 * returns true if ownedRank >= requiredRank
 */
export function rankCheck(ownedRank: DFRank, requiredRank: DFRank) {
    return RANK_ORDER[ownedRank] >= RANK_ORDER[requiredRank];
}

export function getTCActionName(block: DFCodeblockName, dfSignName: string) {
    let override = OVERRIDES_JSON.actionNames[block]?.[dfSignName];
    if (override) return override;

    let iconName = actions.get(block)?.[dfSignName]?.iconName!;

    if (iconName != undefined && block == DFCodeblockName.PLAYER_EVENT || block == DFCodeblockName.ENTITY_EVENT || block == DFCodeblockName.GAME_EVENT) {
        if (iconName.startsWith("Entity") && block == DFCodeblockName.ENTITY_EVENT) 
            iconName = iconName.substring(6);
        else if (iconName.startsWith("Player") && block == DFCodeblockName.PLAYER_EVENT) 
            iconName = iconName.substring(6);
        else if (iconName.startsWith("Plot")) 
            iconName = iconName.substring(4);

        if (iconName.endsWith("Event"))
            iconName = iconName.substring(0,iconName.length-5);
    }
    return codeifyName(iconName ?? dfSignName);
}

export function getTCTagName(name: string) {
    let override = OVERRIDES_JSON.tagNames[name];
    if (override) return override;
    return codeifyName(name.match(/(^\w+(?: \w+)?)/)?.[1] ?? name);
}

export function getTCGameValueName(dfValueName: string) {
    let override = OVERRIDES_JSON.gameValueNames[dfValueName];
    if (override) return override;
    return codeifyName(dfValueName);
}

//==========[ private functions ]=========\\

function parseArgumentValueThingies(args: any[]): Parameter[] {
    let result: Parameter[] = [];

    let heldValues: ParameterValue[] = [];
    let currentGroupList: ParameterGroup[] = [];

    //shut up about the name! it makes sense ok!!!!!!!
    let currentlyORing = false;

    let i = -1;
    for (const arg of args) {
        i++;
        if (arg.type) {
            heldValues.push(
                new ParameterValue(
                    arg.type,
                    arg.description ? arg.description.map(line => deColorizeString(line)).join(" ") : "",
                    arg.optional,
                    arg.plural,
                    arg.notes ? arg.notes.map(note => note.map(line => deColorizeString(line)).join(" ")) : "",
                )
            );
        }
        //we are in a parameter with OR, push all held values as a group
        else if (arg.text == "OR") {
            currentGroupList.push(heldValues);
            heldValues = [];
            currentlyORing = true;
        }
        //if hitting "" line or EOF
        if ( (arg.text === "") || (i+1 >= args.length) ) {
            //if this is the end of an OR parameter, push held values as group and then push parameter containing held groups
            if (currentlyORing) {
                currentGroupList.push(heldValues);

                let parameter = new Parameter();
                parameter.groups = currentGroupList;
                currentGroupList = [];

                result.push(parameter);

                currentlyORing = false;
            }
            //otherwise, push all held values as their own parameters
            else {
                heldValues.forEach(entry => {
                    let parameter = new Parameter();
                    parameter.groups = [[entry]];
                    result.push(parameter);
                });
            }
            heldValues = [];
        }
    }

    return result;
}

//==========[ populate data tables ]=========\\

// codeblock pass \\
for (const codeblockData of ACTION_DUMP_JSON.codeblocks) {
    let name: DFCodeblockName = codeblockData.name;
    nameToIdentifierMap.set(name,codeblockData.identifier);
    actions.set(name, {})
}

// action pass \\
for (const actionJson of ACTION_DUMP_JSON.actions) {
    let codeblockName: DFCodeblockName = actionJson.codeblockName;

    let actionName = actionJson.name;
    let iconName = actionJson.icon.name;

    //tags
    let tags: {[tagName: string]: Tag} = {};
    let tcTags: {[tcTagName: string]: Tag} = {};
    for (const tagJson of actionJson.tags) {
        let tag = new Tag(
            tagJson.name,
            Object.fromEntries(tagJson.options.map(optionData => ([optionData.name, {name: optionData.name, description: optionData.icon.description?.join("\n")}]))),
            tagJson.defaultOption,
            tagJson.slot,
            codeblockName,
            actionName,
        );
        tags[tag.name] = tag;
        tcTags[getTCTagName(tag.name)] = tag;
    }

    
    //parameters and return value
    let parameters: Parameter[] = [];
    if (actionJson.icon?.arguments) { parameters = parseArgumentValueThingies(actionJson.icon.arguments); }

    let returnTypes: Parameter[] = [];
    if (actionJson.icon?.returnValues) { returnTypes = parseArgumentValueThingies(actionJson.icon?.returnValues); }
    
    let descriptionString = deColorizeString(actionJson.icon.description.join(" "));

    let additionalInfo = actionJson.icon.additionalInfo ? actionJson.icon.additionalInfo.map(entry => {
        return entry.join(" ");
    }) : []

    //check all aliases for differentiated action name
    let differentiatedActionName = actionName;
    for (const alias of actionJson.aliases) {
        //if this alias starts with the if block's corresponding letter assume its a differentiation
        if (
            alias[0] == "G" && codeblockName == DFCodeblockName.IF_GAME ||
            alias[0] == "P" && codeblockName == DFCodeblockName.IF_PLAYER ||
            alias[0] == "E" && codeblockName == DFCodeblockName.IF_ENTITY
        ) {
            differentiatedActionName = alias;
            break;
        }
    }

    //normal action
    actions.get(codeblockName)![actionName] = new Action(
        codeblockName, 
        actionName,
        iconName,
        differentiatedActionName,
        tags,
        tcTags,
        descriptionString,
        additionalInfo,
        actionJson.icon.worksWith,
        parameters,
        returnTypes,
        actionJson.icon.cancellable,
        actionJson.icon.cancelledAutomatically,
        actionJson.icon.name === "" && actionJson.icon.material === "STONE",
        (actionJson.icon.requireTokens ? "" : actionJson.icon.requiredRank) as DFRank,
        actionJson.icon.worldExclusive
    );
}

// game value pass \\
for (const gameValueJson of ACTION_DUMP_JSON.gameValues) {
    let name = deColorizeString(gameValueJson.icon.name);

    let targetType: GameValueTargetType;
    if (gameValueJson.category == "Plot Values" || gameValueJson.category == "Event Values") {
        targetType = GameValueTargetType.UNTARGETED;
    } else {
        targetType = GameValueTargetType.TARGETS_ANYTHING;
        // TODO: make the target type more specific 
    }

    gameValues[name] = new GameValue(
        name,
        gameValueJson.icon.returnType as DFValueType,
        targetType,
        gameValueJson.icon.description.map(line => deColorizeString(line)).join(" "),
        gameValueJson.icon.returnDescription.map(line => deColorizeString(line)).join(" "),
        gameValueJson.icon.additionalInfo.map(entry => { entry.map(line => deColorizeString(line)).join(" "); }),
        gameValueJson.icon.worksWith,
        gameValueJson.icon.worldExclusive,
    );
}

// particle pass \\
for (const particleJson of ACTION_DUMP_JSON.particles) {
    let name = deColorizeString(particleJson.icon.name)
    particles[name] = new Particle(
        name,
        [...particleJson.fields,"Amount","Spread"]
    );
}

// sound pass \\
for (const soundJson of ACTION_DUMP_JSON.sounds) {
    let name = deColorizeString(soundJson.icon.name);
    sounds[name] = new Sound(
        name,
        soundJson.variants ? soundJson.variants.map(v => v.id) : [],
    );
}

// potion pass \\
for (const potJson of ACTION_DUMP_JSON.potions) {
    let name = deColorizeString(potJson.icon.name);
    potions[name] = new Potion(
        name,
        potJson.icon.description.map(line => deColorizeString(line)).join(" "),
    );
}