import { ASTNode } from "./ast/astNode.ts";
import { BinaryExpression, Expression, AtomicExpression, GroupExpression, ListExpression, MissingExpression, CallExpression, AccessExpression, ChunkExpression, VariableExpression, CallOrStartExpression } from "./ast/expression.ts";
import { EventStatement, ExpressionStatement, RepeatStatement, ReturnStatement, SingleKeywordStatement, Statement, VariableStatement } from "./ast/statement.ts";
import { Token, TokenType } from "./ast/token.ts";
import { TCError } from "./error/error.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";

let test = 
`
/* this can be a description! */
line dingus;
global bongus = ;
saved klingus = 22;
klingus = 10;

`
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
function recurse(e: ASTNode): string {
    if (e instanceof Token) {
        if (e.type == TokenType.STRING_LITERAL) {
            let stringData = e.getStringExtraData();
            return `\x1b[0;32m${stringData.quoteChar}\x1b[0;38;5;112;49m${e.value.replaceAll("\n","\x1b[0;34m\\n\x1b[0;38;5;112;49m")}\x1b[0;32m${stringData.quoteChar}\x1b[0m`
        } else {
            return e.value;
        }
    } else if (e instanceof AtomicExpression) {
        return recurse(e.token);
    } else if (e instanceof VariableExpression) {
        return `${e.scope.value}${e.name.type == TokenType.IDENTIFIER ? " "+e.name.value : recurse(e.name)}`;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof ListExpression) {
        return `${e.opener.value}${e.elements.map(visualizeExpression).join(", ")}${e.opener.value == "[" ? "]" : ")"}`
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
        return `⊘`;
    } else if (e instanceof ExpressionStatement) {
        return `${recurse(e.expression)}`
    } else if (e instanceof VariableStatement) {
        return `\x1b[0;38;5;11;49m${recurse(e.variable)}\x1b[0m${e.operator ? " "+e.operator.value+" " : ""}${e.value ? recurse(e.value) : ""};`
    } else if (e instanceof EventStatement) {
        let modifiers = e.modifiers.length > 0 ? (e.modifiers.map(m => m.value).join(" ") + " ") : "";
        return `${modifiers}${e.type.value} ${e.eventName.value} ${recurse(e.chunk)}`
    } else if (e instanceof RepeatStatement) {
        return `repeat${e.countExpression == null ? "" : ` ${recurse(e.countExpression)}`} ${recurse(e.chunk)}`;
    } else if (e instanceof SingleKeywordStatement) {
        return `${e.keyword.value}${e.args ? recurse(e.args) : ""};`
    } else if (e instanceof ReturnStatement) {
        return `${e.keyword.value}${e.value ? " "+recurse(e.value) : ""};`
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