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