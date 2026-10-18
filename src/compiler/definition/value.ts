import { GameValue } from "../../df/actiondump.ts";
import type { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue } from "../codeValue.ts";
import { Definition, DefinitionType } from "./base.ts";

export class ValueDefinition extends Definition {
    returnType: Type;
    /** Is only used for language server purposes, the compiler should never touch this */
    gameValue?: GameValue;
    compile: (ctx: EvaluationContext) => [CodeValue, CodeBlock[]];
    
    constructor() {super(DefinitionType.VALUE)}

    clone(): Definition {
        let c = new ValueDefinition();
        c.returnType = this.returnType;
        c.gameValue = this.gameValue;
        c.compile = this.compile;
        return c;
    }
    
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