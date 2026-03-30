import { Type } from "../typeProcessor/type.ts";
import { VariableScope } from "../typeProcessor/typeProcessor.ts";
import { VariableValue } from "./codeValue.ts";

export class TempVarProvider {
    private count: number = 0;

    newTempVar(type: Type): VariableValue {
        let v = new VariableValue(`@__TC_TMP_${this.count}`, VariableScope.LINE, type);
        this.count++;
        return v;
    }

    resetCount() {
        this.count = 0;
    }
}