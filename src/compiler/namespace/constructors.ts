import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { allAreCompTimeConstant, validateArguments } from "../../util/utils.ts";
import { ActionBlock, CodeBlock } from "../codeBlock.ts";
import { CodeValue, LocationValue, MissingValue, NumberValue, SoundValue, StringValue, TangibleValue, VariableValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition, USE_DEFAULT_RETURN_TYPE } from "./definition.ts";
import * as AD from "../../df/actiondump.ts";
import { EvaluationContext } from "../codeCompiler.ts";

function evaluateConstOrBlockTemplates(
    ctx: EvaluationContext, 
    args: CodeValue[], 
    starterValue: TangibleValue, 
    paramTemplates: [new (...args: any[]) => StringValue | NumberValue, string, string][]
): [TangibleValue, CodeBlock[]] {
    let code: CodeBlock[] = [];
    let tempVar = ctx.tvp.newTempVar(Type.snd);
    let latestValue: TangibleValue = starterValue;
    for (let i = 0; i < args.length; i++) {
        let arg = args[i] as TangibleValue;
        let [constValueType, soundField, action] = paramTemplates[i];
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
    compile(args, namedArgs, ctx, callNode) {
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
    compile(args, namedArgs, ctx, callNode) {
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
            ]
        }
    ],
    getReturnType: USE_DEFAULT_RETURN_TYPE,
    compile(args, namedArgs, ctx, callNode) {
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


        return evaluateConstOrBlockTemplates(
            ctx, args,
            new SoundValue("Pling",1.0,2.0,false,undefined,callNode),
            [
                [StringValue, "sound", "SetSoundType"],
                [NumberValue, "pitch", "SetSoundPitch"],
                [NumberValue, "volume", "SetSoundVolume"],
                [StringValue, "variant", "SetSoundVariant"],
            ]
        );
    },
}