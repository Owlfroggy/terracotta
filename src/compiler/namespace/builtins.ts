import { DFCodeblockName, dfTypeToTC, DFValueType, GameValueTargetType, TargetType } from "../../df/constants.ts";
import * as AD from "../../df/actiondump.ts";
import { ActionTagValue, CodeValue, EmptyValue, GameValueValue, NumberValue, StringValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock } from "../codeBlock.ts";
import { Type } from "../../typeProcessor/type.ts";
import { ParameterSignatureEntry, ParameterSignature, DefinitionType, FunctionDefinition, ValueDefinition, ConditionDefinition, USE_DEFAULT_RETURN_TYPE } from "./definition.ts";
import { Namespace } from "./namespace.ts";
import { TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS } from "../../data/constants.ts";
import { LOC_CONSTRUCTOR, VEC_CONSTRUCTOR } from "./constructors.ts";
import { expressionizeIfBlock, validateArguments } from "../../util/utils.ts";
import { OVERRIDES } from "../../data/overrides.ts";
import { slog } from "../../languageServer/languageServer.ts";

export function generateGameValueHook(valueName: string, dfName: string, target: TargetType): ValueDefinition {
    let valueDef = AD.gameValues[dfName];
    return {
        definitionType: DefinitionType.VALUE,
        returnType: dfTypeToTC.get(valueDef?.type ?? DFValueType.ANY_TYPE)!,
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
    let tcReturnType = dfReturnType ? dfTypeToTC.get(dfReturnType)! : null;

    let getReturnType = USE_DEFAULT_RETURN_TYPE;
    let returnTypeOverride = OVERRIDES.returnTypes[codeblock]?.[actionDFName]
    if (returnTypeOverride) {
        if (returnTypeOverride instanceof Type) {
            tcReturnType = returnTypeOverride
        } else {
            tcReturnType = tcReturnType ?? Type.any;
            getReturnType = returnTypeOverride;
        }
    }
    
    //=- signature generation -=\\
    let signatures: ParameterSignature[];
    // if this signature has been manually specified, use that
    if (OVERRIDES.actionSignatures[codeblock]?.[actionDFName]) {
        signatures = OVERRIDES.actionSignatures[codeblock][actionDFName];
    } 
    // otherwise generate one from the actiondump
    else {
        // create a unique signature for every possible combination of arguments
        let uniqueSignatures: ParameterSignatureEntry[][] = [[]]
        let varRemoved = false;
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
    
            let optionalModified = false;
            for (const values of groups) {
                //if being assigned to a variable, exclude first var param from signature
                if (
                    values[0].type == DFValueType.VARIABLE 
                    && (values[0].description == "Variable to set" || values[0].description.substring(0, 16) == "Gets the current")
                ) {
                    varRemoved = true;
                    values.shift();
                    if (values.length == 0) {
                        continue;
                    }
                }
                // if the next parameter was marked as optional expecting the now removed
                // variable to fill in for it, change it to be required
                let forceRequired = false;
                if (varRemoved && !optionalModified && values[0].optional && values[0].description.indexOf(" to ") != -1) {
                    optionalModified = true;
                    forceRequired = true;
                }
    
                let tcValues: ParameterSignatureEntry[] = values.map(v => ({
                    name: v.description,
                    type: dfTypeToTC.get(v.type) ?? Type.unknown,
                    optional: forceRequired ? false : forceOptional || v.optional,
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
        signatures = uniqueSignatures.map(v => ({params: v}));
    }

    return {
        definitionType: DefinitionType.FUNCTION,
        name: functionName,
        signatures,
        defaultReturnType: tcReturnType,
        action: actionDef,
        getReturnType,
        compile(this: FunctionDefinition, args, namedArgs, ctx, callNode): [CodeValue, CodeBlock[]] {
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

                    let valType = arg.getType(ctx.types);
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
                    } else if (arg instanceof VariableValue) {
                        // todo: specifiable default vaulues)
                        tags.push(new ActionTagValue(tagDef, tagDef.defaultOption, arg))
                    }
                }
            }

            // arg validation
            validateArguments(args, callNode, signatures, ctx, true);

            let code = new ActionBlock(codeblock,{
                action: actionDFName, 
                args: args.filter(v => v instanceof TangibleValue), 
                tags: tags, 
                target: target
            });

            let returnValue: CodeValue;

            if (tcReturnType) {
                returnValue = ctx.tvp.newTempVar(this.getReturnType(callNode.args.elements, ctx.types) ?? Type.any);
                code.args.unshift(returnValue as VariableValue);
            } else {
                returnValue = new EmptyValue()
            }

            return [returnValue, [code]];
        }
    }
}

export function generateTagSpecifiedActionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, tagOptions: {[tag: string]: string}, signatures: ParameterSignature[], target: TargetType = TargetType.UNSET): FunctionDefinition {
    let actionDef = AD.actions.get(codeblock)?.[actionDFName]!;

    let dfReturnType = actionDef?.returnTypes[0]?.groups[0]?.[0]?.type;
    let tcReturnType = dfReturnType ? dfTypeToTC.get(dfReturnType)! : null;

    return {
        definitionType: DefinitionType.FUNCTION,
        name: functionName,
        signatures,
        defaultReturnType: tcReturnType,
        getReturnType: USE_DEFAULT_RETURN_TYPE,
        compile: (args, namedArgs, ctx, callNode): [CodeValue, CodeBlock[]] => {
            let tags: ActionTagValue[] = [];
            // todo: default tag values

            for (const [name, option] of Object.entries(tagOptions)) {
                let tagDef = actionDef.tags[name];
                tags.push(new ActionTagValue(tagDef, option))
            }

            // arg validation
            validateArguments(args, callNode, signatures, ctx);

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

export function generateConditionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET): ConditionDefinition {
    let def = generateActionHook(functionName, codeblock, actionDFName, target) as ConditionDefinition;
    def.compileIf = def.compile;
    def.compile = (args, namedArgs, ctx, callNode) => {
        let [item, code] = def.compileIf(args, namedArgs, ctx, callNode);
        return expressionizeIfBlock(code, ctx);
    }
    return def
}

function codeblockActionEntries(block: DFCodeblockName, target: TargetType, generator: typeof generateActionHook | typeof generateConditionHook = generateActionHook): [string, FunctionDefinition][] {
    let actions = Object.values(AD.actions.get(block)!);
    return actions.filter(a => !a.isLegacy).map(
        a => {
            let tcName = AD.getTCActionName(block, a.name);
            return [tcName, generator(tcName, block, a.name, target)]
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
            ...codeblockActionEntries(DFCodeblockName.IF_PLAYER, target, generateConditionHook),
            ...gameValueEntries(target, v => v.targetType == GameValueTargetType.TARGETS_ANYTHING || v.targetType == GameValueTargetType.TARGETS_PLAYERS)
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
            ...codeblockActionEntries(DFCodeblockName.IF_ENTITY, target, generateConditionHook),
            ...gameValueEntries(target, v => v.targetType == GameValueTargetType.TARGETS_ANYTHING || v.targetType == GameValueTargetType.TARGETS_ENTITIES)
        ]));
    }

    // game action namespace
    new Namespace("game", Object.fromEntries([
        ...codeblockActionEntries(DFCodeblockName.GAME_ACTION, TargetType.UNSET),
        ...codeblockActionEntries(DFCodeblockName.IF_GAME, TargetType.UNSET, generateConditionHook),
        ...Object.entries(typeActionMembers('game')),
        ...gameValueEntries(TargetType.UNSET, v => v.targetType == GameValueTargetType.UNTARGETED)
    ]));
}

//=-------------------=\\
//=- type namespaces -=\\
//=-------------------=\\

// TODO: write descriptions for all these functions and get their documentation working
export const NUM_NAMESPACE_INJECTIONS: {[funcTcName: string]: FunctionDefinition} = {
    // rounding
    floor: generateTagSpecifiedActionHook(
        "floor", DFCodeblockName.SET_VARIABLE, " RoundNumber ",
        {"Round Mode": "Floor"},
        [{params: [
            {name: "Number to floor", type: Type.num, optional: false, plural: false},
            {name: "Round multiple", type: Type.num, optional: true, plural: false},
        ]}]
    ),
    ceil: generateTagSpecifiedActionHook(
        "ceil", DFCodeblockName.SET_VARIABLE, " RoundNumber ",
        {"Round Mode": "Ceiling"},
        [{params: [
            {name: "Number to ceiling", type: Type.num, optional: false, plural: false},
            {name: "Round multiple", type: Type.num, optional: true, plural: false},
        ]}]
    ),
    
    // degrees trig functions
    asin: generateTagSpecifiedActionHook(
        "asin", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Sine Variant": "Inverse sine (arcsine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    sinh: generateTagSpecifiedActionHook(
        "sinh", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Sine Variant": "Hyperbolic sine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),    
    acos: generateTagSpecifiedActionHook(
        "acos", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Cosine Variant": "Inverse cosine (arccosine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    cosh: generateTagSpecifiedActionHook(
        "cosh", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Cosine Variant": "Hyperbolic cosine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),    
    atan: generateTagSpecifiedActionHook(
        "atan", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Tangent Variant": "Inverse tangent (arctangent)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    tanh: generateTagSpecifiedActionHook(
        "tanh", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Tangent Variant": "Hyperbolic tangent"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    
    // radians trig functions
    sinr: generateTagSpecifiedActionHook(
        "sinr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    asinr: generateTagSpecifiedActionHook(
        "asinr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians", "Sine Variant": "Inverse sine (arcsine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    sinhr: generateTagSpecifiedActionHook(
        "sinhr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians", "Sine Variant": "Hyperbolic sine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),    
    cosr: generateTagSpecifiedActionHook(
        "cosr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    acosr: generateTagSpecifiedActionHook(
        "acosr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians", "Cosine Variant": "Inverse cosine (arccosine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    coshr: generateTagSpecifiedActionHook(
        "coshr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians", "Cosine Variant": "Hyperbolic cosine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),    
    tanr: generateTagSpecifiedActionHook(
        "tanr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    atanr: generateTagSpecifiedActionHook(
        "atanr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians", "Tangent Variant": "Inverse tangent (arctangent)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    tanhr: generateTagSpecifiedActionHook(
        "tanhr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians", "Tangent Variant": "Hyperbolic tangent"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}]
    ),
    atan2r: generateTagSpecifiedActionHook(
        "atan2r", DFCodeblockName.SET_VARIABLE, "ArcTangent2",
        {"Output Type": "Radians"},
        [{params: [ 
            {name: "Y", type: Type.num, optional: false, plural: false}, 
            {name: "X", type: Type.num, optional: false, plural: false}, 
        ]}]
    ),
}

function typeActionMembers(typeName: string): {[key: string]: FunctionDefinition} {
    let members = {};
    for (const actionName of TYPE_DOMAIN_ACTIONS[typeName]) {
        let tcName = AD.getTCActionName(DFCodeblockName.SET_VARIABLE,actionName);
        members[tcName] = generateActionHook(tcName, DFCodeblockName.SET_VARIABLE, actionName);
    }
    for (const actionName of TYPE_DOMAIN_CONDITIONS[typeName]) {
        let tcName = AD.getTCActionName(DFCodeblockName.IF_VARIABLE,actionName);
        members[tcName] = generateConditionHook(tcName, DFCodeblockName.IF_VARIABLE, actionName);
    }
    return members;
}

export const TYPE_NAMESPACES: {[typeName: string]: Namespace} = {
    var: new Namespace('var', typeActionMembers('var')),
    num: new Namespace('num', {...typeActionMembers('num'), ...NUM_NAMESPACE_INJECTIONS}),
    vec: new Namespace('vec', typeActionMembers('vec'), VEC_CONSTRUCTOR),
    loc: new Namespace('loc', typeActionMembers('loc'), LOC_CONSTRUCTOR),
    list: new Namespace('list', typeActionMembers('list')),
};

export const REPEAT_ACTIONS: {[tcName: string]: {def: FunctionDefinition, returnType: Type}} = {
    range:      {def: generateActionHook('range', DFCodeblockName.REPEAT, " Range "),   returnType: Type.num},
    grid:       {def: generateActionHook('grid', DFCodeblockName.REPEAT, "Grid"),       returnType: Type.loc},
    adjacent:   {def: generateActionHook('grid', DFCodeblockName.REPEAT, "Adjacent"),   returnType: Type.loc},
    path:       {def: generateActionHook('path', DFCodeblockName.REPEAT, "Path"),       returnType: Type.loc},
    sphere:     {def: generateActionHook('sphere', DFCodeblockName.REPEAT, "Sphere"),   returnType: Type.loc},
}