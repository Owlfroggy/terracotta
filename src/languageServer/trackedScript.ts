import { Diagnostic, Position, TextDocumentContentChangeEvent, URI } from "vscode-languageserver";
import * as fs from "node:fs/promises";
import { Lexer } from "../parser/lexer.ts";
import { Parser } from "../parser/parser.ts";
import { ASTNode, RootNode } from "../ast/astNode.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { inspect } from "node:util";
import { slog, snotif } from "./logging.ts";
import { CodeCompiler } from "../compiler/codeCompiler.ts";
import { TrackedDocument } from "./trackedDocument.ts";
import { ItemLibrary } from "../compiler/itemLibrary.ts";

export class TrackedScript extends TrackedDocument {
    private lexer: Lexer = new Lexer();
    private parser: Parser = new Parser(this.lexer.tokens);
    public compiler: CodeCompiler;
    private ast: RootNode;

    constructor(
        public uri: URI,
        public workspace: WorkspaceManager,
    ) {
        super(uri, workspace)
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

    reparse() {
        try {
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
            let compiler = new CodeCompiler(this.ast.statements, {
                types: this.workspace.typeProcessor, 
                rank: this.workspace.server.configuration.dfRank,
                getItemLibraries: this.workspace.allItemLibraryDatas,
                optimizationsEnabled: false
            });
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
    
            this.workspace.pushDiagnostics([this.uri]);
        } catch (e) {
            slog(`Internal error while reprocessing doc ${this.uri}: ${inspect(e)}`);
        }
        
        // slog(`-------------->>>>> ${this.diagnostics.length} ${this.lexer.errors.length} ${JSON.stringify(this.lineStartIndexes)} ${this.parser.errors.length}\n${visualizeStatements(this.ast.statements)}\n\n${this.contents}\n\n--------------------------`);
    }

    update(changes: (TextDocumentContentChangeEvent | {text: string})[], version: number) {
        super.update(changes, version);
        this.reparse();
    }

    async initialize() {
        await super.initialize();
        this.reparse();
        this.markAsInitialized();
    }
}