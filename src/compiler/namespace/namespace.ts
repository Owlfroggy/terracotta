// this line has to be here to make sure that file runs
import { FunctionDefinition, generateActionHook } from "./functionDefinition.ts";
import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import * as AD from "../../df/actiondump.ts";
import { Target } from "node:inspector/promises";
import { generateGameValueHook, ValueDefinition } from "./valueDefinition.ts";

export enum DefinitionType {
    FUNCTION,
    VALUE,
}

export type Definition = FunctionDefinition | ValueDefinition;

export class Namespace {
    static registry: {[identifier: string]: Namespace} = {};

    constructor(
        public identifier: string,
        public members: {[identifier: string]: Definition} = {},
    ) {
        if (identifier in Namespace.registry) {
            throw new Error(`Attempted to register duplicate namespace '${identifier}'`);
        }
        Namespace.registry[identifier] = this;
    }
}

//=----------------------=\\
//=- builtin namespaces -=\\
//=----------------------=\\

function codeblockActionEntries(block: DFCodeblockName, target: TargetType = TargetType.UNSET): [string, FunctionDefinition][] {
    let actions = Object.values(AD.actions.get(block)!);
    return actions.filter(a => !a.isLegacy).map(
        a => {
            let tcName = AD.getTCActionName(block, a.name);
            return [tcName, generateActionHook(tcName, block, a.name, target)]
        }
    )
}

function gameValueEntries(target: TargetType, filter: (v: AD.GameValue) => boolean) {
    return (
        Object.values(AD.gameValues)
            .filter(filter)
            .map(v => {
                let tcName = AD.getTCGameValueName(v.name);
                return [tcName, generateGameValueHook(
                    tcName,
                    v.name,
                    target
                )]
            })
    );
}

// player action namespaces
for (const [identifier, target] of [
    ["selected",   TargetType.SELECTION],
    ["default",    TargetType.DEFAULT],
    ["killer",     TargetType.KILLER],
    ["damager",    TargetType.DAMAGER],
    ["shooter",    TargetType.SHOOTER],
    ["victim",     TargetType.VICTIM],
    ["allPlayers", TargetType.ALL_PLAYERS],
] as [string, TargetType][]) {
    new Namespace(identifier, Object.fromEntries([
        ...codeblockActionEntries(DFCodeblockName.PLAYER_ACTION, target),
        ...gameValueEntries(target, v => v.targetType == AD.GameValueTargetType.TARGETS_ANYTHING || v.targetType == AD.GameValueTargetType.TARGETS_PLAYERS)
    ]));
}