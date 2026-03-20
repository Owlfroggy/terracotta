import { BinaryExpression, Expression, AtomicExpression, GroupExpression, ListExpression, MissingExpression, CallExpression, AccessExpression, ChunkExpression } from "./ast/expression.ts";
import { EventStatement, ExpressionStatement, Statement } from "./ast/statement.ts";
import { TCError } from "./error/error.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";

let test = 
`
playerevent Join {
    default.teleport(victim.location + [0, 2, 0]);
    allPlayers.sendMessage(owie);
    lscancel gameevent Sadness{ default * 20 + 5; }
}`;

// ast visualizer
function recurse(e: Expression | Statement): string {
    if (e instanceof AtomicExpression) {
        return e.token.value;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof ListExpression) {
        return `${e.opener.value}${e.elements.map(visualizeExpression).join(", ")}${e.opener.value == "[" ? "]" : ")"}`
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
    } else if (e instanceof CallExpression) {
        return `${recurse(e.callee)}${recurse(e.args)}`;
    } else if (e instanceof AccessExpression) {
        return `${recurse(e.accessee)}${e.accessorToken.value}${e.propertyName.value}`;
    } else if (e instanceof ChunkExpression) {
        return `${e.opener.value}\n${"  "+visualizeStatements(e.statements).map(s => s.split("\n").join("\n  ")).join("\n  ")}\n${e.closer.value}`
    } else if (e instanceof MissingExpression) {
        return `⊘`;
    } else if (e instanceof ExpressionStatement) {
        return `${recurse(e.expression)}`
    } else if (e instanceof EventStatement) {
        let modifiers = e.modifiers.length > 0 ? (e.modifiers.map(m => m.value).join(" ") + " ") : "";
        return `${modifiers}${e.type.value} ${e.eventName.value} ${recurse(e.chunk)}`
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
    includeWhitespaceTokens: false
});

lexer.tokenize()

const parser = new Parser(lexer.tokens);
// let expr = parser.parseExpression(0) as Expression;
parser.parse();
console.log(parser.statements);
// console.log("Errors: ", parser.errors);
console.log("RECONSTRUCTION FROM AST --------------------")
console.log(visualizeStatements(parser.statements).join("\n"));
console.log("--------------------------------------------")
visualizeErrors(parser.errors,test)