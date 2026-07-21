import { Diagnostic, Position, TextDocumentContentChangeEvent, URI } from "vscode-languageserver";
import * as fs from "node:fs/promises";
import { Lexer } from "../parser/lexer.ts";
import { Parser } from "../parser/parser.ts";
import { ASTNode, RootNode } from "../ast/astNode.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { inspect } from "node:util";
import { slog, snotif } from "./logging.ts";
import { CodeCompiler } from "../compiler/codeCompiler.ts";
import { normalizeLineEndings } from "../util/utils.ts";

export abstract class TrackedDocument {
    contents: string;
    
    private lineStartIndexes: number[] = [];
    public readonly diagnostics: Diagnostic[] = [];
    public version: number = 0;
    public isOpen: boolean = false;

    public isInitialized: boolean = false;
    protected markAsInitialized: (value: void) => void;
    public onInitializedPromise = new Promise<void>((resolve) => {
        this.markAsInitialized = () => {
            this.isInitialized = true;
            resolve();
        }
    });

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

    refreshLineIndexes(startingAtIndex: number = 0) {
        this.lineStartIndexes.length = 1;
        this.lineStartIndexes[0] = 0;
        for (let i = startingAtIndex; i < this.contents.length; i++) {
            if (this.contents[i] == "\n") {
                this.lineStartIndexes.push(i + 1)
            }
        }
    }

    /**
     * @param version pass -1 to update regardless of version
     */
    update(changes: (TextDocumentContentChangeEvent | {text: string})[], version: number) {
        if (version != -1) {
            if (this.version > version) return;
            this.version = version;
        }

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
    }

    /**
     * This function will be called whenever the document is removed from a WorkspaceManager
     */
    cleanup() {}

    /**
     * NOTE: classes implementing TrackedDocument MUST call `this.markAsInitialized();` at the end of this method
     */
    async initialize() {
        this.contents = normalizeLineEndings((await fs.readFile(URL.parse(this.uri)!)).toString());
        this.refreshLineIndexes();
    }
}