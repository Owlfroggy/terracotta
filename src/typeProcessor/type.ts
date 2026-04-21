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

type ExtraData = FuncTypeData | NamespaceTypeData | ListTypeData | null;

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
                    if (!genericType.matches(Type.any)) {
                        genericAddon = `, ...${genericType}`;
                    }
                    return `[${indexTypes.join(", ")}${genericAddon}]`
                } else {
                    return `list[${genericType}]`;
                }
            }
            return new Type('list', {getMemberType, stringify, data: {genericType, indexTypes}});
        }
    );

    public static dict = new Type('dict');

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
            return new Type('namespace',{getMemberType, data: {namespace}})
        }
    );

    public readonly assignable: boolean;
    public readonly getMemberType = (m?: string | number) => Type.unknown;
    public readonly data: ExtraData

    constructor(
        public readonly name: string,
        {getMemberType, stringify, data = null}: {
            getMemberType?: (member?: string | number) => Type,
            stringify?: () => string,
            data?: ExtraData
        } = {}
    ) {
        if (getMemberType) this.getMemberType = getMemberType;
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

    matches = (other: Type | TypeConstructor<(...args: any[]) => Type>) => {
        return this.name == ((other as any).constructsType ?? other.name);
    };
}