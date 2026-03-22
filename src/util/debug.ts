import * as util from "node:util";
import { TokenType } from "../ast/token.ts";
import { VariableScope } from "../typeChecker/typeChecker.ts";

// Properties whose numeric values should be treated as enums
const enumProps = {
    type: TokenType,
    scope: VariableScope
};

function clean(obj, seen = new WeakMap(), propName = null) {
    const colors = {
        reset: "\x1b[0m",
        boldCyan: "\x1b[36;1m",
    };

    // Replace numbers with enum names if the property matches
    if (propName && typeof obj === 'number' && enumProps[propName]) {
        const enumObj = enumProps[propName];
        for (const key in (enumObj as any)) {
            if (enumObj[key] === obj) return key;
        }
    }

    if (obj && typeof obj === "object") {
        if (seen.has(obj)) return "[Circular]";
        seen.set(obj, true);

        // Arrays
        if (Array.isArray(obj)) {
            return obj.map((v) => clean(v, seen));
        }

        // Maps
        if (obj instanceof Map) {
            const newMap = new Map();
            for (const [k, v] of obj.entries()) {
                newMap.set(clean(k, seen), clean(v, seen));
            }
            Object.defineProperty(newMap, util.inspect.custom, {
                value: function () {
                    return `${colors.boldCyan}Map${colors.reset} ${util.inspect([...newMap], { depth: null, colors: true })}`;
                },
                enumerable: false
            });
            return newMap;
        }

        // Sets
        if (obj instanceof Set) {
            return new Set(Array.from(obj, v => clean(v, seen)));
        }

        // Plain objects / custom classes
        const copy = {};
        for (const key in obj) {
            if (key === "parent" || key === "children") continue;
            copy[key] = clean(obj[key], seen, key as any);
        }

        // Custom inspect: only show type name if not plain Object
        Object.defineProperty(copy, util.inspect.custom, {
            value: function () {
                const typeName = obj.constructor && obj.constructor.name !== "Object" ? obj.constructor.name : null;
                const cloneForInspect = {};
                for (const k in copy) cloneForInspect[k] = copy[k];
                return typeName
                    ? `${colors.boldCyan}${typeName}${colors.reset} ${util.inspect(cloneForInspect, { depth: null, colors: true })}`
                    : util.inspect(cloneForInspect, { depth: null, colors: true });
            },
            enumerable: false
        });

        return copy;
    }

    // primitives
    return obj;
}


/** console.dir but it doesn't include parent and child properties */
export function dirWithoutRelations(ast) {
    console.dir(clean(ast), {depth: null})
}