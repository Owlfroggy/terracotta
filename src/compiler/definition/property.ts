import type { Type } from "../../typeProcessor/type.ts";
import { Definition, DefinitionType } from "../definition/base.ts";
import { CodeBlock } from "../codeBlock.ts";
import { EvaluationContext } from "../codeCompiler.ts";
import { CodeValue, TangibleValue } from "../codeValue.ts";

type PropertyGetCompileBody = (ctx: EvaluationContext, propertyOf: CodeValue) => [CodeValue, CodeBlock[]];
type PropertySetCompileBody = (newValue: TangibleValue, ctx: EvaluationContext, propertyOf: CodeValue) => CodeBlock[];

export class PropertyDefinition extends Definition {
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
        super(DefinitionType.PROPERTY);
        if (valueExclusive) this.valueExclusive = valueExclusive;
    }

    clone(): Definition {
        let c = new PropertyDefinition(this.valueExclusive);
        c.type = this.type;
        c.compileGet = this.compileGet;
        c.compileSet = this.compileSet;
        c.autocompleteSortPrefix = this.autocompleteSortPrefix;
        return c;
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