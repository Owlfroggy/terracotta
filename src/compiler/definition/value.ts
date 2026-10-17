import { GameValue } from "../../df/actiondump.ts";
import { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue } from "../codeValue.ts";
import { Definition } from "./base.ts";

export class ValueDefinition extends Definition {
    returnType: Type;
    /** Is only used for language server purposes, the compiler should never touch this */
    gameValue?: GameValue;
    compile: (ctx: EvaluationContext) => [CodeValue, CodeBlock[]];
    
    constructor() {super()}
    
    withReturnType(type: Type): this {
        this.returnType = type;
        return this;
    }
    withGameValue(value: GameValue): this {
        this.gameValue = value;
        return this;
    }
    withCompilationBody(body: (ctx: EvaluationContext) => [CodeValue, CodeBlock[]]): this {
        this.compile = body;
        return this;
    }
}