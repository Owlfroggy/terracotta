import { Type } from "../typeProcessor/type.ts";
import { VariableScope } from "../typeProcessor/typeProcessor.ts";
import { VariableValue } from "./codeValue.ts";

export class TempVarProvider {
    constructor(
        private addon: string = "",
    ) {}

    private count: number = 0;

    newTempVar(type: Type): VariableValue {
        let v = new VariableValue(`@__TC_TMP_${this.count}${this.addon.length > 0 ? "_"+this.addon : ""}`, VariableScope.LINE, type);
        v.isTempVar = true;
        this.count++;
        return v;
    }

    resetCount() {
        this.count = 0;
    }
}