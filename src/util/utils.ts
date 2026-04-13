import { pathToFileURL } from "node:url";
import { FoldingRangeRefreshRequest, LSPErrorCodes, URI } from "vscode-languageserver";
import { Type } from "../typeProcessor/type.ts";
import { ParameterSignature, ParameterSignatureEntry } from "../compiler/namespace/definition.ts";
import { BinaryExpression, CallExpression, Expression } from "../ast/expression.ts";
import { TokenType } from "../ast/token.ts";
import { CodeValue, MissingValue, VariableValue } from "../compiler/codeValue.ts";
import { EvaluationContext } from "../compiler/codeCompiler.ts";
import { slog } from "../languageServer/languageServer.ts";
import { ASTNode } from "../ast/astNode.ts";
import { argv } from "node:process";

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
    let lastType = signature.params[signature.params.length-1].type;
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
    let argExpressions = callNode.args.elements;
    let argTypes = args.map(v => v.getType(ctx));

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
            if (!param.type.matches(Type.any) && !param.type.matches(argTypes[argIndex]) && !(args[argValueIndex] instanceof MissingValue)) {
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