import { Type } from "../../typeProcessor/type.ts";
import type { FunctionDefinition, ParameterSignature } from "../definition/function.ts";
import type { NamespaceDefinition } from "../definition/namespace.ts";

/** Returns true if `func` is able to be called as a method of `type` */
export function canFuncBeMethod(func: FunctionDefinition, type: Type): boolean {
    for (let sig of func.signatures) {
        let firstParam = sig.params[0];
        // TODO: handle functions that take in a var of Type
        if (!type.isAssignableTo(firstParam.type)) {
            return false;
        }
    }
    return true;
}

export function getNamespaceMemberType(namespace: NamespaceDefinition, member: string) {
    if (member && member in namespace.members) {
        let def = namespace.members[member];
        if (def?.isFunctionDefinition()) {
            return Type.func(def);
        }
        else if (def?.isValueDefinition()) {
            return def.returnType;
        }
        else if (def?.isPropertyDefinition()) {
            return def.type;
        }
    }
    return Type.void;
}


export function methodizeParameterSignatures(signatures: ParameterSignature[], methodCallOf: Type): ParameterSignature[] {
    let modified: ParameterSignature[] = [];
    for (let sig of signatures) {
        let newSignature: ParameterSignature = {params: [], name: sig.name};
        // TODO: handle var type
        let firstParamIsValid = sig.params.length > 0 && methodCallOf.isAssignableTo(sig.params[0].type);
        if (!firstParamIsValid) continue;

        let skipFirst = !sig.params[0].plural;
        
        for (let i = skipFirst ? 1 : 0; i < sig.params.length; i++) {
            newSignature.params.push(sig.params[i]);
        }
        modified.push(newSignature);
    }
    return modified;
}