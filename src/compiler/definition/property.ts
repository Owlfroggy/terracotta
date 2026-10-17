import { Type } from "../../typeProcessor/type.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, TangibleValue } from "../codeValue.ts";

type PropertyGetCompileBody = (ctx: EvaluationContext, propertyOf: CodeValue) => [CodeValue, CodeBlock[]];
type PropertySetCompileBody = (newValue: TangibleValue, ctx: EvaluationContext, propertyOf: CodeValue) => CodeBlock[];

export class PropertyDefinition {
    type: Type;
    /** 
     * If true, this property is only available on values whose type 
     * matches with this namespace; the property will NOT be available
     * on the namespace itself.
     * */
    valueExclusive?: boolean;
    compileGet: PropertyGetCompileBody;
    compileSet: PropertySetCompileBody;

    // language server specific stuff
    autocompleteSortPrefix?: string;

    constructor(valueExclusive?: boolean) {
        if (valueExclusive) this.valueExclusive = valueExclusive;
    }

    withType(type: Type): this {
        this.type = type;
        return this;
    }
    withGetCompileBody(body: PropertyGetCompileBody): this {
        this.compileGet = body;
        return this;
    }
    withSetCompileBody(body: PropertySetCompileBody): this {
        this.compileSet = body;
        return this;
    }

    withAutocompleteSortPrefix(prefix?: string): this {
        this.autocompleteSortPrefix = prefix;
        return this;
    }
}