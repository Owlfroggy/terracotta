import * as fs from "node:fs/promises"
import { pathToFileURL } from "node:url";
import { DATA_PATH } from "../util/fileUtils.ts";
import { codeifyName, deColorizeString } from "../util/utils.ts";
import { Type } from "../typeProcessor/type.ts";
import { DFCodeblockName, DFRank, DFValueType, GameValueTargetType, RANK_ORDER } from "./constants.ts";
import { OVERRIDES } from "../data/overrides.ts";

const ACTION_DUMP_JSON      = JSON.parse((await fs.readFile( pathToFileURL(DATA_PATH+"actiondump.json") )).toString());

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
   

export class ParameterGroupValue {
    constructor(
        /**type string used by the df action dump */
        public type: DFValueType,
        public description: string = "",
        public optional: boolean = false,
        public plural: boolean = false,
        public notes: string[] = [],
    ) {}
}

export type ParameterGroup = ParameterGroupValue[];

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
        public hasSubActions: boolean = false,
    
        /** will be true or false for events, undefined for non-events */
        public cancellable: boolean | undefined,
        public cancelledAutomatically: boolean | undefined,
    
        public isLegacy: boolean,
        public requiresRank: DFRank = DFRank.UNRANKED,
        public worldPlotExclusive: boolean,
    ) {}
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

/**
 * returns true if ownedRank >= requiredRank
 */
export function rankCheck(ownedRank: DFRank, requiredRank: DFRank) {
    return RANK_ORDER[ownedRank] >= RANK_ORDER[requiredRank];
}

export function getTCActionName(block: DFCodeblockName, dfSignName: string) {
    let override = OVERRIDES.actionNames[block]?.[dfSignName];
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
    let override = OVERRIDES.tagNames[name];
    if (override) return override;
    return codeifyName(name.match(/(^\w+(?: \w+)?)/)?.[1] ?? name);
}

export function getTCGameValueName(dfValueName: string) {
    let override = OVERRIDES.gameValueNames[dfValueName];
    if (override) return override;
    return codeifyName(dfValueName);
}

export function getDifferentiatedActionName(block: DFCodeblockName, dfActionName: string): string {
    let action = actions.get(block)![dfActionName];
    if (!action) return dfActionName;
    return action.differentiatedName;
}

//==========[ private functions ]=========\\

function parseArgumentValueThingies(args: any[]): Parameter[] {
    let result: Parameter[] = [];

    let heldValues: ParameterGroupValue[] = [];
    let currentGroupList: ParameterGroup[] = [];

    //shut up about the name! it makes sense ok!!!!!!!
    let currentlyORing = false;

    let i = -1;
    for (const arg of args) {
        i++;
        if (arg.type) {
            heldValues.push(
                new ParameterGroupValue(
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
        actionJson.subActionBlocks != undefined,
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
        gameValueJson.icon.additionalInfo.map(entry => entry.map(line => deColorizeString(line)).join(" ")),
        gameValueJson.icon.worksWith,
        gameValueJson.icon.worldExclusive,
    );
}

// particle pass \\
for (const particleJson of ACTION_DUMP_JSON.particles) {
    let name = deColorizeString(particleJson.icon.name)
    let fields = [...particleJson.fields,"Amount","Spread"];

    // motion variation has literally 0 effect on particles that just
    // have Power and they aren't even required to be present for the
    // template to load, so its easier to just remove it in that case
    let motionVariationIndex = fields.indexOf("Motion Variation");
    if (motionVariationIndex != -1 && !fields.includes("Motion")) {
        fields.splice(motionVariationIndex, 1);
    }

    particles[name] = new Particle(
        name,
        fields
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