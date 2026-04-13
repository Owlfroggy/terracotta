import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { validateArguments } from "../../util/utils.ts";
import { ActionBlock } from "../codeBlock.ts";
import { CodeValue, LocationValue, MissingValue, NumberValue, TangibleValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition } from "./definition.ts";

export const VEC_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "vec",
    returnType: Type.vec,
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
    // TODO: proper arg validation
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
        if (x instanceof NumberValue && y instanceof NumberValue && z instanceof NumberValue) {
            return [new VectorValue(x.value, y.value, z.value, callNode), []];
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
    returnType: Type.loc,
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
    compile(args, namedArgs, ctx, callNode) {
        let tempVar = ctx.tvp.newTempVar(Type.loc);

        if (validateArguments(args, callNode, this.signatures, ctx) == null) 
            return [new MissingValue(callNode), []];

        let canOutputConstant = true;
        for (const arg of args) {
            if (!(arg instanceof NumberValue)) {
                canOutputConstant = false;
                break;
            }
        }

        if (canOutputConstant) {
            let nums = args as NumberValue[];
            return [new LocationValue(nums[0].value, nums[1].value, nums[2].value, nums[3]?.value ?? "0", nums[4]?.value ?? "0", callNode), []];
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