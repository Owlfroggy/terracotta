import { Definition, DefinitionType, FunctionDefinition, isFunctionDefinition } from "../compiler/namespace/definition.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { canFuncBeMethod, getNamespaceMemberType } from "../compiler/namespace/utils.ts";

// NOTE: this gets populated after this file is done running,
// when creating types in this file you cannot rely on this being filled out.
export const TYPE_NAMESPACES: {[typeName: string]: Namespace} = {};

export type FuncTypeData = {
    definition: FunctionDefinition;
}

export type NamespaceTypeData = {
    namespace: Namespace;
}

export type VarTypeData = {
    varType: Type,
}

export type ListTypeData = {
    genericType: Type,
    /** 
     * NOTE: this is ZERO-INDEXED! 
     * To get the type of a dfindex, you have to do dfindex - 1
     * */
    indexTypes: Type[],
}

export type DictTypeData = {
    genericType: Type,
    keyTypes: {[key: string]: Type},
    keyDescriptions: {[key: string]: string},
}

export type MultiValueTypeData = {
    types: Type[],
}

type ExtraData = FuncTypeData | NamespaceTypeData | ListTypeData | DictTypeData | MultiValueTypeData | VarTypeData | null;

export type TypeConstructor<F extends ((...args: any[]) => Type)> = F & {
    constructsType: string
    subTypeCount: number
    matches: (Type) => boolean
}

export class Type {
    /** types that variables can store */
    public static assignableTypes: Set<string> = new Set([
        'any', 'num', 'str', 'txt', 'list', 'dict', 'item', 'loc', 'vec', 'pot', 'par', 'snd'
    ])

    private static makeTypeConstructor<F extends (...args: any[]) => Type>(typeName: string, subTypeCount: number, constructor: F): TypeConstructor<F> {
        let c = constructor as TypeConstructor<F>;
        c.constructsType = typeName;
        c.subTypeCount = subTypeCount;
        c.matches = (other: Type) => {
            return typeName == ((other as any).constructsType ?? other.name);
        };
        return c;
    }

    public static any = new Type('any');
    public static num = new Type('num');
    public static str = new Type('str');
    public static txt = new Type('txt');
    public static item = new Type('item');
    public static loc = new Type('loc');
    public static vec = new Type('vec');
    public static pot = new Type('pot');
    public static par = new Type('par');
    public static snd = new Type('snd');
    public static unknown = this.any; // just in case unknown type ever needs to be separated

    // type is created in this way (as opposed to using makeTypeConstructor) so 
    // that only one object representing the void type ever has to be created
    public static void = new Type('void');
    
    public static var = this.makeTypeConstructor(
        'var', 1,
        (varType: Type) => {
            let stringify = () => {
                if (varType.matches(Type.any)) {
                    return `var`;
                } else {
                    return `var[${varType}]`;
                }
            }
            let strictMatchCallback = (other: Type) => {
                if (other.matches(Type.var)) {
                    let otherData = other.data as VarTypeData;
                    return varType.strictlyMatches(otherData.varType);
                }
                return false;
            }
            return new Type('var', {strictMatchCallback, stringify, data: {varType}});
        }
    );

    public static list = this.makeTypeConstructor(
        'list', 1,
        (genericType: Type, indexTypes: Type[] = []) => {
            let getMemberType = (m?: string | number) => {
                if (typeof m == 'number') {
                    // account for df lists being 1-indexed
                    let realIndex = m - 1;
                    if (realIndex < indexTypes.length && realIndex >= 0) {
                        return indexTypes[realIndex];
                    }
                }
                return getWidestType(...indexTypes, genericType);
            }
            let stringify = () => {
                if (indexTypes.length > 0) {
                    let genericAddon = "";
                    if (!genericType.matches(Type.void)) {
                        genericAddon = `, ${genericType}...`;
                    }
                    return `[${indexTypes.join(", ")}${genericAddon}]`
                } else {
                    return `list[${genericType}]`;
                }
            }
            let strictMatchCallback = (other: Type) => {
                if (other.matches(Type.list)) {
                    let otherData = other.data as ListTypeData;
                    // make sure theres the same number of index types
                    if (indexTypes.length != otherData.indexTypes.length)
                        return false;
                    // make sure the index types all match
                    for (let i = 0; i < indexTypes.length; i++) {
                        if (!indexTypes[i].strictlyMatches(otherData.indexTypes[i]))
                            return false;
                    }
                    // make sure generic type matches
                    return genericType.strictlyMatches(otherData.genericType);
                }
                return false;
            }
            let assignabilityCallback = (to: Type) => {
                if (to.matches(Type.var)) to = (to.data as VarTypeData).varType;
                if (to.matches(Type.any)) return true;
                if (!to.matches(Type.list)) return false;
                let toData = to.data as ListTypeData;

                //=- compare index types -=\\
                for (let i = 0; i < Math.max(toData.indexTypes.length, indexTypes.length); i++) {
                    // if to requires an index type that assignee can't guarantee, fail out
                    if (i > indexTypes.length-1) return false;

                    let toSubtype = toData.indexTypes[i] ?? toData.genericType;
                    let assigneeSubtype = indexTypes[i] ?? genericType;
                    if (!assigneeSubtype.isAssignableTo(toSubtype)) return false;
                }

                //=- compare generic types -=\\
                if (genericType != Type.void) {
                    if (!genericType.isAssignableTo(toData.genericType)) return false;
                }

                return true;
            }
            return new Type('list', {getMemberType, strictMatchCallback, assignabilityCallback, stringify, data: {genericType, indexTypes}});
        }
    );

    public static dict = this.makeTypeConstructor(
        'dict', 1,
        (genericType: Type, keyTypes: {[key: string]: Type} = {}, keyDescriptions: {[key: string]: string} = {}) => {
            let getMemberType = (m?: string | number) => {
                if (typeof m == 'string' && m in keyTypes) {
                    return keyTypes[m];
                }
                return getWidestType(...Object.values(keyTypes), genericType);
            }
            let stringify = () => {
                let keyTypeEntries = Object.entries(keyTypes);
                if (keyTypeEntries.length > 0) {
                    let genericAddon = "";
                    if (!genericType.matches(Type.void)) {
                        genericAddon = `, ${genericType}...`;
                    }
                    let entryStrings = keyTypeEntries.map(
                        ([key, type]) => `${key}: ${type}`
                    );
                    return `{${entryStrings.join(", ")}${genericAddon}}`
                } else {
                    return `dict[${genericType}]`;
                }
            }
            let strictMatchCallback = (other: Type) => {
                if (other.matches(Type.dict)) {
                    let otherData = other.data as DictTypeData;

                    // make sure all keys exist in both dicts and have the same type
                    for (const key of [...Object.keys(keyTypes), ...Object.keys(otherData.keyTypes)]) {
                        if (!(key in keyTypes)) return false;
                        if (!(key in otherData.keyTypes)) return false;
                        if (!keyTypes[key].strictlyMatches(otherData.keyTypes[key])) return false;
                    }

                    // make sure generic type matches
                    return genericType.strictlyMatches(otherData.genericType);
                }
                return false;
            }
            let assignabilityCallback = (to: Type) => {
                if (to.matches(Type.var)) to = (to.data as VarTypeData).varType;
                if (to.matches(Type.any)) return true;
                if (!to.matches(Type.dict)) return false;

                let toData = to.data as DictTypeData;

                //=- compare key types -=\\
                for (let key of Object.keys({...keyTypes, ...toData.keyTypes})) {
                    // if to requires a key type that assignee can't guarantee, fail out
                    if (!(key in keyTypes)) return false;

                    let toSubtype = toData.keyTypes[key] ?? toData.genericType;
                    let assigneeSubtype = keyTypes[key] ?? genericType;
                    if (!assigneeSubtype.isAssignableTo(toSubtype)) return false;
                }

                //=- compare generic types -=\\
                if (genericType != Type.void) {
                    if (!genericType.isAssignableTo(toData.genericType)) return false;
                }

                return true;
            }
            let members = Object.keys(keyTypes);
            let getMembers = () => members;
            return new Type('dict', {getMemberType, getMembers, strictMatchCallback, assignabilityCallback, stringify, data: {genericType, keyTypes, keyDescriptions}})
        }
    );

    public static func = this.makeTypeConstructor(
        'func', 0,
        (definition: FunctionDefinition) => {
            return new Type('func', {data: {definition}});
        }
    );

    public static namespace = this.makeTypeConstructor(
        'namespace', 0,
        (namespace: Namespace) => {
            let getPropertyType = (m: string) => getNamespaceMemberType(namespace, m)
            let getPropertyDefinition = (m: string) => {
                return namespace.members[m];
            }
            let properties = Object.keys(namespace.members);
            let getProperties = () => properties;
            return new Type('namespace',{getPropertyType, getPropertyDefinition, getProperties, data: {namespace}})
        }
    );

    public static multivalue = this.makeTypeConstructor(
        'multivalue', 0,
        (types: Type[]) => {
            let stringify = () => {
                return types.join(", ");
            }
            let strictMatchCallback = (other: Type) => {
                return false;
            }
            return new Type('multivalue', {strictMatchCallback, stringify, data: {types}});
        }
    );

    public readonly assignable: boolean;
    public readonly getMemberType = (m?: string | number) => Type.unknown;
    /** Returns a `string[]` containing all member names, or `null` if this type does not allow property access */
    public readonly getMembers: () => (string[] | null) = () => null;
    
    // default behavior: grab methodable functions from this type's namespace, if applicable
    public readonly getProperties = (): (string[] | null) => {
        const namespace = TYPE_NAMESPACES[this.name];
        if (!namespace) return null;
        let props: string[] = [];
        for (const [name, member] of Object.entries(namespace.members)) {
            if (isFunctionDefinition(member) && canFuncBeMethod(member, this)) {
                props.push(name);
            }
        }
        return props;
    };
    public readonly getPropertyType = (p: string) => {
        let namespace = TYPE_NAMESPACES[this.name];
        if (!namespace) return Type.void;
        if (!(p in namespace.members)) return Type.void;
        return getNamespaceMemberType(namespace, p);
    };
    public readonly getPropertyDefinition = (p: string): Definition | null => {
        return TYPE_NAMESPACES[this.name]?.members[p] ?? null
    }

    public readonly data: ExtraData

    constructor(
        public readonly name: string,
        {getMemberType, getMembers, getPropertyType, getPropertyDefinition, getProperties, strictMatchCallback, assignabilityCallback, stringify, data = null}: {
            getMemberType?: (member?: string | number) => Type,
            getMembers?: () => (string[] | null),
            getPropertyType?: (p: string) => Type;
            getPropertyDefinition?: (p: string) => Definition | null,
            getProperties?: () => (string[] | null);
            strictMatchCallback?: (other: Type) => boolean,
            assignabilityCallback?: (to: Type) => boolean,
            stringify?: () => string,
            data?: ExtraData
        } = {}
    ) {
        if (getMemberType) this.getMemberType = getMemberType;
        if (getMembers) this.getMembers = getMembers;
        if (getPropertyType) this.getPropertyType = getPropertyType;
        if (getPropertyDefinition) this.getPropertyDefinition = getPropertyDefinition
        if (getProperties) this.getProperties = getProperties;
        if (strictMatchCallback) this.strictlyMatches = strictMatchCallback;
        if (assignabilityCallback) this.isAssignableTo = assignabilityCallback;
        if (stringify) {
            this.toString = stringify;
            this[Symbol.toPrimitive] = stringify;
        }
        this.data = data;
    }

    toString() {
        return this.name;
    }
    [Symbol.toPrimitive] = this.toString;

    /** Only compares type names, does not compare contents/generic subtypes */
    matches = (other: Type | TypeConstructor<(...args: any[]) => Type>) => {
        return this.name == ((other as any).constructsType ?? other.name);
    };

    // this method is overridden by types that have subtypes
    /** Does take subtypes into account */
    strictlyMatches = (other: Type) => {
        return this.matches(other)
    }

    // this method is overridden by types that have special assignability behavior
    isAssignableTo = (to: Type) => {
        if (to.matches(Type.var)) to = (to.data as VarTypeData).varType;
        if (to.matches(Type.any)) return true;
        return this.strictlyMatches(to);
    }
}

// TODO: when we get unions, make this work better
// TODO: make this handle subtypes better (e.g. list[str], list[num] should genericize to list[any] instead of just any)
export function getWidestType(...types: Type[]): Type {
    let widestType = Type.void;
    for (let t of types) {
        if (t.matches(Type.void)) continue;
        if (widestType.matches(Type.void)) {
            widestType = t;
        }
        else if (t.isAssignableTo(widestType)) {
            // keep the type
        } 
        else if (widestType.isAssignableTo(t)) {
            // if t isn't assignable to the old widest but the old widest 
            // is assignable to t, that means t is the new widest type
            widestType = t;
        } 
        else {
            // if the types are incompatible, just fall back to any and call it a day
            widestType = Type.any;
            break;
        }
    }
    return widestType;
}