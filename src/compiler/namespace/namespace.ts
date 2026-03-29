// this line has to be here to make sure that file runs
import { FunctionDefinition, generateActionHook } from "./functionDefinition.ts";
import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import * as AD from "../../df/actiondump.ts";
import { Target } from "node:inspector/promises";

export class Namespace {
    static registry: {[identifier: string]: Namespace} = {};

    constructor(
        public identifier: string,
        public functions: {[identifier: string]: FunctionDefinition} = {},
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

function newCodeblockNamespace(identifier: string, block: DFCodeblockName, target: TargetType = TargetType.UNSET) {
    let actionDFNames = AD.actions.get(block)!;
    new Namespace(identifier,Object.fromEntries(
        Object.values(actionDFNames).filter(a => !a.isLegacy).map(
            a => {
                let tcName = AD.getTCActionName(block, a.name);
                return [tcName, generateActionHook(tcName, block, a.name, target)]
            }
        )
    ));
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
    newCodeblockNamespace(identifier, DFCodeblockName.PLAYER_ACTION, target)
}