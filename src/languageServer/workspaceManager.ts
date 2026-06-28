import { Diagnostic, URI } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import * as fs from "node:fs/promises"
import { LanguageServer } from "./languageServer.ts";
import * as path from "node:path";
import { pathToUri } from "../util/utils.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { CodeCompiler } from "../compiler/codeCompiler.ts";
import { Statement } from "../ast/statement.ts";
import { inspect } from "node:util";
import { slog, snotif } from "./logging.ts";
import { TrackedScript } from "./trackedScript.ts";
import { TrackedItemLibrary } from "./trackedItemLibrary.ts";
import chokidar, { watch } from 'chokidar';
import { fileURLToPath } from "node:url"

export class WorkspaceManager {
    documents: Map<URI, TrackedDocument> = new Map();

    combinedAST: {[uri: string]: Statement[]} = {};
    typeProcessor: TypeProcessor = new TypeProcessor();

    constructor(
        public uri: URI,
        public server: LanguageServer,
    ) {
        this.initialize();
    }

    forEachScript(callback: (script: TrackedScript) => void) {
        for (const script of this.documents.values()) {
            if (script instanceof TrackedScript) {
                callback(script);
            }
        }
    }

    forEachItemLibrary(callback: (library: TrackedItemLibrary) => void) {
        for (const library of this.documents.values()) {
            if (library instanceof TrackedItemLibrary) {
                callback(library);
            }
        }
    }

    reanalyzeTypes() {
        let ast = Object.values(this.combinedAST).flat();
        let typeProcessor = new TypeProcessor();
        this.typeProcessor = typeProcessor;
        typeProcessor.errors.length = 0;
        try {
            typeProcessor.collectionStage(ast);
            typeProcessor.evaluationStage();
        } catch (e) {
            snotif(`Internal type system error: ${inspect(e)}`)
        }
    }

    pushDiagnostics(documentUris?: URI[]) {
        let diagnosticsByUri: {[uri: string]: Diagnostic[]} = {};

        for (const e of [...this.typeProcessor.errors]) {
            let doc = this.documents.get(e.getFilePath());
            if (!doc) continue;
            if (!(doc.uri in diagnosticsByUri)) 
                diagnosticsByUri[doc.uri] = [];

            diagnosticsByUri[doc.uri].push({
                message: e.message,
                range: {
                    start: doc.indexToLinePosition(e.getStartPos()),
                    end: doc.indexToLinePosition(e.getEndPos()),
                },
            });
        }

        // push diagnostics for all new errors
        for (const uri of documentUris ?? this.documents.keys()) {
            let typeDiagnostics = diagnosticsByUri[uri];
            this.server.connection.sendNotification('textDocument/publishDiagnostics', {
                uri: uri,
                diagnostics: [...typeDiagnostics ?? [], ...(this.documents.get(uri)?.diagnostics ?? [])],
            });
        }

        // clear diagnostics for docs that had errors last time but don't anymore
        for (const [uri, doc] of this.documents.entries()) {
            if (documentUris && !(uri in documentUris)) continue;
            if (!(uri in diagnosticsByUri)) {
                this.server.connection.sendNotification('textDocument/publishDiagnostics', {
                    uri: uri,
                    diagnostics: doc.diagnostics ?? [],
                }); 
            }
        }
    }

    registerDoc(uri: string): TrackedDocument | null {
        let doc: TrackedDocument | null = null;
        if (uri.endsWith(".tc")) {
            this.combinedAST[uri] = [];
            doc = new TrackedScript(uri, this);
        }
        else if (uri.endsWith(".tcil")) {
            doc = new TrackedItemLibrary(uri, this);
        }
        if (!doc) return null;

        this.documents.set(uri, doc);
        return doc;
    }

    /** If the doc does not exist, this will do nothing */
    unregisterDoc(uri: string) {
        let doc = this.documents.get(uri);
        if (!doc) return;

        if (doc instanceof TrackedScript) {
            delete this.combinedAST[doc.uri];
        }

        this.documents.delete(uri)
    }

    async initialize() {
        // set up filesystem watcher
        const watcher = chokidar.watch(fileURLToPath(this.uri), {
            ignored: (path, stats) => !!stats?.isFile() && !(path.endsWith(".tc") || path.endsWith(".tcil")),
        });

        let docLoadPromises: Promise<void>[] = [];

        watcher
        .on("ready", async () => {
            // when all initial docs have been loaded and parsed,
            // parse them all again now that the type env is completed

            // if this isn't done, erroneous errors will be reported since
            // the first-pass parse was working on incomplete type information

            await Promise.all(docLoadPromises);
            this.reanalyzeTypes();
            for (let [uri, doc] of this.documents) {
                if (doc instanceof TrackedScript) {
                    doc.reparse();
                }
            }
        })
        .on("add", path => {
            let doc = this.registerDoc(pathToUri(path));
            if (doc && !watcher._readyEmitted && !doc.isInitialized) {
                docLoadPromises.push(doc.onInitializedPromise);
            }
        })
        .on("change", async path => {
            let uri = pathToUri(path);
            let doc = this.documents.get(uri);
            if (!doc) return; // TODO: return if doc is open in editor
            let contents = await fs.readFile(new URL(doc.uri))
            doc.update([{text: contents.toString()}], -1)
        })
        .on("unlink", path => {
            this.unregisterDoc(pathToUri(path));
        })
    }
}