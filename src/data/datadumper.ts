import { NumberValue, StringValue, VectorValue } from "../compiler/codeValue.ts";
import { FunctionDefinition, isFunctionDefinition, isValueDefinition, ValueDefinition } from "../compiler/namespace/definition.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { DF_NBT, dfTypeToTC, tcTypeToDF } from "../df/constants.ts";
import { VERSION } from "../main.ts";
import { Type, TypeExtraData } from "../typeProcessor/type.ts";
import { CREATE_SELECTION_ACTION_LIST, DF_PAR_FIELD_TO_TC, FILTER_SELECTION_ACTION_LIST, INVERTIBLE_SELECT_ACTIONS, KEYWORDS, PARTICLE_FIELD_DEFAULTS, TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS, VALID_BLOCK_IDS, VALID_ITEM_IDS } from "./constants.ts";
import { OVERRIDES } from "./overrides.ts";

enum SerializedObjectClass {
    TYPE = "type",
    FUNCTION = "function",
    NUMBER_VALUE = "number_value",
    STRING_VALUE = "string_value",
    VECTOR_VALUE = "vector_value",
}

function serialize(obj) {
    if (obj instanceof Type) {
        return {
            __data_dump_class: SerializedObjectClass.TYPE,
            name: obj.name,
            data: obj.data
        };
    }
    else if (obj instanceof NumberValue) {
        return {
            __data_dump_class: SerializedObjectClass.NUMBER_VALUE,
            value: serialize(obj.value)
        };
    }
    else if (obj instanceof StringValue) {
        return {
            __data_dump_class: SerializedObjectClass.STRING_VALUE,
            value: serialize(obj.value)
        }
    }
    else if (obj instanceof VectorValue) {
        return {
            __data_dump_class: SerializedObjectClass.STRING_VALUE,
            x: obj.x, y: obj.y, z: obj.z
        };
    }
    else if (typeof obj == 'function') {
        return {
            __data_dump_class: SerializedObjectClass.FUNCTION,
            contents: obj.toString()
        };
    }
    else if (obj instanceof Set) {
        return [...obj.values()];
    }
    else if (Array.isArray(obj)) {
        return obj.map(serialize);
    }
    else if (obj.constructor.name == "Object") {
        let out = {};
        for (let [k, v] of Object.entries(obj)) {
            out[k] = serialize(v);
        }
        return out;
    }
    else if (
        typeof obj == "bigint"
        || typeof obj == "boolean"
        || typeof obj == "number"
        || typeof obj == "string"
    ) return obj
    
    return `!!! Serializer for ${obj.constructor?.name ?? obj} not yet implemented`
}

export function generateDataDump() {
    let event_namespace_actions = (
        Object.values(Namespace.registry.event.members)
        .filter(m => isFunctionDefinition(m) && m.action)
        .map(m => (m as FunctionDefinition).action?.name)
    );
    let event_namespace_values = (
        Object.values(Namespace.registry.event.members)
        .filter(m => isValueDefinition(m) && m.gameValue)
        .map(m => (m as ValueDefinition).gameValue?.name)
    );
    return {
        terracotta_version: VERSION,
        df_nbt: DF_NBT,
        overrides: serialize(OVERRIDES),
        type_namespace_actions: serialize(TYPE_DOMAIN_ACTIONS),
        type_namespace_conditions: serialize(TYPE_DOMAIN_CONDITIONS),
        event_namespace_actions: serialize(event_namespace_actions),
        event_namespace_values: serialize(event_namespace_values),
        create_selection_actions: serialize(CREATE_SELECTION_ACTION_LIST),
        filter_selection_actions: serialize(FILTER_SELECTION_ACTION_LIST),
        invertible_selection_actions: serialize(INVERTIBLE_SELECT_ACTIONS),
        keywords: serialize(KEYWORDS),
        namespace_names: serialize(Object.keys(Namespace.registry)),
        par_field_defaults: serialize(PARTICLE_FIELD_DEFAULTS),
        df_par_field_to_tc: serialize(DF_PAR_FIELD_TO_TC),
        df_type_to_tc: serialize(Object.fromEntries(dfTypeToTC.entries())),
        tc_type_to_df: serialize(tcTypeToDF),
        valid_item_ids: serialize(VALID_ITEM_IDS),
        valid_block_ids: serialize(VALID_BLOCK_IDS),
    }
}