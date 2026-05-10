import * as util from "node:util";
import { Token, TokenType } from "../ast/token.ts";
import { VariableScope } from "../typeProcessor/typeProcessor.ts";
import { DoStatement, EventStatement, ExpressionStatement, ForStatement, FunctionStatement, IfStatement, RepeatStatement, ReturnStatement, SelectionStatement, SingleKeywordStatement, Statement, WhileStatement } from "../ast/statement.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, CallOrStartExpression, ChunkExpression, DictionaryEntryExpression, DictionaryExpression, Expression, GroupExpression, ListExpression, MissingExpression, MultiTypeAssignmentExpression, ParameterExpression, TypeAssignmentExpression, TypecastExpression, TypeExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { ASTNode } from "../ast/astNode.ts";

//=--------------------------------------=\\
//=- code that was written by a clanker -=\\
//=--------------------------------------=\\

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

export function stringDirWithoutRelations(ast) {
    return util.inspect(clean(ast), {depth: null})
}


//=------------------------------------------=\\
//=- code that was NOT written by a clanker -=\\
//=------------------------------------------=\\

// ast visualizer
/** Ansi codes that discord code blocks support */
const C = {
    BLK: "\x1b[0;30m",
    RED: "\x1b[0;31m",
    GRN: "\x1b[0;32m",
    YEL: "\x1b[0;33m",
    AQU: "\x1b[0;34m",
    PNK: "\x1b[0;35m",
    BLU: "\x1b[0;36m",
    GRY: "\x1b[0;37m",
    B: "\x1b[1m",
    U: "\x1b[4m",
    CLR: "\x1b[0m",
}
function recurse(e: ASTNode | null): string {
    const placeholder = "\x1b[0;38;5;196;49m⊘\x1b[0m";
    if (e == null) {
        return ""
    } else if (e instanceof Token) {
        if (e.type == TokenType.STRING_LITERAL || e.type == TokenType.STYLED_LITERAL) {
            let stringData = e.getStringExtraData();
            return `${C.GRN}${e.type == TokenType.STYLED_LITERAL ? "s" : ""}${stringData.quoteChar}${e.value.replaceAll("\n",`${C.BLU}\\n${C.GRN}`)}${stringData.quoteChar}${C.CLR}`;
        } else if (e.type == TokenType.NUMERIC_LITERAL) {
            return `${C.YEL}${e.value}${C.CLR}`;
        } else if (e.type == TokenType.MISSING) {
            return placeholder;
        } else {
            return e.value;
        }
    } else if (e instanceof AtomicExpression) {
        return recurse(e.token);
    } else if (e instanceof VariableExpression) {
        return `${C.PNK}${e.scope.value}${C.CLR}${e.name.type == TokenType.IDENTIFIER ? " "+e.name.value : recurse(e.name)}${e.assignedType ? recurse(e.assignedType) : ""}`;
    } else if (e instanceof TypeExpression) {
        if (e.type instanceof Token) {
            return `${C.BLU}${e.type.value}${C.CLR}${e.subType ? `[${e.subType.elements.map(e=>recurse(e)).join(", ")}]` : ""}${e.ellipses ? "..." : ""}`
        } else {
            return `${e.type ? `[${e.type.elements.map(e=>recurse(e)).join(", ")}]` : ""}${e.ellipses ? "..." : ""}`;
        }
    } else if (e instanceof TypeAssignmentExpression) {
        return `: ${recurse(e.type)}`;
    } else if (e instanceof MultiTypeAssignmentExpression) {
        return `: ${e.types.map(t => recurse(t)).join(", ")}`
    } else if (e instanceof ParameterExpression) {
        return `${recurse(e.name)}${recurse(e.assignedType)}${e.assignmentOperator ? " = " : ""}${recurse(e.defaultValue)}`;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof ListExpression) {
        return `${e.opener?.value ?? ""}${e.elements.map(visualizeExpression).join(", ")}${recurse(e.closer)}`
    } else if (e instanceof DictionaryEntryExpression) {
        let key;
        if (e.key instanceof Token || (e.key instanceof GroupExpression && e.key.expression instanceof BinaryExpression)) {
            key = recurse(e.key)
        } else {
            key = `(${recurse(e.key)})`
        }
        return `${key}${recurse(e.colon)} ${recurse(e.value)}`
    } else if (e instanceof DictionaryExpression) {
        if (e.endPos - e.startPos > 75) {
            return `{\n  ${e.entries.map(v => recurse(v)).join(",\n  ")}\n}`
        } else {
            return `{${e.entries.map(v => recurse(v)).join(", ")}}`
        }
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${C.GRY}${e.operator.value}${C.CLR} ${recurse(e.right)})`
    } else if (e instanceof TypecastExpression) {
        return `(${recurse(e.left)} as ${recurse(e.type)})`
    } else if (e instanceof UnaryPrefixExpression) {
        return `(${e.operator.value}${recurse(e.right)})`
    } else if (e instanceof CallExpression) {
        if (e.callee instanceof AtomicExpression) {
            return `${C.AQU}${e.callee.token.value}${C.CLR}${recurse(e.args)}`
        } else if (e.callee instanceof AccessExpression) {
            return `${recurse(e.callee.accessee)}.${C.AQU}${e.callee.propertyName.value}${C.CLR}${recurse(e.args)}`
        } else {
            return `${recurse(e.callee)}${recurse(e.args)}`;
        }
    } else if (e instanceof CallOrStartExpression) {
        return `${C.RED}${C.B}${e.keyword.value} ${C.AQU}${recurse(e.name)}${C.CLR}${e.args ? recurse(e.args) : ""}`
    } else if (e instanceof AccessExpression) {
        return `${recurse(e.accessee)}${e.accessorToken.value}${e.propertyName.value}`;
    } else if (e instanceof BracketedAccessExpression) {
        return `${recurse(e.accessee)}\x1b[0;38;5;105;49m${recurse(e.opener)}\x1b[0m${recurse(e.propertyName)}\x1b[0;38;5;105;49m${recurse(e.closer)}\x1b[0m`;
    } else if (e instanceof ChunkExpression) {
        return `${e.opener.value}\n${"  "+visualizeStatements(e.statements).map(s => s.split("\n").join("\n  ")).join("\n  ")}\n${e.closer.value}`
    } else if (e instanceof MissingExpression) {
        return placeholder;
    } else if (e instanceof ExpressionStatement) {
        return `${recurse(e.expression)}`
    } else if (e instanceof EventStatement) {
        let modifiers = e.modifiers.length > 0 ? (e.modifiers.map(m => m.value).join(" ") + " ") : "";
        return `${C.PNK}${C.B}${modifiers}${e.type.value}${C.AQU} ${e.eventName.value}${C.CLR} ${recurse(e.chunk)}`
    } else if (e instanceof FunctionStatement) {
        return `${C.PNK}${C.B}${TokenType[e.keyword.type].toLowerCase()} ${C.AQU}${recurse(e.name)}${C.CLR}${recurse(e.params)}${recurse(e.returnType)} ${recurse(e.chunk)}`
    } else if (e instanceof ForStatement) {
        return `${C.RED}${C.B}for${C.CLR} (${e.variableList.elements.map(v=>recurse(v)).join(", ")} ${recurse(e.variableList.closer)} ${recurse(e.iteratorExpression)}${recurse(e.closer)} ${recurse(e.chunk)}`;
    } else if (e instanceof RepeatStatement) {
        return `${C.RED}${C.B}repeat${C.CLR}${e.countExpression == null ? "" : ` ${recurse(e.countExpression)}`} ${recurse(e.chunk)}`;
    } else if (e instanceof IfStatement) {
        return `${C.RED}${C.B}if${C.CLR} ${recurse(e.condition)} ${recurse(e.chunk)} ${e.elseContents ? `else ${recurse(e.elseContents)}` : ''}`;
    } else if (e instanceof WhileStatement) {
        return `${C.RED}${C.B}while${C.CLR} ${recurse(e.condition)} ${recurse(e.chunk)}`;
    } else if (e instanceof DoStatement) {
        return `${C.RED}${C.B}do${C.CLR} ${recurse(e.chunk)} ${e.whileKeyword ? `while ${recurse(e.whileCondition)}` : ''} `;
    } else if (e instanceof SelectionStatement) {
        return `${C.RED}${C.B}${e.keyword.value}${C.CLR} ${recurse(e.name)}${recurse(e.args)};`;
    } else if (e instanceof SingleKeywordStatement) {
        return `${C.RED}${C.B}${e.keyword.value}${C.CLR}${e.args ? recurse(e.args) : ""};`
    } else if (e instanceof ReturnStatement) {
        return `${C.RED}${C.B}${e.keyword.value}${C.CLR}${e.values.length > 0 ? " "+e.values.map(v => recurse(v)).join(", ") : ""};`
    }
    return "";
}

function visualizeExpression(expr: Expression): string {
    let out = recurse(expr);
    if (expr instanceof BinaryExpression) {
        return out.substring(1,out.length-1);
    } else {
        return out;
    }
}
export function visualizeStatements(statements: Statement[]) {
    return statements.map(s => {
        if (s instanceof ExpressionStatement) {
            return visualizeExpression(s.expression) + ";";
        } else {
            return recurse(s);
        }
    });
}