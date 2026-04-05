import { DefinitionType, FunctionDefinition } from "../compiler/namespace/definition.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";

export type FuncTypeData = {
    definition: FunctionDefinition;
}

export type NamespaceTypeData = {
    namespace: Namespace;
}

type ExtraData = FuncTypeData | NamespaceTypeData | null;

export class Type {
    /** types that variables can store */
    public static assignableTypes: Set<string> = new Set([
        'any', 'num', 'str', 'txt', 'list', 'dict', 'item', 'loc', 'vec', 'pot', 'par', 'snd'
    ])

    public static any = new Type('any');
    public static num = new Type('num');
    public static str = new Type('str');
    public static txt = new Type('txt');
    public static list = new Type('list');
    public static dict = new Type('dict');
    public static item = new Type('item');
    public static loc = new Type('loc');
    public static vec = new Type('vec');
    public static pot = new Type('pot');
    public static par = new Type('par');
    public static snd = new Type('snd');
    public static var = new Type('var');
    public static unknown = this.any; // just in case unknown type ever needs to be separated

    public static func = (definition: FunctionDefinition) => {
        return new Type('func', {data: {definition}});
    }

    public static namespace = (namespace: Namespace) => {
        let getMemberType = (m: string | number) => {
            if (m in namespace.members) {
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

    public readonly assignable: boolean;
    public readonly getMemberType: (member: string | number) => Type
    public readonly data: ExtraData

    constructor(
        public readonly name: string,
        {getMemberType = (m) => Type.unknown, data = null}: {
            getMemberType?: (member: string | number) => Type,
            data?: ExtraData
        } = {}
    ) {
        this.getMemberType = getMemberType;
        this.data = data;
    }

    matches(other: Type) {
        return this.name == other.name;
    }
}