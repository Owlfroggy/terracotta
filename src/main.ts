import { BinaryExpression, Expression, AtomicExpression, GroupExpression } from "./ast/expression.ts";
import { ExpressionStatement, Statement } from "./ast/statement.ts";
import { TCError } from "./error/error.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";

// thanks chatgpt
let test = 
`3 +; dingus
4 dongus;`

// ast visualizer
function recurse(e: Expression): string {
    if (e instanceof AtomicExpression) {
        return e.token.value;
    } else if (e instanceof GroupExpression) {
        return recurse(e.expression);
    } else if (e instanceof BinaryExpression) {
        return `(${recurse(e.left)} ${e.operator.value} ${recurse(e.right)})`
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
function visualizeAST(statements: Statement[]) {
    return statements.map(s => {
        if (s instanceof ExpressionStatement) {
            return visualizeExpression(s.expression);
        }
    }).join(";\n")+";";
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
console.log(visualizeAST(parser.statements));
visualizeErrors(parser.errors,test)