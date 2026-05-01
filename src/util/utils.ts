import { pathToFileURL } from "node:url";
import { FoldingRangeRefreshRequest, LSPErrorCodes, URI } from "vscode-languageserver";
import { Type } from "../typeProcessor/type.ts";
import { ParameterSignature, ParameterSignatureEntry } from "../compiler/namespace/definition.ts";
import { AtomicExpression, BinaryExpression, CallExpression, Expression } from "../ast/expression.ts";
import { TokenType } from "../ast/token.ts";
import { CodeValue, MissingValue, NumberValue, TangibleValue, VariableValue } from "../compiler/codeValue.ts";
import { EvaluationContext } from "../compiler/codeCompiler.ts";
import { slog } from "../languageServer/languageServer.ts";
import { ASTNode } from "../ast/astNode.ts";
import { argv } from "node:process";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock } from "../compiler/codeBlock.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { PCode, SegmentPCode } from "../pcode/pcode.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import * as AD from "../df/actiondump.ts";
import { DF_PAR_FIELD_TO_TC } from "../data/constants.ts";

export function getOrCreateMapLayer<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
    if (!map.has(key)) {
        map.set(key, defaultValue);
        return defaultValue;
    }
    return map.get(key)!;
}

export function getOrCreateDictLayer<V>(dict: {[key: string]: V}, key: string, defaultValue: V): V {
    if (!Object.hasOwn(dict, key)) {
        dict[key] = defaultValue;
        return defaultValue;
    }
    return dict[key];
}

export function deColorizeString(input: string): string {
    return input.replaceAll(/§./g,"");
}

export function codeifyName(name: string): string {
    name = deColorizeString(name);

    //convert characters following spaces to uppercase
    for (let i = 0; i < name.length; i++) {
        if (name[i] == " " && name[i+1]) {
            name = name.substring(0, i+1) + name[i+1].toUpperCase() + name.substring(i+2);
        }
    }
    //remove spaces
    name = name.replace(/ /g,"");

    // make first letter loweracase
    name = name.substring(0,1).toLowerCase() + name.substring(1);

    return name;
}

export function upperFirst(s: string): string {
    return s.substring(0,1).toUpperCase() + s.substring(1);
}

export function pathToUri(path: string): URI { 
    return pathToFileURL(path).href;
}

/** @returns an array where the index represents an argument's index and the value represents 
 * the index of the parameter it corresponds to
 * 
 * -1 means this argument is a tag/named arg */
export function matchArgsToParams(args: Expression[], argTypes: Type[], signature: ParameterSignature): number[] {
    let out: number[] = []
    let argIndex = 0;
    let paramIndex = 0;

    function handleTags() {
        let arg = args[argIndex];
        while (arg && arg instanceof BinaryExpression && arg.operator.type == TokenType.EQUALS) {
            out.push(-1);
            argIndex++;
            arg = args[argIndex];
        }
    }

    function consumeArg() {
        out.push(paramIndex);
        argIndex++;
        handleTags();
    }
    
    let lastSkippableOptional: number;
    let lastType = signature.params[signature.params.length-1]?.type ?? Type.any;
    for (lastSkippableOptional = signature.params.length-1; lastSkippableOptional >= 0; lastSkippableOptional--) {
        if (!signature.params[lastSkippableOptional].type.matches(lastType)) {
            break;
        }
    }

    handleTags();

    for (paramIndex = 0; paramIndex < signature.params.length && argIndex < argTypes.length; paramIndex++) {
        let p = signature.params[paramIndex];
        // plural special behavior
        if (p.plural && (!argTypes[argIndex].matches(Type.any) || paramIndex == signature.params.length-1)) {
            // consume args that match this type OR any args if this plural is the last param
            let consumed = 0;
            while (argIndex < argTypes.length && (argTypes[argIndex].matches(p.type) || paramIndex == signature.params.length-1)) {
                consumeArg();
                consumed++;
            }
            // always consume at least one argument if this is required
            if (consumed == 0 && !p.optional) consumeArg();
        } 
        // optional special behavior
        else if (p.optional && !argTypes[argIndex].matches(Type.any) && !argTypes[argIndex].matches(p.type) && paramIndex <= lastSkippableOptional) {
            let canSkip = false;
            // only skip this param if there's a later param which matches this arg
            for (let i = paramIndex + 1; i < signature.params.length; i++) {
                if (argTypes[argIndex].matches(signature.params[i].type)) {
                    canSkip = true;
                    break;
                }
            }
            if (!canSkip) consumeArg();
        } 
        // default behavior
        else {
            consumeArg();
        }
    }

    return out;
}

/** does NOT do anything with tags */
export function validateArguments(args: CodeValue[], callNode: CallExpression, signatures: ParameterSignature[], ctx: EvaluationContext, allowNamedArgs: boolean = false): ParameterSignature | null {
    if (signatures.length == 0) signatures = [{params: []}];
    let argExpressions = callNode.args.elements;
    let argTypes = args.map(v => v.getType(ctx.types));

    let workingSignatures: ParameterSignature[] = [];
    let signatureErrors: Map<ParameterSignature, [ASTNode, string][]> = new Map();

    //let positionalArgCount = argExpressions.filter(arg => !(arg instanceof BinaryExpression && arg.operator.type == TokenType.EQUALS)).length;
    for (const sig of signatures) {
        let errors: [ASTNode, string][] = [];
        signatureErrors.set(sig, errors);
        let argsToParams = matchArgsToParams(argExpressions, argTypes, sig);
        
        // if (args.length != sig.params.length) {
        //     signatureErrors.get(sig)?.push([callNode.callee, `Expected ${sig.params.length} argument${sig.params.length == 1 ? "" : "s"}, got ${args.length}`]);
        //     works = false;
        // }

        let tooManyArguments = false;
        let unfilledRequiredParams: Set<ParameterSignatureEntry> = new Set();
        for (const p of sig.params) if (!p.optional) unfilledRequiredParams.add(p);
        
        let argIndex;
        let argValueIndex = 0;
        for (argIndex = 0; argIndex < argExpressions.length; argIndex++) {
            if (argsToParams[argIndex] == -1) {
                if (!allowNamedArgs) errors.push([argExpressions[argIndex], `Named arguments are not allowed here`]);
                continue;
            };

            let param = sig.params[argsToParams[argIndex]];
            if (!param) {
                tooManyArguments = true;
                break;
            };
            if (args[argValueIndex] instanceof MissingValue) {
                // dont error for missing values
            }
            else if (!(args[argValueIndex] instanceof TangibleValue)) {
                errors.push([argExpressions[argIndex],`${args[argValueIndex].constructor.name} cannot be passed to functions`]);
            }
            else if (!param.type.matches(Type.any) && !param.type.matches(argTypes[argIndex]) && !(args[argValueIndex] instanceof MissingValue)) {
                errors.push([argExpressions[argIndex], `Expected ${param.type.name} for parameter '${param.name}', got ${argTypes[argIndex].name}`]);
            }
            unfilledRequiredParams.delete(param);
            argValueIndex++;
        }

        if (tooManyArguments) {
            errors.push([callNode.callee, `Too many arguments. Expected ${sig.params.length} argument${ps(args.length)} but got ${args.length}`]);
            continue;
        }
        else if (unfilledRequiredParams.size > 0) {
            let msg = (
                (unfilledRequiredParams.size == 1
                    ? `Too few arguments. 1 parameter requires a value but is not assigned one:\n    `
                    : `Too few arguments. ${unfilledRequiredParams.size} parameters require a value but are not assigned one:\n    `
                )
                + [...unfilledRequiredParams.values().map(p => `'${p.name}' requires type '${p.type.name}'`)].join("\n    ")
            );
            errors.push([callNode.callee, msg])
        }

        if (errors.length == 0) workingSignatures.push(sig);
    }

    if (workingSignatures.length == 0) {
        // if there are multiple signatures, report the errors on the
        // callee itself so a cleaner breakdown can be provided
        if (signatures.length > 1) {
            ctx.reportError(
                callNode.callee,
                `Given arguments list (${argTypes.map(t => t.name).join(", ")}) does not match any of this function's signatures, a detailed breakdown is below:\n\n`
                + [...signatureErrors.entries().map(
                    ([sig, errors]) => {
                        return (
                            `Signature (${sig.params.map(p => p.name + ": " + p.type.name).join(", ")}) had ${errors.length} error${ps(errors.length)}:\n`
                            + errors.map(([node, error]) => "- "+error).join("\n")
                        );
                    }
                )].join("\n\n")
            );
        }
        // if there's only one signature, report errors where they appear for convenience
        else {
            for (const [callNode, message] of signatureErrors.get(signatures[0])!){ 
                ctx.reportError(callNode, message);
            }
        }
        return null;
    }

    // return the longest signature which works
    let longestSig: ParameterSignature = workingSignatures[0];
    for (let sig of workingSignatures) {
        if (sig.params.length > longestSig.params.length) {
            longestSig = sig;
        }
    }
    return longestSig;
}


/** wraps value in quotes and takes care of necessary escape sequences */
export function valueToTCString(value: string, quoteChar: string = '"'): string {
    return quoteChar + value.replace('\\','\\\\').replace(quoteChar, '\\'+quoteChar).replace('\n','\\n') + quoteChar;
}

/** 
 * stands for 'plural s' (i think)
 * @returns '' if count == 1, else returns 's' 
 * */
export function ps(count: number, inverse: boolean = false): 's' | '' {
    if (inverse) return count == 1 ? 's' : '';
    return count == 1 ? '' : 's';
}

export function expressionizeIfBlock(ifCode: CodeBlock[], ctx: EvaluationContext): [VariableValue, CodeBlock[]] {
    let tempVar = ctx.tvp.newTempVar(Type.num);
    ifCode = [
        // initialize temp var
        new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "=",
            args: [tempVar, new NumberValue("0")]
        }),
        // evaluate argument expressions, if block will be at the very end
        ...ifCode,
        new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
            // set temp var to 1 if condition is true
            new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: "=",
                args: [tempVar, new NumberValue("1")]
            }),
        new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
    ]
    return [tempVar, ifCode];
}

/**
 * Top 10 function names!!
 * 
 * @param value if a string is passed in, converts it to an array
 * with a segment pcode representing that string's value.
 * if a PCode[] expression is passed in, returns it.
 */
export function ensurePCodeness(value: string | PCode[]): PCode[] {
    if (typeof value == "string") {
        return [new SegmentPCode(value)];
    } else {
        return value;
    }
}

export function allAreCompTimeConstant(args: CodeValue[]) {
    for (const arg of args) {
        if (!arg.isCompileTimeConstant()) {
            return false;
        }
    }
    return true;
}

/**
 * Intended for use in return type getters
 * 
 * Tags will only have an entry in the dict if they are set to a constant value.
 */
export function getTagsAndArgTypes(args: Expression[], types: TypeProcessor): [argTypes: Type[], tagConstants: {[name: string]: string}] {
    let argTypes: Type[] = [];
    let tagConstants: {[name: string]: string} = {};

    for (const arg of args) {
        if (
            arg instanceof BinaryExpression 
            && arg.operator.type == TokenType.EQUALS
            && arg.left instanceof AtomicExpression
            && arg.left.token.type == TokenType.IDENTIFIER
            && arg.right instanceof AtomicExpression
            && arg.right.token.type == TokenType.STRING_LITERAL
        ) {
            tagConstants[arg.left.token.value] = arg.right.token.value;
        } else {
            argTypes.push(types.evaluateExpression(arg, types.getNodeFrame(arg)));
        }
    }

    return [argTypes, tagConstants];
}

/** Will return a string (error message) if the color is invalid */
export function integerizeHexColor(color: string): number | string {
    if (!color.startsWith("#")) {
        return `Hex color must start with a hashtag.`;
    }
    let string = color.substring(1, color.length)
    if (string.length != 6) {
        return `Invalid hex color: '${color}'`;
    }

    let int = Number("0x" + string)
    if (Number.isNaN(int) || int < 0 || int > 16777215) {
        return `Invalid hex color: '${color}'`;
    }
    
    return int
}


export function parseTcNumber(tcNum: string): number {
    // todo: make this actually good
    return parseFloat(tcNum);
}

/** 
 * Returns the allowed TC particle field names for this particle
 * 
 * Returns all fields if parDef is undefined 
 * */
export function getAllowedParticleFields(parDef: AD.Particle | undefined): string[] {
    const allowedFields = ['amount', 'spreadHoriz', 'spreadVert']; 
    if (parDef) {
        for (const dfField of parDef.fields) {
            let tcField = DF_PAR_FIELD_TO_TC[dfField];
            if (tcField) {
                allowedFields.push(tcField);
            }
        }
    } 
    // allow all fields for unspecified particle
    else {
        allowedFields.push(...Object.values(DF_PAR_FIELD_TO_TC));
    }
    return allowedFields;
}