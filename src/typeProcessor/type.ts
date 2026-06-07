import { DefinitionType, FunctionDefinition } from "../compiler/namespace/definition.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";

export type FuncTypeData = {
    definition: FunctionDefinition;
}

export type NamespaceTypeData = {
    namespace: Namespace;
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
}

export type MultiValueTypeData = {
    types: Type[],
}

type ExtraData = FuncTypeData | NamespaceTypeData | ListTypeData | DictTypeData | MultiValueTypeData | null;

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
    public static var = new Type('var');
    public static unknown = this.any; // just in case unknown type ever needs to be separated

    public static void = new Type('void');
    
    public static list = this.makeTypeConstructor(
        'list', 1,
        (genericType: Type, indexTypes: Type[] = []) => {
            let getMemberType = (m?: string | number) => {
                if (typeof m == 'number') {
                    // acount for df lists being 1-indexed
                    let realIndex = m - 1;
                    if (realIndex < indexTypes.length) {
                        return indexTypes[realIndex];
                    } else {
                        return genericType;
                    }
                }
                return genericType;
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
            return new Type('list', {getMemberType, strictMatchCallback, stringify, data: {genericType, indexTypes}});
        }
    );

    public static dict = this.makeTypeConstructor(
        'dict', 1,
        (genericType: Type, keyTypes: {[key: string]: Type} = {}) => {
            let getMemberType = (m?: string | number) => {
                if (typeof m == 'string' && m in keyTypes) {
                    return keyTypes[m];
                }
                return genericType;
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
            let members = Object.keys(keyTypes);
            let getMembers = () => members;
            return new Type('dict', {getMemberType, getMembers, strictMatchCallback, stringify, data: {genericType, keyTypes}})
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
            let getMemberType = (m?: string | number) => {
                if (m && m in namespace.members) {
                    let def = namespace.members[m];
                    if (def.definitionType == DefinitionType.VALUE) {
                        return def.returnType;
                    }
                    else if (def.definitionType == DefinitionType.FUNCTION) {
                        return Type.func(def);
                    }
                }
                return Type.any;
            }
            let members = Object.keys(namespace.members);
            let getMembers = () => members;
            return new Type('namespace',{getMemberType, getMembers, data: {namespace}})
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
    public readonly data: ExtraData

    constructor(
        public readonly name: string,
        {getMemberType, getMembers, strictMatchCallback, stringify, data = null}: {
            getMemberType?: (member?: string | number) => Type,
            getMembers?: () => (string[] | null),
            strictMatchCallback?: (other: Type) => boolean,
            stringify?: () => string,
            data?: ExtraData
        } = {}
    ) {
        if (getMemberType) this.getMemberType = getMemberType;
        if (getMembers) this.getMembers = getMembers;
        if (strictMatchCallback) this.strictlyMatches = strictMatchCallback;
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
        if (to.matches(Type.any)) return true;
        return this.strictlyMatches(to);
    }
}