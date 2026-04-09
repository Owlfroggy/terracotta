import { pathToFileURL } from "node:url";
import { URI } from "vscode-languageserver";
import { Type } from "../typeProcessor/type.ts";
import { ParameterSignature } from "../compiler/namespace/definition.ts";

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
 * [(number) the index of the parameter it corresponds to] */
export function matchArgsToParams(argTypes: Type[], signature: ParameterSignature): number[] {
    let out: number[] = []
    let argIndex = 0;
    let paramIndex = 0;

    function consumeArg() {
        out.push(paramIndex);
        argIndex++;
    }
    
    let lastSkippableOptional: number;
    let lastType = signature.params[signature.params.length-1].type;
    for (lastSkippableOptional = signature.params.length-1; lastSkippableOptional >= 0; lastSkippableOptional--) {
        if (!signature.params[lastSkippableOptional].type.matches(lastType)) {
            break;
        }
    }

    for (paramIndex = 0; paramIndex < signature.params.length && argIndex < argTypes.length; paramIndex++) {
        let p = signature.params[paramIndex];
        // plural special behavior
        if (p.plural && !argTypes[argIndex].matches(Type.any)) {
            // consume args that match this type
            let consumed = 0;
            while (argIndex < argTypes.length && argTypes[argIndex].matches(p.type)) {
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
