import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { allAreCompTimeConstant, validateArguments } from "../../util/utils.ts";
import { ActionBlock } from "../codeBlock.ts";
import { CodeValue, LocationValue, MissingValue, NumberValue, TangibleValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition, USE_DEFAULT_RETURN_TYPE } from "./definition.ts";

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