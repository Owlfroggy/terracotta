import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import { DFValueType } from "../../df/actiondump.ts";
import * as AD from "../../df/actiondump.ts";
import { ActionTagValue, CodeValue, EmptyValue, GameValueValue, StringValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { Type } from "../../typeProcessor/type.ts";
import { ParameterSignatureEntry, ParameterSignature, DefinitionType, FunctionDefinition, ValueDefinition } from "./definition.ts";
import { Namespace } from "./namespace.ts";
import { TYPE_DOMAIN_ACTIONS } from "../../data/constants.ts";
import { sign } from "node:crypto";
import { appendFileSync } from "node:fs";
import { slog } from "../../languageServer/languageServer.ts";
import { inspect } from "node:util";
import { group } from "node:console";

export function generateGameValueHook(valueName: string, dfName: string, target: TargetType): ValueDefinition {
    let valueDef = AD.gameValues[dfName];
    return {
        definitionType: DefinitionType.VALUE,
        returnType: AD.dfTypeToTC.get(valueDef?.type ?? DFValueType.ANY_TYPE)!,
        gameValue: valueDef,
        compile: (ctx) => {
            return [new GameValueValue(dfName, target), []];
        }
    }
}


export function generateActionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET): FunctionDefinition {
    let actionDef = AD.actions.get(codeblock)?.[actionDFName]!;

    // TODO: support multiple return values
    let dfReturnType = actionDef?.returnTypes[0]?.groups[0]?.[0]?.type;
    let tcReturnType = dfReturnType ? AD.dfTypeToTC.get(dfReturnType)! : null;

    // create a unique signature for every possible combination of arguments
    let uniqueSignatures: ParameterSignatureEntry[][] = [[]]
    for (const parameter of actionDef.parameters) {
        let groupIndex = -1
        let initialSignatureAmount = uniqueSignatures.length

        let forceOptional = false;
        let noneDescriptionAddition = ""

        let groups = parameter.groups.map(group => {
            // this makes it editable without modifying the actiondump's contents
            group = [...group];
            // evil type=NONE parsing stuff
            if (group[group.length-1].type == DFValueType.NONE) {
                let noneVal = group.pop()!;
                let noneDesc = noneVal?.description != '' ? noneVal.description : "Df forgot to put this description in the actiondump 😭 just assume it does a default or smth idk blame jeremaster" ;
                if (noneDesc[noneDesc.length-1] == ")") noneDesc = noneDesc.substring(0,noneDesc.length-1);
                if (noneDesc[0] == "(") noneDesc = noneDesc.substring(1);
                forceOptional = true;
                noneDescriptionAddition = `\nIf left unspecified: ${noneDesc}`;
            }
            return group;
        }).filter(group => group.length > 0);

        for (const values of groups) {
            //if being assigned to a variable, exclude first var param from signature
            if (values[0].type == DFValueType.VARIABLE) {
                values.shift()
                if (values.length == 0) {
                    continue
                }
            }

            let tcValues: ParameterSignatureEntry[] = values.map(v => ({
                name: v.description,
                type: AD.dfTypeToTC.get(v.type) ?? Type.unknown,
                optional: forceOptional || v.optional,
                plural: v.plural,
                description: ((v.notes.length > 0 ? v.notes.join("\n") : '') + noneDescriptionAddition).trim()
            }));

            groupIndex++
            for (let i = 0; i < initialSignatureAmount; i++) {
                if (groupIndex == groups.length - 1) {
                    uniqueSignatures[i].push(...tcValues)
                } else {
                    uniqueSignatures.push([...uniqueSignatures[i], ...tcValues])
                }
            }
        }
    }
    uniqueSignatures = uniqueSignatures.filter(s => s.length > 0);

    return {
        definitionType: DefinitionType.FUNCTION,
        name: functionName,
        signatures: uniqueSignatures.map(v => ({params: v})),
        returnType: tcReturnType,
        action: actionDef,
        compile: (args, namedArgs, ctx): [CodeValue, CodeBlock[]] => {
            let tags: ActionTagValue[] = [];
            // todo: default tag values

            // tag parsing
            if (actionDef) {
                for (const [nameExpr, arg] of namedArgs.entries()) {
                    let tagDef = actionDef.tcTagMap[nameExpr.token.value];
                    if (!tagDef) {
                        ctx.reportError(
                            nameExpr,
                            `Invalid tag name '${nameExpr.token.value}'`
                        );
                        continue;
                    }

                    let valType = arg.getType(ctx);
                    if (!(valType == Type.str || valType == Type.any)) {
                        ctx.reportError(
                            arg.astNode ?? nameExpr,
                            `Expected string (str) for tag value, got '${valType.name}'`
                        );
                        continue;
                    }

                    if (arg instanceof StringValue) {
                        if (!(arg.value in tagDef.options)) {
                            ctx.reportError(
                                arg.astNode ?? nameExpr,
                                `'${arg.value}' is not a valid option for this tag`
                            );
                            continue;
                        }

                        tags.push(new ActionTagValue(tagDef, arg.value));
                    } else {
                        // todo: specifiable default vaulues)
                        tags.push(new ActionTagValue(tagDef, tagDef.defaultOption, arg as VariableValue))
                    }
                }
            }

            let code = new ActionBlock(codeblock,{
                action: actionDFName, 
                args: args.filter(v => v instanceof TangibleValue), 
                tags: tags, 
                target: target
            });

            let returnValue: CodeValue;
            if (tcReturnType) {
                returnValue = ctx.tvp.newTempVar(tcReturnType);
                code.args.unshift(returnValue as VariableValue);
            } else {
                returnValue = new EmptyValue()
            }

            return [returnValue, [code]];
        }
    }
}

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

export function registerBuiltinNamespaces() {
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

    // entity action namespaces
    for (const [identifier, target] of [
        ["selectedEntity",   TargetType.SELECTION],
        ["defaultEntity",    TargetType.DEFAULT],
        ["killerEntity",     TargetType.KILLER],
        ["damagerEntity",    TargetType.DAMAGER],
        ["shooterEntity",    TargetType.SHOOTER],
        ["victimEntity",     TargetType.VICTIM],
        ["projectileEntity", TargetType.PROJECTILE],
        ["allEntities",      TargetType.ALL_PLAYERS],
        ["allMobs",          TargetType.ALL_MOBS],
        ["lastEntity",       TargetType.LAST_ENTITY],
    ] as [string, TargetType][]) {
        new Namespace(identifier, Object.fromEntries([
            ...codeblockActionEntries(DFCodeblockName.ENTITY_ACTION, target),
            ...gameValueEntries(target, v => v.targetType == AD.GameValueTargetType.TARGETS_ANYTHING || v.targetType == AD.GameValueTargetType.TARGETS_ENTITIES)
        ]));
    }

    // game action namespace
    new Namespace("game", Object.fromEntries([
        ...codeblockActionEntries(DFCodeblockName.GAME_ACTION, TargetType.UNSET),
        ...gameValueEntries(TargetType.UNSET, v => v.targetType == AD.GameValueTargetType.UNTARGETED)
    ]));
}

//=-------------------=\\
//=- type namespaces -=\\
//=-------------------=\\

function typeActionMembers(typeName: string): {[key: string]: FunctionDefinition} {
    let members = {};
    for (const actionName of TYPE_DOMAIN_ACTIONS[typeName]) {
        let tcName = AD.getTCActionName(DFCodeblockName.SET_VARIABLE,actionName);
        members[tcName] = generateActionHook(tcName, DFCodeblockName.SET_VARIABLE, actionName);
    }
    return members;
}

export const TYPE_NAMESPACES: {[typeName: string]: Namespace} = {
    num: new Namespace('num', typeActionMembers('num'))
};
