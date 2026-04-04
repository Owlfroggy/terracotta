import { DFCodeblockName, TargetType } from "../../df/actiondump.ts";
import { DFValueType } from "../../df/actiondump.ts";
import * as AD from "../../df/actiondump.ts";
import { ActionTagValue, CodeValue, EmptyValue, GameValueValue, StringValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { Type } from "../../typeProcessor/type.ts";
import { DefinitionType, FunctionDefinition, ValueDefinition } from "./definition.ts";
import { Namespace } from "./namespace.ts";
import { TYPE_DOMAIN_ACTIONS } from "../../data/constants.ts";

export function generateGameValueHook(valueName: string, dfName: string, target: TargetType): ValueDefinition {
    return {
        definitionType: DefinitionType.VALUE,
        returnType: AD.dfTypeToTC.get(AD.gameValues[dfName]?.type ?? DFValueType.ANY_TYPE)!,
        compile: (ctx) => {
            return [new GameValueValue(dfName, target), []];
        }
    }
}


export function generateActionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET): FunctionDefinition {
    let actionDef = AD.actions.get(codeblock)?.[actionDFName];

    // TODO: support multiple return values
    let dfReturnType = actionDef?.returnTypes[0]?.groups[0]?.[0]?.type;
    let tcReturnType = dfReturnType ? AD.dfTypeToTC.get(dfReturnType)! : null;

    return {
        definitionType: DefinitionType.FUNCTION,
        returnType: tcReturnType,
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
