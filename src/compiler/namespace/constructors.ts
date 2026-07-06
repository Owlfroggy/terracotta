import { DFCodeblockName, TC_HEADER} from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { allAreCompTimeConstant, getAllowedParticleFields, integerizeHexColor, parseTcNumber } from "../../util/utils.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeValue, ItemValue, LibraryItemValue, LocationValue, MissingValue, NumberValue, ParticleValue, PotionValue, SoundValue, StringValue, TangibleValue, VariableValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition, USE_DEFAULT_RETURN_TYPE } from "./definition.ts";
import * as AD from "../../df/actiondump.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { AtomicExpression } from "../../ast/expression.ts";
import { TokenType } from "../../ast/token.ts";
import { BLOCK_OR_ITEM_IDS, DF_PAR_FIELD_TO_TC, PAR_MATERIAL_FIELD_TYPES, PARTICLE_FIELD_DEFAULTS, VALID_BLOCK_IDS, VALID_ITEM_IDS } from "../../data/constants.ts";
import { validateArguments } from "../../util/argValidation.ts";
import { VariableScope } from "../../typeProcessor/typeProcessor.ts";
import { ItemLibrary } from "../itemLibrary.ts";
import { MCNote } from "../../util/note.ts";
import { ASTNode } from "../../ast/astNode.ts";
import { isSNBTValid } from "../../util/snbtUtils.ts";
import * as NBT from "nbtify"

/** pass undefined in place of a template to skip this ark */
function evaluateConstOrBlockTemplates(
    ctx: EvaluationContext, 
    args: CodeValue[], 
    starterValue: TangibleValue, 
    outputType: Type,
    paramTemplates: ([new (...args: any[]) => StringValue | NumberValue, string, string] | undefined)[]
): [TangibleValue, CodeBlock[]] {
    let code: CodeBlock[] = [];
    let tempVar = ctx.tvp.newTempVar(outputType);
    let latestValue: TangibleValue = starterValue;
    for (let i = 0; i < args.length; i++) {
        let arg = args[i] as TangibleValue;
        if (paramTemplates[i] == undefined) continue;
        let [constValueType, soundField, action] = paramTemplates[i]!;
        if (arg instanceof constValueType && arg.isCompileTimeConstant()) {
            starterValue[soundField] = arg.value;
        } else {
            code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: action,
                args: [tempVar, latestValue, arg as TangibleValue]
            }))
            latestValue = tempVar;
        }
    }
    return [latestValue, code]
}

/**
 * @returns new outVal (set outVal to the result of this function)
 */
function applyPitchArg(
    pitchArg: CodeValue, 
    originalSound: SoundValue, 
    callNode: ASTNode, 
    ctx: EvaluationContext, 
    originalOutVal: TangibleValue, 
    code: CodeBlock[]
): TangibleValue {
     // pitch is done seperately from the main handler since the note name shenanigans
    if (pitchArg instanceof StringValue && pitchArg.isCompileTimeConstant()) {
        let pitch = MCNote.getPitchFromNote(pitchArg.value);
        if (pitch) {
            originalSound.pitch = pitch;
        } else {
            ctx.reportError(pitchArg.astNode ?? callNode, `Invalid pitch '${pitchArg.value}'`);
        }
        return originalOutVal;
    }
    else if (pitchArg instanceof NumberValue && pitchArg.isCompileTimeConstant()) {
        originalSound.pitch = pitchArg.value as unknown as number; // TODO: fix this
        return originalOutVal;
    }
    else {
        let tempVar = (originalOutVal instanceof VariableValue && originalOutVal.isTempVar) ? originalOutVal : ctx.tvp.newTempVar(Type.snd);
        code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "SetSoundPitch",
            args: [tempVar, originalOutVal, pitchArg as TangibleValue]
        }))
        return tempVar;
    }
}

export const VEC_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "vec",
    defaultReturnType: Type.vec,
    signatures: [
        {
            name: "normal",
            params: [
                {name: "x", type: Type.num, optional: false, plural: false},
                {name: "y", type: Type.num, optional: false, plural: false},
                {name: "z", type: Type.num, optional: false, plural: false},
            ]
        },
        {
            name: "value",
            params: [
                {name: "value", type: Type.num, optional: false, plural: false, description: "Creates a vector with its x, y, and z components all set to this value"},
            ]
        },
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        let x: CodeValue, y: CodeValue, z: CodeValue;

        let workingSignature = validateArguments(args, callNode, this.signatures, ctx);
        if (workingSignature == null) {
            return [new MissingValue(callNode), []];
        }
        else if (workingSignature.name == "value") {
            x = args[0];
            y = args[0];
            z = args[0];
        }
        else {
            x = args[0];
            y = args[1];
            z = args[2];
        }

        // constant vector
        if (allAreCompTimeConstant([x,y,z]) && x instanceof NumberValue && y instanceof NumberValue && z instanceof NumberValue) {
            return [new VectorValue(x.value as string, y.value as string, z.value as string, callNode), []];
        }
        // non-constant vector
        else {
            let tempVar = ctx.tvp.newTempVar(Type.vec);
            return [tempVar, [
                new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "Vector",
                    args: [tempVar, x, y, z] as TangibleValue[], // todo: this is awful and will likely cause crashes
                    astNode: callNode,
                })
            ]];
        }
    },
}

export const LOC_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "loc",
    defaultReturnType: Type.loc,
    signatures: [
        {
            params: [
                {name: "x", type: Type.num, optional: false, plural: false},
                {name: "y", type: Type.num, optional: false, plural: false},
                {name: "z", type: Type.num, optional: false, plural: false},
                {name: "pitch", type: Type.num, optional: true, plural: false},
                {name: "yaw", type: Type.num, optional: true, plural: false},
            ]
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        let tempVar = ctx.tvp.newTempVar(Type.loc);

        if (validateArguments(args, callNode, this.signatures, ctx) == null) 
            return [new MissingValue(callNode), []];

        if (allAreCompTimeConstant(args)) {
            let nums = args as (NumberValue & {value: string})[];
            return [new LocationValue(
                nums[0].value, 
                nums[1].value, 
                nums[2].value, 
                nums[3]?.value ?? "0", 
                nums[4]?.value ?? "0", 
                callNode
            ), []];
        } else {
            let tempVar = ctx.tvp.newTempVar(Type.loc);
            return [tempVar, [
                new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetAllCoords",
                    args: [tempVar, ...args] as TangibleValue[], // todo: this is awful and will likely cause crashes
                    astNode: callNode,
                })
            ]];
        }
    },
}

export const SND_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "snd",
    defaultReturnType: Type.snd,
    signatures: [
        {
            params: [
                {name: "sound", type: Type.str, optional: false, plural: false},
                {name: "pitch", type: Type.num, optional: true, plural: false},
                {name: "volume", type: Type.num, optional: true, plural: false},
                {name: "variant", type: Type.str, optional: true, plural: false},
            ],
            disallowSkips: true
        },
        {
            params: [
                {name: "sound", type: Type.str, optional: false, plural: false},
                {name: "pitch", type: Type.str, optional: false, plural: false, description: "Note name (e.g. A1) in the range 'F#0' -> 'Gb2'"},
                {name: "volume", type: Type.num, optional: true, plural: false},
                {name: "variant", type: Type.str, optional: true, plural: false},
            ],
            disallowSkips: true
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // validation
        let failed = false;
        if (args.length > 0 && args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            if (args[0].value in AD.sounds) {
                // variant validation
                let soundDef = AD.sounds[args[0].value];
                if (soundDef && args.length>3 && args[3] instanceof StringValue && args[3].isCompileTimeConstant() && !soundDef.variants.includes(args[3].value)) {
                    ctx.reportError(
                        args[3].astNode ?? callNode,
                        (
                            soundDef.variants.length == 0
                            ? `Sound '${soundDef.name}' does not have multiple variants to choose from`
                            : `Invalid variant '${args[3].value}' for sound '${soundDef.name}'`
                        )
                    )
                    failed = true
                }
            }
            else {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Invalid sound name '${args[0].value}'`
                )
                failed = true
            }
        }

        
        if (validateArguments(args, callNode, this.signatures, ctx) == null || failed) 
            return [new MissingValue(callNode), []];


        let originalSound = new SoundValue("Pling",1.0,2.0,false,undefined,callNode);
        let [outVal, code] = evaluateConstOrBlockTemplates(
            ctx, args,
            originalSound, Type.snd,
            [
                [StringValue, "sound", "SetSoundType"],
                undefined,
                [NumberValue, "volume", "SetSoundVolume"],
                [StringValue, "variant", "SetSoundVariant"],
            ]
        );

        if (args[1]) outVal = applyPitchArg(args[1], originalSound, callNode, ctx, outVal, code);

        return [outVal, code]
    },
}

export const CSND_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "csnd",
    description: "Returns a sound value representing a raw sound key. Use this for custom sounds added by resource packs. Due to DiamondFire/Minecraft limitations, variants cannot be specified.",
    defaultReturnType: Type.snd,
    signatures: [
        {
            params: [
                {name: "sound", type: Type.str, optional: false, plural: false, description: "Specified using Minecraft's internal IDs, e.g. \"minecraft:block.anvil.land\". Custom resource pack sounds are supported."},
                {name: "pitch", type: Type.num, optional: true, plural: false, description: "Pitch in the range 1.0 -> 2.0"},
                {name: "volume", type: Type.num, optional: true, plural: false},
            ],
            disallowSkips: true
        },
        {
            params: [
                {name: "sound", type: Type.str, optional: false, plural: false, description: "Specified using Minecraft's internal IDs, e.g. \"minecraft:block.anvil.land\". Custom resource pack sounds are supported."},
                {name: "pitch", type: Type.str, optional: true, plural: false, description: "Note name (e.g. A1) in the range 'F#0' -> 'Gb2'"},
                {name: "volume", type: Type.num, optional: true, plural: false},
            ],
            disallowSkips: true
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // validation
        let failed = false;
        if (args.length > 0 && args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            if (!/^[a-z0-9/._\-:]*$/g.test(args[0].value)) {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Sound key contains invalid character(s). Sound keys can only use: lowercase a-z, 0-9, '/', '.', '_', '-', and ':'`
                );
                failed = true;
            }
            else if (/.*:.*:.*/.test(args[0].value)) {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Sound keys may only contain a maximum of one colon (':')`
                );
                failed = true;
            }
        }

        if (validateArguments(args, callNode, this.signatures, ctx) == null || failed) 
            return [new MissingValue(callNode), []];

        let originalSound = new SoundValue("Pling",1.0,2.0,true,undefined,callNode);
        let [outVal, code] = evaluateConstOrBlockTemplates(
            ctx, args,
            originalSound, Type.snd,
            [
                [StringValue, "sound", "SetCustomSound"],
                undefined,
                [NumberValue, "volume", "SetSoundVolume"],
            ]
        );
        
        if (args[1]) outVal = applyPitchArg(args[1], originalSound, callNode, ctx, outVal, code);

        return [outVal, code];
    },
}

export const POT_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "pot",
    defaultReturnType: Type.pot,
    signatures: [
        {
            params: [
                {name: "effect", type: Type.str, optional: false, plural: false},
                {name: "level", type: Type.num, optional: true, plural: false},
                {name: "duration", type: Type.num, optional: true, plural: false, description: "Unit: ticks\n20 ticks = 1 second"},
            ],
            disallowSkips: true
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // validation
        let failed = false;
        if (args.length > 0 && args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            if (!(args[0].value in AD.potions)) {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Invalid effect id '${args[0].value}'`
                );
                failed = true;
            }
        }

        
        if (validateArguments(args, callNode, this.signatures, ctx) == null || failed) 
            return [new PotionValue("Speed", 1, 1000000, callNode), []];


        return evaluateConstOrBlockTemplates(
            ctx, args,
            new PotionValue("Speed", 1, 1000000, callNode), Type.pot,
            [
                [StringValue, "effect", "SetPotionType"],
                [NumberValue, "level", "SetPotionAmp"],
                [NumberValue, "duration", "SetPotionDur"],
            ]
        );
    },
}

// TODO: when named args become more properly supported, update 
// this to use that system instead of the weird hack its doing rn
export const PAR_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "par",
    defaultReturnType: Type.par,
    signatures: [
        {
            params: [
                {name: "particle", type: Type.str, optional: false, plural: false},
            ]
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    // this function is awful because particles are awful
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // if this is set, that means theres a constant string as the particle name arg
        let parDef: AD.Particle | undefined;

        let code: CodeBlock[] = [];
        let tempVar = ctx.tvp.newTempVar(Type.par);
        let starterValue = new ParticleValue("Rain", 1, 0, 0, {});
        let latestValue: ParticleValue | VariableValue = starterValue;

        function validateType(arg: CodeValue, type: Type): arg is TangibleValue {
            if (arg == undefined) return false;
            let argType = arg.getType(ctx.types);
            if (!argType.matches(type)) {
                ctx.reportError(
                    arg.astNode ?? callNode.callee,
                    `Expected type '${type.name}', got '${argType.name}'`
                );
                return false;
            } else if (!(arg instanceof TangibleValue)) {
                ctx.reportError(
                    arg.astNode ?? callNode.callee,
                    `${arg.constructor.name} is not allowed here`
                )
                return false;
            }
            return true;
        }

        if (args.length > 1) {
            ctx.reportError(callNode.callee,`Too many arguments. Expected 1 argument but got ${args.length}`);
        }
        
        //=- particle name -=\\
        if (args.length == 0) {
            ctx.reportError(
                callNode.callee, 
                "Particle constructor must provide a particle name"
            );
        }
        // constant value
        else if (args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            parDef = AD.particles[args[0].value];
            if (!parDef) {
                ctx.reportError(
                    args[0].astNode ?? callNode.callee,
                    `Invalid particle name '${args[0].value}'`
                );
            }
            starterValue.particle = args[0].value;
        } 
        // variable value
        else if (validateType(args[0], Type.str)) {
            code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: "SetParticleType",
                args: [tempVar, latestValue, args[0]]
            }))
            latestValue = tempVar;
        }
        

        const allowedFields = getAllowedParticleFields(parDef);
        

        // turn namedArgs map into something actually usable
        let fieldArgs: {[name: string]: CodeValue} = {};
        for (const [nameExpr, argValue] of namedArgs.entries()) {
            if (!(nameExpr instanceof AtomicExpression && (nameExpr.token.type == TokenType.IDENTIFIER || nameExpr.token.type == TokenType.STRING_LITERAL))) {
                ctx.reportError(nameExpr, `Argument name must be an identifier or string literal`);
                continue;
            }
            let name = nameExpr.token.value;
            if (!allowedFields.includes(name)) {
                if (parDef && name in PARTICLE_FIELD_DEFAULTS) {
                    ctx.reportError(nameExpr.parent ?? nameExpr, `Particle '${parDef.name}' does not support field '${name}'`)
                } else {
                    ctx.reportError(nameExpr.parent ?? nameExpr, `Invalid particle field '${name}'`);
                }
                continue;
            }
            fieldArgs[name] = argValue;
        }
        // assign default values to any fields not specified
        for (const field of allowedFields) {
            if (!(field in fieldArgs)) {
                fieldArgs[field] = PARTICLE_FIELD_DEFAULTS[field];
            }
        }
        
        //=- amount -=\\
        let amount = fieldArgs.amount;
        if (validateType(amount, Type.num)) {
            if (amount instanceof NumberValue && amount.isCompileTimeConstant()) {
                starterValue.amount = amount.toNumber();
            } else {
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleAmount",
                    args: [tempVar, latestValue, amount]
                }))
                latestValue = tempVar;
            }
        }
        
        //=- spread -=\\
        let spreadHoriz = fieldArgs.spreadHoriz;
        let spreadVert = fieldArgs.spreadVert;
        if (validateType(spreadHoriz, Type.num) && validateType(spreadVert, Type.num)) {
            if (spreadHoriz instanceof NumberValue && spreadHoriz.isCompileTimeConstant() && spreadVert instanceof NumberValue && spreadVert.isCompileTimeConstant()) {
                starterValue.spreadHorizontal = spreadHoriz.toNumber();
                starterValue.spreadVertical = spreadVert.toNumber();
            } else {
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleSprd",
                    args: [tempVar, latestValue, spreadHoriz, spreadVert]
                }))
                latestValue = tempVar;
            }
        }

        //=- color -=\\
        let color = fieldArgs.color;
        let colorVariation = fieldArgs.colorVariation;
        // hex code validation is done seperately so that it still runs no matter whats happening with colorVariation
        let colInt: number | string = (
            (color instanceof StringValue && color.isCompileTimeConstant())
            ? integerizeHexColor(color.value)
            : ""
        );
        if (typeof colInt == "string" && colInt != "") {
            ctx.reportError(
                color.astNode ?? callNode.callee,
                colInt
            );
        }

        if (validateType(color, Type.str) && validateType(colorVariation, Type.num)) {
            if (color instanceof StringValue && color.isCompileTimeConstant() && colorVariation instanceof NumberValue && colorVariation.isCompileTimeConstant()) {
                let colInt = integerizeHexColor(color.value);
                if (typeof colInt == "number") {
                    starterValue.data.rgb = colInt;
                }
                starterValue.data.colorVariation = colorVariation.toNumber();
            }
            else {
                starterValue.data.rgb = 0xFF0000;
                starterValue.data.colorVariation = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleColor",
                    args: [tempVar, latestValue, color, colorVariation]
                }))
                latestValue = tempVar;
            }
        }

        //=- fade color -=\\
        let fadeColor = fieldArgs.fadeColor;
        if (validateType(fadeColor, Type.str)) {
            if (fadeColor instanceof StringValue && fadeColor.isCompileTimeConstant()) {
                let colInt = integerizeHexColor(fadeColor.value);
                if (typeof colInt == "number") {
                    starterValue.data.rgb_fade = colInt;
                } else {
                    ctx.reportError(
                        fadeColor.astNode ?? callNode.callee,
                        colInt
                    )
                }
            }
            else {
                starterValue.data.rgb_fade = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleFade",
                    args: [tempVar, latestValue, fadeColor]
                }))
                latestValue = tempVar;
            }
        }
        
        //=- motion -=\\
        let motion = fieldArgs.motion;
        let motionVariation = fieldArgs.motionVariation;
        let includeMotionVariation = allowedFields.includes("motionVariation");
        if (validateType(motion, Type.vec) && (!includeMotionVariation || validateType(motionVariation, Type.num))) {
            if (motion instanceof VectorValue && motion.isCompileTimeConstant() && (!includeMotionVariation || (motionVariation instanceof NumberValue && motionVariation.isCompileTimeConstant()))) {
                starterValue.data.x = parseTcNumber(motion.x);
                starterValue.data.y = parseTcNumber(motion.y);
                starterValue.data.z = parseTcNumber(motion.z);
                if (includeMotionVariation) starterValue.data.motionVariation = (motionVariation as NumberValue).toNumber();
            }
            else {
                starterValue.data.x = 0;
                starterValue.data.y = 0;
                starterValue.data.z = 0;
                if (includeMotionVariation) starterValue.data.motionVariation = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleMotion",
                    args: includeMotionVariation ? [tempVar, latestValue, motion, motionVariation as TangibleValue] : [tempVar, latestValue, motion],
                }));
                latestValue = tempVar;
            }
        }
        
        //=- size -=\\
        let size = fieldArgs.size;
        let sizeVariation = fieldArgs.sizeVariation;
        if (validateType(size, Type.num) && validateType(sizeVariation, Type.num)) {
            if (size instanceof NumberValue && size.isCompileTimeConstant() && sizeVariation instanceof NumberValue && sizeVariation.isCompileTimeConstant()) {
                starterValue.data.size = size.toNumber();
                starterValue.data.sizeVariation = sizeVariation.toNumber();
            }
            else {
                starterValue.data.size = 0;
                starterValue.data.sizeVariation = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleSize",
                    args: [tempVar, latestValue, size, sizeVariation]
                }));
                latestValue = tempVar;
            }
        }

        //=- material -=\\
        let material = fieldArgs.material;
        if (validateType(material, Type.str)) {
            if (material instanceof StringValue && material.isCompileTimeConstant()) {
                let validIds = PAR_MATERIAL_FIELD_TYPES[parDef?.name ?? ''] ?? BLOCK_OR_ITEM_IDS; // least sinful use of ?? operator
                if (!validIds.has(material.value)) {
                    let addendum = "";
                    if (validIds == VALID_ITEM_IDS && VALID_BLOCK_IDS.has(material.value)) {
                        addendum = ", this particle only supports item ids";
                    } else if (validIds == VALID_BLOCK_IDS && VALID_ITEM_IDS.has(material.value)) {
                        addendum = ", this particle only supports block ids";
                    }
                    ctx.reportError(
                        material.astNode ?? callNode.callee,
                        `Invalid material id '${material.value}'${addendum}`
                    );
                }
                starterValue.data.material = material.value;
            }
            else {
                starterValue.data.material = "oak_log";
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleMat",
                    args: [tempVar, latestValue, material]
                }));
                latestValue = tempVar;
            }
        }
        
        //=- roll -=\\
        let roll = fieldArgs.roll;
        if (validateType(roll, Type.num)) {
            if (roll instanceof NumberValue && roll.isCompileTimeConstant()) {
                starterValue.data.roll = roll.toNumber();
            }
            else {
                starterValue.data.roll = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleRoll",
                    args: [tempVar, latestValue, roll]
                }));
                latestValue = tempVar;
            }
        }
        
        //=- opacity -=\\
        let opacity = fieldArgs.opacity;
        if (validateType(opacity, Type.num)) {
            if (opacity instanceof NumberValue && opacity.isCompileTimeConstant()) {
                starterValue.data.opacity = opacity.toNumber();
            }
            else {
                starterValue.data.opacity = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleOpac",
                    args: [tempVar, latestValue, opacity]
                }));
                latestValue = tempVar;
            }
        }
        
        //=- power -=\\
        let power = fieldArgs.power;
        if (validateType(power, Type.num)) {
            if (power instanceof NumberValue && power.isCompileTimeConstant()) {
                starterValue.data.power = power.toNumber();
            }
            else {
                starterValue.data.power = 0;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticlePower",
                    args: [tempVar, latestValue, power]
                }));
                latestValue = tempVar;
            }
        }

        //=- duration -=\\
        let duration = fieldArgs.duration;
        if (validateType(duration, Type.num)) {
            if (duration instanceof NumberValue && duration.isCompileTimeConstant()) {
                starterValue.data.time = duration.toNumber();
            } else {
                starterValue.data.time = 20;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetParticleDur",
                    args: [tempVar, latestValue, duration]
                }));
                latestValue = tempVar;
            }
        }

        return [latestValue, code];
    },
}


// TODO: special case for item("air")
export const ITEM_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "item",
    defaultReturnType: Type.item,
    signatures: [
        {
            params: [
                {name: "item", type: Type.str, optional: false, plural: false},
                {name: "count", type: Type.num, optional: true, plural: false},
            ],
            disallowSkips: true
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // validation
        let failed = false;
        let useAirItem = false;
        if (args.length > 0 && args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            if (args[0].value == "air") {
                useAirItem = true;
            }
            else if (!(VALID_ITEM_IDS.has(args[0].value))) {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Invalid item id '${args[0].value}'`
                );
                failed = true;
            }
        }

        
        if (validateArguments(args, callNode, this.signatures, ctx) == null || failed) 
            return [new ItemValue("stone", 1, undefined, callNode), []];

        if (useAirItem) {
            return [ctx.compiler.getAirItem(), []];
        }

        return evaluateConstOrBlockTemplates(
            ctx, args,
            new ItemValue("stone", 1, undefined, callNode), Type.item,
            [
                [StringValue, "id", "SetItemType"],
                [NumberValue, "count", "SetItemAmount"],
            ]
        );
    },
}

export const LITEM_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "litem",
    description: "Returns an item from an item library. \n\nVariables may be passed to the Library ID and Item ID parameters. Invalid library/item ids will return `0`.",
    defaultReturnType: Type.item,
    signatures: [
        {
            params: [
                {name: "library", type: Type.str, optional: false, plural: false},
                {name: "item", type: Type.str, optional: false, plural: false},
                {name: "count", type: Type.num, optional: true, plural: false},
            ],
            disallowSkips: true
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode, extraInfo = {}) {
        // validation
        let failed = false;
        let constantLibrary: ItemLibrary | undefined;
        let constantItemId: string | undefined;

        if (args.length > 1 && args[1] instanceof StringValue && args[1].isCompileTimeConstant()) {
            constantItemId = args[1].value;
        }
        
        if (args.length > 0 && args[0] instanceof StringValue && args[0].isCompileTimeConstant()) {
            let libraries = ctx.getItemLibraries();
            let libId = args[0].value;
            if (libId in libraries) {
                constantLibrary = libraries[libId];
                if (constantItemId != undefined && !(constantItemId in constantLibrary.items)) {
                    ctx.reportError(
                        args[1].astNode ?? callNode,
                        `Library '${libId}' has no item with id '${constantItemId}'`
                    );
                    failed = true;
                }
            }
            else {
                ctx.reportError(
                    args[0].astNode ?? callNode,
                    `Invalid library id '${args[0].value}'`
                );
                failed = true;
            }
        }

        
        if (validateArguments(args, callNode, this.signatures, ctx) == null || failed) 
            return [new ItemValue("stone", 1, undefined, callNode), []];


        let code: CodeBlock[] = [];
        let outVal: TangibleValue;
        let defaultCount = -1;

        let useVarCompilation = true;
        if (constantLibrary != undefined && constantItemId != undefined) {
            // TODO: make count work in here
            let item = constantLibrary.items[constantItemId];
            let isValid = isSNBTValid(item.data)
            if (isValid) {
                // TODO: dont double parse nbt
                let c = NBT.parse<NBT.CompoundTag>(item.data).count
                if (c != undefined && typeof c == "number") 
                    defaultCount = c;

                if (constantLibrary.compilationMode == 'item') {
                    outVal = new LibraryItemValue(item.data, item.version, constantLibrary.id, constantItemId);
                    useVarCompilation = false;
                }
            } else {

                if (constantLibrary.compilationMode == 'item') {
                    outVal = new ItemValue("stone", 1);
                    useVarCompilation = false;
                }
            }
        }
        if (useVarCompilation) {
            let code: CodeBlock[] = [];
            let outputVarName = `${TC_HEADER}LI_`;
    
            function addVarToName(v: VariableValue) {
                let nameToAdd: string;
                if (v.scope == VariableScope.LINE) {
                    nameToAdd = typeof v.name == "string" ? v.name : v.name.join("");
                } 
                // if this variable isn't line scoped, it must be extracted to a line
                // scoped var because of %var's ambiguous scoping
                else {
                    let temp = ctx.tvp.newTempVar(Type.str);
                    code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                        action: "=",
                        args: [temp, v]
                    }))
                    nameToAdd = temp.name;
                }
                outputVarName += `%var(${nameToAdd})`;
            }
    
            if (constantLibrary != undefined) {
                outputVarName += constantLibrary.id;
            } else {
                addVarToName(args[0] as VariableValue);
            }
            outputVarName += "\uFFFF";
            if (constantItemId != undefined) {
                outputVarName += constantItemId;
            } else {
                addVarToName(args[1] as VariableValue);
            }

            outVal = new VariableValue(outputVarName, VariableScope.GLOBAL, Type.item, callNode);
        }

        //=- handle item count -=\\
        if (args[2]) {
            let numIsConstant = args[2] instanceof NumberValue && args[2] instanceof NumberValue && args[2].isCompileTimeConstant();
            // if the count can be inlined directly into the item, do that
            if (numIsConstant && outVal! instanceof LibraryItemValue) {
                outVal!.countOverride = parseTcNumber((args[2] as NumberValue).value as string);
            } 
            // otherwise, generate a codeblock
            else {
                let temp = ctx.tvp.newTempVar(Type.item);
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "SetItemAmount",
                    args: [temp, outVal!, args[2] as TangibleValue]
                }));
                outVal = temp;
            }
        }

        return [outVal!, code];
    },
}