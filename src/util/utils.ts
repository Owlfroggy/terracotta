import { pathToFileURL } from "node:url";
import { URI } from "vscode-languageserver";
import { Type } from "../typeProcessor/type.ts";
import { ParameterSignature } from "../compiler/namespace/definition.ts";
import { BinaryExpression, Expression } from "../ast/expression.ts";
import { TokenType } from "../ast/token.ts";
import { slog } from "../languageServer/languageServer.ts";
import { sign } from "node:crypto";

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

/** wraps value in quotes and takes care of necessary escape sequences */
export function valueToTCString(value: string, quoteChar: string = '"'): string {
    return quoteChar + value.replace('\\','\\\\').replace(quoteChar, '\\'+quoteChar).replace('\n','\\n') + quoteChar;
}