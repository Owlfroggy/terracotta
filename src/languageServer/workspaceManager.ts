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
import { walk } from "jsr:@std/fs/walk";
import { fileURLToPath } from "node:url"
import { ItemLibrary } from "../compiler/itemLibrary.ts";
import { RootNode } from "../ast/astNode.ts";

export class WorkspaceManager {
    documents: Map<URI, TrackedDocument> = new Map();

    combinedAST: {[uri: string]: RootNode[]} = {};
    typeProcessor: TypeProcessor = new TypeProcessor();

    isInitialized: boolean = false;

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

    // this needs to be an arrow function so it doesn't lose what its `this` points to
    /** NOTE: if there are multiple libraries with the same id, this will only return one */
    allItemLibraryDatas = () => {
        let libraries: {[id: string]: ItemLibrary} = {};
        this.forEachItemLibrary(lib => {
            if (!lib.parsedContents) return;
            libraries[lib.parsedContents.id] = lib.parsedContents;
        })
        return libraries;
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

        doc.cleanup();

        this.documents.delete(uri)
    }

    async initialize() {
        let workspacePath = fileURLToPath(this.uri);

        // load existing files
        let docInitializePromises: Promise<void>[] = [];
        for await (const entry of walk(workspacePath,{exts: ["tc","tcil"], includeDirs: false})) {
            let doc = this.registerDoc(pathToUri(entry.path));
            if (!doc) return;
            docInitializePromises.push(doc.onInitializedPromise)
        }

        // wait for files to finish reading their contents and parsing
        await Promise.all(docInitializePromises);
        this.isInitialized = true;

        // analyze files
        this.reanalyzeTypes();
        for (let [uri, doc] of this.documents) {
            if (doc instanceof TrackedScript) {
                doc.reparse();
            }
        }


        // watch for changes
        const watcher = Deno.watchFs(workspacePath, {recursive: true});
        for await (const event of watcher) {
            switch (event.kind) {
                case "create": {
                    for (const p of event.paths)
                        this.registerDoc(pathToUri(p))
                    break;
                }
                case "modify": {
                    for (const p of event.paths) {
                        let uri = pathToUri(p);
                        let doc = this.documents.get(uri);
                        // ignore events if the doc is open since the lsp is handling the editing
                        if (!doc || doc.isOpen) continue;
                        let contents = await fs.readFile(new URL(doc.uri));
                        doc.update([{text: contents.toString()}], -1);
                    }
                    break;
                }
                case "rename": {
                    // w code right here
                    if (event.paths.length == 2) {
                        this.unregisterDoc(pathToUri(event.paths[0]));
                        this.registerDoc(pathToUri(event.paths[1]));
                    } else {
                        if (event.paths[0].startsWith(workspacePath)) {
                            this.registerDoc(pathToUri(event.paths[0]));
                        } else {
                            this.unregisterDoc(pathToUri(event.paths[0]));
                        }
                    }
                    break;
                }
                case "remove": {
                    for (const p of event.paths)
                        this.unregisterDoc(pathToUri(p));
                    break;
                }
            }
        }
    }
}