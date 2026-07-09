import { DFCodeblockName } from "../../df/constants.ts";
import { generateActionHook } from "./builtins.ts";
import { CSND_CONSTRUCTOR, LITEM_CONSTRUCTOR } from "./constructors.ts";
import { DefinitionType, FunctionDefinition } from "./definition.ts";

export const GLOBAL_SCOPE_INJECTIONS: {[name: string]: FunctionDefinition} = {
    wait: generateActionHook('wait', DFCodeblockName.CONTROL, "Wait"),
    endthread: generateActionHook('endthread', DFCodeblockName.CONTROL, "End"),
    endallthreads: generateActionHook('endallthreads', DFCodeblockName.CONTROL, "EndAllThreads"),
    print: generateActionHook('print', DFCodeblockName.CONTROL, "PrintDebug"),
    csnd: CSND_CONSTRUCTOR,
    litem: LITEM_CONSTRUCTOR,
}