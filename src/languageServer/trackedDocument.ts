import { Diagnostic, Position, TextDocumentContentChangeEvent, URI } from "vscode-languageserver";
import * as fs from "node:fs/promises";
import { Lexer } from "../parser/lexer.ts";
import { Parser } from "../parser/parser.ts";
import { ASTNode, RootNode } from "../ast/astNode.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { inspect } from "node:util";
import { slog, snotif } from "./logging.ts";
import { CodeCompiler } from "../compiler/codeCompiler.ts";

export class TrackedDocument {
    contents: string;

    private lexer: Lexer = new Lexer();
    private parser: Parser = new Parser(this.lexer.tokens);
    public compiler: CodeCompiler;
    private ast: RootNode;
    private lineStartIndexes: number[] = [];

    public readonly diagnostics: Diagnostic[] = [];
    public version: number = 0;

    constructor(
        public uri: URI,
        public workspace: WorkspaceManager,
    ) {
        this.initialize();
    }

    linePositionToIndex(position: Position): number {
        return this.lineStartIndexes[position.line] + position.character;
    }

    indexToLinePosition(index: number): Position {
        let left = 0
        let right = this.lineStartIndexes.length - 1
        let resultLine = 0

        while (left <= right) {
            const mid = (left + right) >> 1

            if (this.lineStartIndexes[mid] <= index) {
                resultLine = mid
                left = mid + 1
            } else {
                right = mid - 1
            }
        }

        const lineStart = this.lineStartIndexes[resultLine] ?? 0
        return {
            line: resultLine,
            character: index - lineStart
        }
    }

    // todo: make this more binary searchy?
    getAstNodeAtIndex(index: number): ASTNode {
        let node: ASTNode = this.ast;
        let whoops = 0;
        while (node.children.length > 0 && whoops < 20) {
            let oldNode = node;
            // see if any of this node's children also contain this position
            for (const c of node.children) {
                if (c.startPos <= index && index <= c.endPos) {
                    node = c;
                    break;
                }
            }
            // if not, this node is the best we can do
            if (node == oldNode) break;
        }
        return node;
    }

    refreshLineIndexes(startingAtIndex: number = 0) {
        this.lineStartIndexes.length = 1;
        this.lineStartIndexes[0] = 0;
        for (let i = startingAtIndex; i < this.contents.length; i++) {
            if (this.contents[i] == "\n") {
                this.lineStartIndexes.push(i + 1)
            }
        }
    }

    reparse() {
        try {
            this.lexer.tokenize(this.contents, this.uri);
            this.ast = this.parser.parse();
        } catch (e) {
            snotif(`Internal parser error on doc ${this.uri}: ${inspect(e)}`)
        }
        this.ast.scriptContents = "";
        this.ast.filePath = this.uri;

        // recompute types before compiling
        this.workspace.combinedAST[this.uri] = this.ast.statements;
        this.workspace.reanalyzeTypes();

        // recompile
        let compiler = new CodeCompiler(this.ast.statements, {types: this.workspace.typeProcessor, optimizationsEnabled: false});
        this.compiler = compiler;
        try {
            compiler.compile({outputFormat: 'GZIP'});
        } catch (e) {
            snotif(`Internal compiler error: ${inspect(e)}`)
        }
        
        this.diagnostics.length = 0;
        for (const error of [...this.lexer.errors, ...this.parser.errors, ...this.compiler.errors]) {
            this.diagnostics.push({
                message: error.message,
                range: {
                    start: this.indexToLinePosition(error.getStartPos()),
                    end: this.indexToLinePosition(error.getEndPos()),
                },
            })
        }

        this.workspace.pushDiagnostics();
        
        // slog(`-------------->>>>> ${this.diagnostics.length} ${this.lexer.errors.length} ${JSON.stringify(this.lineStartIndexes)} ${this.parser.errors.length}\n${visualizeStatements(this.ast.statements)}\n\n${this.contents}\n\n--------------------------`);
    }

    update(changes: (TextDocumentContentChangeEvent | {text: string})[], version: number) {
        if (this.version > version) return;
        this.version = version;

        for (const change of changes) {
            change.text = change.text.replaceAll(/\r\n/g, "\n")
            if (TextDocumentContentChangeEvent.isIncremental(change)) {
                //= update text =\\
                let startIndex = this.linePositionToIndex(change.range.start)!
                let endIndex = this.linePositionToIndex(change.range.end)!
                this.contents = this.contents.substring(0,startIndex) + change.text + this.contents.substring(endIndex);
            } else {
                this.contents = change.text
            }
            this.refreshLineIndexes();
        }
        this.reparse();
    }

    async initialize() {
        this.contents = (await fs.readFile(URL.parse(this.uri)!)).toString().replaceAll(/\r\n/g, "\n");
        this.refreshLineIndexes();
        this.reparse();
    }
}