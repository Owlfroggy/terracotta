import { DFCodeblockName } from "../../df/constants.ts";
import { Type } from "../../typeProcessor/type.ts";
import { ActionBlock } from "../codeBlock.ts";
import { MissingValue, NumberValue, TangibleValue, VectorValue } from "../codeValue.ts";
import { DefinitionType, FunctionDefinition } from "./definition.ts";

export const VEC_CONSTRUCTOR: FunctionDefinition = {
    definitionType: DefinitionType.FUNCTION,
    name: "vec",
    returnType: Type.vec,
    signatures: [{params: [
        {name: "x", type: Type.num, optional: false, plural: false},
        {name: "y", type: Type.num, optional: false, plural: false},
        {name: "z", type: Type.num, optional: false, plural: false},
    ]}],
    // TODO: proper arg validation
    compile(args, namedArgs, ctx, callNode) {
        if (args.length != 3) {
            ctx.reportError(
                callNode.args,
                "(temporary error) not enough arguments"
            );
            return [new MissingValue(callNode), []];
        }

        // constant vector
        if (args[0] instanceof NumberValue && args[1] instanceof NumberValue && args[2] instanceof NumberValue) {
            return [new VectorValue(args[0].value, args[1].value, args[2].value), []];
        }
        // non-constant vector
        else {
            let tempVar = ctx.tvp.newTempVar(Type.vec);
            return [tempVar, [
                new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "Vector",
                    args: [tempVar, ...args] as TangibleValue[], // todo: this is awful
                    astNode: callNode,
                })
            ]];
        }
    },
}