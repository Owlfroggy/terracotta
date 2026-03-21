import { ASTNode } from "./ast/astNode.ts";
import { BinaryExpression, Expression, AtomicExpression, GroupExpression, ListExpression, MissingExpression, CallExpression, AccessExpression, ChunkExpression, VariableExpression, CallOrStartExpression, TypeExpression, TypeAssignmentExpression, ParameterExpression, MultiTypeAssignmentExpression, DictionaryEntryExpression, DictionaryExpression } from "./ast/expression.ts";
import { EventStatement, ExpressionStatement, FunctionStatement, IfStatement, ProcessStatement, RepeatStatement, ReturnStatement, SingleKeywordStatement, Statement, VariableStatement } from "./ast/statement.ts";
import { Token, TokenType } from "./ast/token.ts";
import { TCError } from "./error/error.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";

let test = `
if (1 + 2 == three.what < 1 != 0) {
    default.sendMessage("dingus");
    default.kablingus;
    line true: num = 1 == 2;
}
`;

`
global "dict of doom" = {
    /* god bless america 🔫🏈🇺🇸🦅 */
    stone: [1,2]
    "bongle dingus": [bongle, dingus],
    wood five,
    five: wood,
    unwrappedFunctionCall(): invalid
;

default.sendMessage({yhingus: 5, /** who let bro Four */ (line yingus): 4, "bhlingus": 5, (blingus()): 5, (line expression - 2): "expr!!" + 5});

playerevent join {
    saved "%uuid data" = {joinTimestamp: game.timestamp, coins: 0, achievements: []};
}
`

// `
// function yeehaw(red, message: str... = ["dingus"], "parameter with spaces!!": num = 1): any, str {
//     default.sendMessage(message, alignmentMode="Center");
//     [line result, line error] = message;
//     return red, "yinkus";
// }

// function five: str {return 5; }

// lscancel playerevent Join {
//     default.sendMessage(repeat, five());
//     default.setEquipmentItem(item("diamond_helmet"),slot="Main hand");
// }

// process gameLoop {
//     local tGameType = gameType;
//     repeat {
//         wait(waitTime);
//     }
// }
// `

// `
// 'short:\\n \\' \\" \\x40 \\u2620\\u2620 \\x40 \\nXXXXXXXXXXXXX'.length;
// sendMessage("hello world!!!!!");

// // runs wen u join
// /* balls */
// playerevent Join {
//     /* very good code right here!! */
//     global a// + saved a + local a - line a;
//     default.teleport(
//         victim.location + [0, 2, 0] /* balls */
//     );
//     allPlayers.sendMessage("ow//ie");
// }
// `

// ast visualizer
function recurse(e: ASTNode | null): string {
    const placeholder = "\x1b[0;38;5;196;49m⊘\x1b[0m";
    if (e == null) {
        return ""
    } else if (e instanceof Token) {
        if (e.type == TokenType.STRING_LITERAL || e.type == TokenType.STYLED_LITERAL) {
            let stringData = e.getStringExtraData();
            return `\x1b[0;32m${e.type == TokenType.STYLED_LITERAL ? "s" : ""}${stringData.quoteChar}\x1b[0;38;5;112;49m${e.value.replaceAll("\n","\x1b[0;34m\\n\x1b[0;38;5;112;49m")}\x1b[0;32m${stringData.quoteChar}\x1b[0m`;
        } else if (e.type == TokenType.NUMERIC_LITERAL) {
            return `\x1b[0;38;5;220;49m${e.value}\x1b[0m`;
        } else if (e.type == TokenType.MISSING) {
            return placeholder;
        } else {
            return e.value;
        }
    } else if (e instanceof AtomicExpression) {
        return recurse(e.token);
    } else if (e instanceof VariableExpression) {
        return `${e.scope.value}${e.name.type == TokenType.IDENTIFIER ? " "+e.name.value : recurse(e.name)}`;
    } else if (e instanceof TypeExpression) {
        return `\x1b[0;38;5;39;49m${e.baseType.value}\x1b[0m`
    } else if (e instanceof TypeAssignmentExpression) {
        return `: ${recurse(e.type)}`;
    } else if (e instanceof MultiTypeAssignmentExpression) {
        return `: ${e.types.map(t => recurse(t)).join(", ")}`
    } else if (e instanceof ParameterExpression) {
        return `${recurse(e.name)}${recurse(e.assignedType)}${e.plural ? "..." : ""}${e.assignmentOperator ? " = " : ""}${recurse(e.defaultValue)}`;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof ListExpression) {
        return `${e.opener.value}${e.elements.map(visualizeExpression).join(", ")}${e.opener.value == "[" ? "]" : ")"}`
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
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
    } else if (e instanceof CallExpression) {
        return `${recurse(e.callee)}${recurse(e.args)}`;
    } else if (e instanceof CallOrStartExpression) {
        return `${e.keyword.value} ${recurse(e.name)}${e.args ? recurse(e.args) : ""}`
    } else if (e instanceof AccessExpression) {
        return `${recurse(e.accessee)}${e.accessorToken.value}${e.propertyName.value}`;
    } else if (e instanceof ChunkExpression) {
        return `${e.opener.value}\n${"  "+visualizeStatements(e.statements).map(s => s.split("\n").join("\n  ")).join("\n  ")}\n${e.closer.value}`
    } else if (e instanceof MissingExpression) {
        return placeholder;
    } else if (e instanceof ExpressionStatement) {
        return `${recurse(e.expression)}`
    } else if (e instanceof VariableStatement) {
        return `\x1b[0;38;5;147;49m${recurse(e.variable)}${e.assignedType ? recurse(e.assignedType) : ""}\x1b[0m${e.operator ? " "+e.operator.value+" " : ""}${e.value ? recurse(e.value) : ""};`
    } else if (e instanceof EventStatement) {
        let modifiers = e.modifiers.length > 0 ? (e.modifiers.map(m => m.value).join(" ") + " ") : "";
        return `${modifiers}${e.type.value} ${e.eventName.value} ${recurse(e.chunk)}`
    } else if (e instanceof FunctionStatement) {
        return `function ${recurse(e.name)}${recurse(e.args)}${recurse(e.returnType)} ${recurse(e.chunk)}`
    } else if (e instanceof ProcessStatement) {
        return `process ${recurse(e.name)}${recurse(e.args)} ${recurse(e.chunk)}`
    } else if (e instanceof RepeatStatement) {
        return `repeat${e.countExpression == null ? "" : ` ${recurse(e.countExpression)}`} ${recurse(e.chunk)}`;
    } else if (e instanceof IfStatement) {
        return `if ${recurse(e.condition)} ${recurse(e.chunk)}`;
    } else if (e instanceof SingleKeywordStatement) {
        return `${e.keyword.value}${e.args ? recurse(e.args) : ""};`
    } else if (e instanceof ReturnStatement) {
        return `${e.keyword.value}${e.values.length > 0 ? " "+e.values.map(v => recurse(v)).join(", ") : ""};`
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
function visualizeStatements(statements: Statement[]) {
    return statements.map(s => {
        if (s instanceof ExpressionStatement) {
            return visualizeExpression(s.expression) + ";";
        } else {
            return recurse(s);
        }
    });
}

function visualizeErrors(errors: TCError[], script: string) {
    if (errors.length == 0) {
        console.log("-- NO ERRORS!! --")
        return;
    }
    console.log("ERROR REPORT --------------------")
    for (const e of errors) {
        let topNewlineIndex = e.startPos+1;
        let lineStartIndex = 0;
        let foundNewlines = 0;
        while (foundNewlines < 5 && topNewlineIndex >= 0) {
            topNewlineIndex--;
            if (script[topNewlineIndex] == "\n") { 
                foundNewlines++;
                if (lineStartIndex == 0) lineStartIndex = topNewlineIndex+1;
            }
        }
        let bottomNewlineIndex = e.endPos-1;
        while (script[bottomNewlineIndex] != "\n" && bottomNewlineIndex < script.length) bottomNewlineIndex++;
        console.log(script.substring(topNewlineIndex,bottomNewlineIndex));
        let caretCount = e.endPos-e.startPos;
        console.log(" ".repeat(e.startPos-lineStartIndex) + "^".repeat(caretCount))
        console.log(`${!e.shouldDisplay ? "(hidden) " : ""}error: ${e.message}`)
        console.log()
    }
    console.log("---------------------------------")
}

const lexer = new Lexer(test,{ // 27
    includeWhitespaceTokens: false,
    includeSingleLineComments: false,
});

lexer.tokenize()

const parser = new Parser(lexer.tokens);
// let expr = parser.parseExpression(0) as Expression;
parser.parse();
console.dir(parser.statements, {depth: null});
// console.log("Errors: ", parser.errors);
console.log("RECONSTRUCTION FROM AST --------------------")
console.log(visualizeStatements(parser.statements).join("\n"));
console.log("--------------------------------------------")
visualizeErrors([...parser.errors, ...lexer.errors],test)