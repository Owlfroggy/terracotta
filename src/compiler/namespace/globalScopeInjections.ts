import { DFCodeblockName } from "../../df/constants.ts";
import { generateActionHook } from "./builtins.ts";
import { DefinitionType, FunctionDefinition } from "./definition.ts";

export const GLOBAL_SCOPE_INJECTIONS: {[name: string]: FunctionDefinition} = {
    wait: generateActionHook('wait', DFCodeblockName.CONTROL, "Wait"),
    endthread: generateActionHook('endthread', DFCodeblockName.CONTROL, "End"),
    endallthreads: generateActionHook('endallthreads', DFCodeblockName.CONTROL, "EndAllThreads"),
    print: generateActionHook('print', DFCodeblockName.CONTROL, "PrintDebug"),
}