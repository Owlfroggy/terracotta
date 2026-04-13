import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { ActionBlock } from "../codeBlock.ts";
import { CodeValue, MissingValue, NumberValue, TangibleValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition } from "./definition.ts";

export const VEC_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "vec",
    returnType: Type.vec,
    signatures: [
        {
            params: [
                {name: "x", type: Type.num, optional: false, plural: false},
                {name: "y", type: Type.num, optional: false, plural: false},
                {name: "z", type: Type.num, optional: false, plural: false},
            ]
        },
        {
            params: [
                {name: "value", type: Type.num, optional: false, plural: false, description: "Creates a vector with its x, y, and z components all set to this value"},
            ]
        },
    ],
    // TODO: proper arg validation
    compile(args, namedArgs, ctx, callNode) {
        let x: CodeValue, y: CodeValue, z: CodeValue;
        if (args.length == 3) {
            x = args[0];
            y = args[1];
            z = args[2];
        } else if (args.length == 1) {
            x = args[0];
            y = args[0];
            z = args[0];
        } else {
            ctx.reportError(
                callNode.args,
                "(temporary error) not enough arguments"
            );
            return [new MissingValue(callNode), []];
        }

        // constant vector
        if (x instanceof NumberValue && y instanceof NumberValue && z instanceof NumberValue) {
            return [new VectorValue(x.value, y.value, z.value), []];
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