import { DFCodeblockName, dfTypeToTC, DFValueType, GameValueTargetType, TargetType } from "../../df/constants.ts";
import * as AD from "../../df/actiondump.ts";
import { ActionTagValue, CodeValue, EmptyValue, GameValueValue, MissingValue, MultiValue, NamespaceValue, NumberValue, StringValue, TangibleValue, VariableValue } from "../codeValue.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock } from "../codeBlock.ts";
import { MultiValueTypeData, Type, TYPE_NAMESPACES } from "../../typeProcessor/type.ts";
import { ParameterSignatureEntry, ParameterSignature, DefinitionType, FunctionDefinition, ValueDefinition, ConditionDefinition, USE_DEFAULT_RETURN_TYPE, FunctionCallExtraInfo } from "./definition.ts";
import { Namespace } from "./namespace.ts";
import { CREATE_SELECTION_ACTION_LIST, FILTER_SELECTION_ACTION_LIST, FORCED_EVENT_ACTIONS, TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS } from "../../data/constants.ts";
import { ITEM_CONSTRUCTOR, LOC_CONSTRUCTOR, PAR_CONSTRUCTOR, POT_CONSTRUCTOR, SND_CONSTRUCTOR, VEC_CONSTRUCTOR } from "./constructors.ts";
import { expressionizeIfBlock, toNameCase, upperFirst } from "../../util/utils.ts";
import { OVERRIDES } from "../../data/overrides.ts";
import { validateArguments } from "../../util/argValidation.ts";
import { AtomicExpression, BinaryExpression, CallExpression, CallOrStartExpression, Expression } from "../../ast/expression.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { methodizeParameterSignatures } from "./utils.ts";
import { getImprovedErrorNode } from "../../error/errorUtils.ts";
import { TokenType } from "../../ast/token.ts";

function isGVEventValue(gameValue?: AD.GameValue) {
    if (!gameValue) return false;
    return gameValue.category == "Event Values";
}
function isActionEventAction(action?: AD.Action) {
    if (!action) return false;
    return action.iconName.includes("Event") || FORCED_EVENT_ACTIONS.includes(action.name);
}

export function handleSingleBlockReturnVars(def: FunctionDefinition, ctx: EvaluationContext, extraInfo: FunctionCallExtraInfo, callNode: CallExpression | CallOrStartExpression, argListToModify: CodeValue[]): [CodeValue] {
    let returnValue: CodeValue;
    let returnType = def.getReturnType(callNode.args.elements, ctx.types, extraInfo.methodCallOf?.getType(ctx.types) );  
    let returnVars: VariableValue[] = [];
    if (returnType.matches(Type.void)) {
        returnValue = new EmptyValue(callNode);
    } else {
        if (returnType.matches(Type.multivalue)) {
            let returnTypeData = returnType.data as MultiValueTypeData
            let multiValue = new MultiValue([], returnTypeData.overflowType);//, callNode);
            for (let i = 0; i < returnTypeData.types.length; i++) {
                let tempVar = ctx.tvp.newTempVar(returnTypeData.types[i])
                multiValue.values.push(tempVar);
                returnVars.push(tempVar);
            }
            returnValue = multiValue;
        } else {
            let tempVar = ctx.tvp.newTempVar(returnType)
            returnValue = tempVar;
            returnVars.push(tempVar);
        }

        if (def.returnVarsAtEnd) {
            argListToModify.push(...returnVars)
        } else {
            argListToModify.unshift(...returnVars);
        }
    } 
    return [returnValue]
}

export function compileTags(actionDef: AD.Action, namedArgs: Map<AtomicExpression, [CodeValue, Expression]>, ctx: EvaluationContext): [ActionTagValue[], CodeBlock[]] {
    let tags: ActionTagValue[] = [];
    let code: CodeBlock[] = [];
    // tag parsing
    for (let [nameExpr, [_, expr]] of namedArgs.entries()) {
        let tagDef = actionDef.tcTagMap[nameExpr.token.value];
        let exprContext = {perSelectedMode: ctx.perSelectedMode};
        if (!tagDef) {
            ctx.reportError(
                nameExpr,
                `Invalid tag name '${nameExpr.token.value}'`
            );
            // compile expr anyway so errors are reported
            ctx.compiler.compileExpression(expr, exprContext);
            continue;
        }

        let defaultOption = tagDef.defaultOption;
        let defaultOptionExpr: Expression | undefined;
        let argExpr: Expression;

        expr = expr.getRealExpression();
        if (expr instanceof BinaryExpression && expr.operator.type == TokenType.COALESCE) {
            argExpr = expr.left;
            defaultOptionExpr = expr.right;
            let [defaultValue, defaultValueCode] = ctx.compiler.compileExpression(expr.right, exprContext);
            if (defaultValueCode.length > 0 || !defaultValue.isCompileTimeConstant()) {
                ctx.reportError(expr.right,`Default tag option must be a constant`, defaultValue);
            } else if (!(defaultValue instanceof StringValue)) {
                ctx.reportError(expr.right, `Default tag option must be a string`, defaultValue);
            } else if (!(defaultValue.value in tagDef.options)) {
                ctx.reportError(expr.right, `'${defaultValue.value}' is not a valid default option for this tag`, defaultValue);
            } else {
                defaultOption = defaultValue.value;
            }
        } else {
            argExpr = expr;
        }

        let [arg, argCode] = ctx.compiler.compileExpression(argExpr, exprContext);
        code.push(...argCode);

        let valType = arg.getType(ctx.types);
        if (!(valType == Type.str || valType == Type.any) || arg instanceof MissingValue || arg instanceof MultiValue) {
            ctx.reportError(
                argExpr,
                `Expected type 'str' for tag option, got type '${valType.name}'`,
                arg
            );
            continue;
        }

        if (arg instanceof StringValue) {
            if (defaultOptionExpr) {
                ctx.reportError(defaultOptionExpr, `Only non-constant tags can specify a default option`);
            }
            if (!(arg.value in tagDef.options)) {
                ctx.reportError(argExpr, `'${arg.value}' is not a valid option for this tag`);
                continue;
            }
            tags.push(new ActionTagValue(tagDef, arg.value));
        } else if (arg instanceof VariableValue) {
            tags.push(new ActionTagValue(tagDef, defaultOption, arg))
        } else {
            // i dont think you can ever reach this state but i wanna have an error here just in case
            ctx.reportError(argExpr, "Just put the strings in the tag bro omg");
        }
    }
    return [tags, code];
}

export function generateGameValueHook(valueName: string, dfName: string, target: TargetType): ValueDefinition {
    let valueDef = AD.gameValues[dfName];
    let returnType = OVERRIDES.gameValueReturnTypes[dfName] ?? dfTypeToTC.get(valueDef?.type ?? DFValueType.ANY_TYPE);
    const typeGetter = () => returnType;
    return {
        definitionType: DefinitionType.VALUE,
        returnType,
        gameValue: valueDef,
        compile: (ctx) => {
            let value = new GameValueValue(dfName, target);
            value.getType = typeGetter;
            return [value, []];
        }
    }
}


export function generateActionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET, insertReturnVars: boolean = true): FunctionDefinition {
    let actionDef = AD.actions.get(codeblock)?.[actionDFName];
    if (!actionDef) throw new Error(`Initialization Error: Attempted to generate action hook for '${codeblock} ${actionDFName}' but no definition exists in the action dump.`)

    // TODO: support multiple return values
    let dfReturnType = actionDef?.returnTypes[0]?.groups[0]?.[0]?.type;
    let tcReturnType = dfReturnType ? dfTypeToTC.get(dfReturnType)! : Type.void;

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
        for (let parameterIndex = 0; parameterIndex < actionDef.parameters.length; parameterIndex++) {
            const parameter = actionDef.parameters[parameterIndex]
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
                if (AD.isParamGroupValueSetter(values[0])) {
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
                    optional: (forceRequired && parameterIndex == 1) ? false : (forceOptional || v.optional),
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
        action: actionDef,
        returnVarsAtEnd: OVERRIDES.returnValueAtEndActions[codeblock]?.has(actionDFName),
        defaultReturnType: tcReturnType,
        getReturnType,
        manuallyCompilesNamedArgs: true,
        compile(this: FunctionDefinition, args, namedArgs, ctx, callNode, extraInfo = {}): [CodeValue, CodeBlock[]] {
            // rank check
            if (!AD.rankCheck(ctx.rank, actionDef.requiresRank)) {
                ctx.reportError(
                    getImprovedErrorNode(callNode), 
                    `${toNameCase(codeblock)} '${functionName}' requires ${toNameCase(actionDef.requiresRank)} rank, compiler is set to ${toNameCase(ctx.rank || "unranked")}`
                );
            }


            let [tags, code] = compileTags(actionDef, namedArgs, ctx);

            // arg validation
            let signaturesToCheck = signatures;
            if (extraInfo.methodCallOf) 
                signaturesToCheck = methodizeParameterSignatures(signatures, extraInfo.methodCallOf.getType(ctx.types));
            validateArguments(args, callNode, signaturesToCheck, ctx, {allowNamedArgs: true});

            // cloning the list here is intentional so that whatever passed in args doesnt get its list mutated
            if (extraInfo.methodCallOf) args = [extraInfo.methodCallOf, ...args];

            let actionBlock = new ActionBlock(codeblock,{
                action: actionDFName, 
                args: args.filter(v => v instanceof TangibleValue), 
                tags: tags, 
                target: target
            });
            code.push(actionBlock);

            
            let [returnValue] = handleSingleBlockReturnVars(this, ctx, extraInfo, callNode, insertReturnVars ? actionBlock.args : [])

            return [returnValue, code];
        },

        autocompleteSortPrefix: OVERRIDES.autocompleteSortPrefixes[codeblock]?.[actionDFName],
    }
}

export function generateTagSpecifiedActionHook(
    functionName: string, 
    codeblock: DFCodeblockName, 
    actionDFName: string, 
    tagOptions: {[tag: string]: string}, 
    signatures: ParameterSignature[], 
    description: string | undefined,
    target: TargetType = TargetType.UNSET, 
): FunctionDefinition {
    let actionDef = AD.actions.get(codeblock)?.[actionDFName]!;

    let dfReturnType = actionDef?.returnTypes[0]?.groups[0]?.[0]?.type;
    let tcReturnType = dfReturnType ? dfTypeToTC.get(dfReturnType)! : Type.void;

    return {
        definitionType: DefinitionType.FUNCTION,
        name: functionName,
        description,
        signatures,
        defaultReturnType: tcReturnType,
        getReturnType: USE_DEFAULT_RETURN_TYPE,
        compile(this: FunctionDefinition, args, namedArgs, ctx, callNode, extraInfo = {}): [CodeValue, CodeBlock[]] {
            let tags: ActionTagValue[] = [];

            for (const [name, option] of Object.entries(tagOptions)) {
                let tagDef = actionDef.tags[name];
                tags.push(new ActionTagValue(tagDef, option))
            }

            // arg validation
            let signaturesToCheck = signatures;
            if (extraInfo.methodCallOf) 
                signaturesToCheck = methodizeParameterSignatures(signatures, extraInfo.methodCallOf.getType(ctx.types));
            validateArguments(args, callNode, signaturesToCheck, ctx, {allowNamedArgs: true});

            // cloning the list here is intentional so that whatever passed in args doesnt get its list mutated
            if (extraInfo.methodCallOf) args = [extraInfo.methodCallOf, ...args];

            let code = new ActionBlock(codeblock,{
                action: actionDFName, 
                args: args.filter(v => v instanceof TangibleValue), 
                tags: tags, 
                target: target
            });

            let [returnValue] = handleSingleBlockReturnVars(this, ctx, extraInfo, callNode, code.args)

            return [returnValue, [code]];
        },

        autocompleteSortPrefix: OVERRIDES.autocompleteSortPrefixes[codeblock]?.[actionDFName],
    }
}

export function generateConditionHook(functionName: string, codeblock: DFCodeblockName, actionDFName: string, target: TargetType = TargetType.UNSET): ConditionDefinition {
    let def = generateActionHook(functionName, codeblock, actionDFName, target, false) as ConditionDefinition;
    def.compileIf = def.compile;
    def.compile = (args, namedArgs, ctx, callNode, extraInfo) => {
        let [item, code] = def.compileIf(args, namedArgs, ctx, callNode, extraInfo);
        return expressionizeIfBlock(code, ctx);
    }
    def.defaultReturnType = Type.num;
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

function gameValueEntries(target: TargetType, filter: (v: AD.GameValue) => boolean): [string, ValueDefinition][] {
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
        ["player",     TargetType.UNSET],
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
        ["entity",           TargetType.UNSET],
        ["selectedEntity",   TargetType.SELECTION],
        ["defaultEntity",    TargetType.DEFAULT],
        ["killerEntity",     TargetType.KILLER],
        ["damagerEntity",    TargetType.DAMAGER],
        ["shooterEntity",    TargetType.SHOOTER],
        ["victimEntity",     TargetType.VICTIM],
        ["projectileEntity", TargetType.PROJECTILE],
        ["allEntities",      TargetType.ALL_ENTITIES],
        ["allMobs",          TargetType.ALL_MOBS],
        ["lastEntity",       TargetType.LAST_ENTITY],
    ] as [string, TargetType][]) {
        new Namespace(identifier, Object.fromEntries([
            ...codeblockActionEntries(DFCodeblockName.ENTITY_ACTION, target),
            ...codeblockActionEntries(DFCodeblockName.IF_ENTITY, target, generateConditionHook),
            ...gameValueEntries(target, v => v.targetType == GameValueTargetType.TARGETS_ANYTHING || v.targetType == GameValueTargetType.TARGETS_ENTITIES)
        ]));
    }
    
    let gameActionEntries = codeblockActionEntries(DFCodeblockName.GAME_ACTION, TargetType.UNSET)
    let ifGameEntries = codeblockActionEntries(DFCodeblockName.IF_GAME, TargetType.UNSET, generateConditionHook);
    let untargetedGameValueEntries = gameValueEntries(TargetType.UNSET, v => v.targetType == GameValueTargetType.UNTARGETED);

    // game action namespace
    new Namespace("game", Object.fromEntries([
        ...gameActionEntries.filter(([k,v]) => !isActionEventAction(v.action)),
        ...ifGameEntries.filter(([k,v]) => !isActionEventAction(v.action)),
        ...Object.entries(typeActionMembers('game')),
        ...untargetedGameValueEntries.filter(([k,v]) => !isGVEventValue(v.gameValue))
    ]));
    
    // event namespace
    new Namespace("event", Object.fromEntries([
        ...gameActionEntries.filter(([k,v]) => isActionEventAction(v.action)),
        ...ifGameEntries.filter(([k,v]) => isActionEventAction(v.action)),
        ...untargetedGameValueEntries.filter(([k,v]) => isGVEventValue(v.gameValue))
    ]));
}

//=-------------------=\\
//=- type namespaces -=\\
//=-------------------=\\

// TODO: write descriptions for all these functions and get their documentation working
export const NUM_NAMESPACE_INJECTIONS: {[funcTcName: string]: FunctionDefinition} = {
    randomd: generateTagSpecifiedActionHook(
        "randomd", DFCodeblockName.SET_VARIABLE, "RandomNumber",
        {"Rounding Mode": "Decimal number"},
        [{params: [
            {name: "Minimum Number", type: Type.num, optional: false, plural: false},
            {name: "Maximum Number", type: Type.num, optional: false, plural: false},
        ]}],
        "Sets a variable to a random decimal number between two other numbers."
    ),

    // rounding
    floor: generateTagSpecifiedActionHook(
        "floor", DFCodeblockName.SET_VARIABLE, " RoundNumber ",
        {"Round Mode": "Floor"},
        [{params: [
            {name: "Number to floor", type: Type.num, optional: false, plural: false},
            {name: "Round multiple", type: Type.num, optional: true, plural: false},
        ]}],
        "Rounds a number down to the nearest whole number or multiple."
    ),
    ceil: generateTagSpecifiedActionHook(
        "ceil", DFCodeblockName.SET_VARIABLE, " RoundNumber ",
        {"Round Mode": "Ceiling"},
        [{params: [
            {name: "Number to ceiling", type: Type.num, optional: false, plural: false},
            {name: "Round multiple", type: Type.num, optional: true, plural: false},
        ]}],
        "Rounds a number up to the nearest whole number or multiple."
    ),
    
    // degrees trig functions
    asin: generateTagSpecifiedActionHook(
        "asin", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Sine Variant": "Inverse sine (arcsine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc sine of a number.\n\nUnit: **degrees**"
    ),
    sinh: generateTagSpecifiedActionHook(
        "sinh", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Sine Variant": "Hyperbolic sine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic sine of a number.\n\nUnit: **degrees**"
    ),    
    acos: generateTagSpecifiedActionHook(
        "acos", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Cosine Variant": "Inverse cosine (arccosine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc cosine of a number.\n\nUnit: **degrees**"
    ),
    cosh: generateTagSpecifiedActionHook(
        "cosh", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Cosine Variant": "Hyperbolic cosine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic cosine of a number.\n\nUnit: **degrees**"
    ),    
    atan: generateTagSpecifiedActionHook(
        "atan", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Tangent Variant": "Inverse tangent (arctangent)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc tangent of a number.\n\nUnit: **degrees**"
    ),
    tanh: generateTagSpecifiedActionHook(
        "tanh", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Tangent Variant": "Hyperbolic tangent"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic tangent of a number.\n\nUnit: **degrees**"
    ),
    
    // radians trig functions
    sinr: generateTagSpecifiedActionHook(
        "sinr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the sine of a number.\n\nUnit: **radians**"
    ),
    asinr: generateTagSpecifiedActionHook(
        "asinr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians", "Sine Variant": "Inverse sine (arcsine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc sine of a number.\n\nUnit: **radians**"
    ),
    sinhr: generateTagSpecifiedActionHook(
        "sinhr", DFCodeblockName.SET_VARIABLE, "Sine",
        {"Input": "Radians", "Sine Variant": "Hyperbolic sine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic sine of a number.\n\nUnit: **radians**"
    ),    
    cosr: generateTagSpecifiedActionHook(
        "cosr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the cosine of a number.\n\nUnit: **radians**"
    ),
    acosr: generateTagSpecifiedActionHook(
        "acosr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians", "Cosine Variant": "Inverse cosine (arccosine)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc cosine of a number.\n\nUnit: **radians**"
    ),
    coshr: generateTagSpecifiedActionHook(
        "coshr", DFCodeblockName.SET_VARIABLE, "Cosine",
        {"Input": "Radians", "Cosine Variant": "Hyperbolic cosine"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic cosine of a number.\n\nUnit: **radians**"
    ),    
    tanr: generateTagSpecifiedActionHook(
        "tanr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the tangent of a number.\n\nUnit: **radians**"
    ),
    atanr: generateTagSpecifiedActionHook(
        "atanr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians", "Tangent Variant": "Inverse tangent (arctangent)"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the arc tangent of a number.\n\nUnit: **radians**"
    ),
    tanhr: generateTagSpecifiedActionHook(
        "tanhr", DFCodeblockName.SET_VARIABLE, "Tangent",
        {"Input": "Radians", "Tangent Variant": "Hyperbolic tangent"},
        [{params: [ {name: "Number input", type: Type.num, optional: false, plural: false}, ]}],
        "Sets a variable to the hyperbolic tangent of a number.\n\nUnit: **radians**"
    ),
    atan2r: generateTagSpecifiedActionHook(
        "atan2r", DFCodeblockName.SET_VARIABLE, "ArcTangent2",
        {"Output Type": "Radians"},
        [{params: [ 
            {name: "Y", type: Type.num, optional: false, plural: false}, 
            {name: "X", type: Type.num, optional: false, plural: false}, 
        ]}],
        "Sets a variable to the arc tangent of 2 numbers.\n\nUnit: **radians**"
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

TYPE_NAMESPACES.var = new Namespace('var', typeActionMembers('var'));
TYPE_NAMESPACES.num = new Namespace('num', {...typeActionMembers('num'), ...NUM_NAMESPACE_INJECTIONS});
TYPE_NAMESPACES.str = new Namespace('str', typeActionMembers('str'));
TYPE_NAMESPACES.txt = new Namespace('txt', typeActionMembers('txt'));
TYPE_NAMESPACES.vec = new Namespace('vec', typeActionMembers('vec'), VEC_CONSTRUCTOR);
TYPE_NAMESPACES.loc = new Namespace('loc', typeActionMembers('loc'), LOC_CONSTRUCTOR);
TYPE_NAMESPACES.snd = new Namespace('snd', typeActionMembers('snd'), SND_CONSTRUCTOR);
TYPE_NAMESPACES.pot = new Namespace('pot', typeActionMembers('pot'), POT_CONSTRUCTOR);
TYPE_NAMESPACES.par = new Namespace('par', typeActionMembers('par'), PAR_CONSTRUCTOR);
TYPE_NAMESPACES.item = new Namespace('item', typeActionMembers('item'), ITEM_CONSTRUCTOR);
TYPE_NAMESPACES.list = new Namespace('list', typeActionMembers('list'));
TYPE_NAMESPACES.dict = new Namespace('dict', typeActionMembers('dict'));

export const REPEAT_ACTIONS: {[tcName: string]: {def: FunctionDefinition, returnType: Type}} = {
    range:      {def: generateActionHook('range', DFCodeblockName.REPEAT, " Range "),   returnType: Type.num},
    grid:       {def: generateActionHook('grid', DFCodeblockName.REPEAT, "Grid"),       returnType: Type.loc},
    adjacent:   {def: generateActionHook('grid', DFCodeblockName.REPEAT, "Adjacent"),   returnType: Type.loc},
    path:       {def: generateActionHook('path', DFCodeblockName.REPEAT, "Path"),       returnType: Type.loc},
    sphere:     {def: generateActionHook('sphere', DFCodeblockName.REPEAT, "Sphere"),   returnType: Type.loc},
}

export const SELECT_ACTIONS: {[tcName: string]: FunctionDefinition} = Object.fromEntries(
    CREATE_SELECTION_ACTION_LIST.map(dfName => {
        let tcName = AD.getTCActionName(DFCodeblockName.SELECT_OBJECT, dfName);
        return [tcName, generateActionHook(tcName, DFCodeblockName.SELECT_OBJECT, dfName)]
    })
)

export const FILTER_ACTIONS: {[tcName: string]: FunctionDefinition} = Object.fromEntries(
    FILTER_SELECTION_ACTION_LIST.map(dfName => {
        let tcName = AD.getTCActionName(DFCodeblockName.SELECT_OBJECT, dfName);
        return [tcName, generateActionHook(tcName, DFCodeblockName.SELECT_OBJECT, dfName)]
    })
)