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

    async initialize() {
        let files = await fs.readdir(URL.parse(this.uri)!, {recursive: true, withFileTypes: true});
        for (const f of files) {
            if (!f.isFile()) continue;
            let uri = pathToUri(path.join(f.parentPath, f.name));
            if (f.name.endsWith(".tc")) {
                this.combinedAST[uri] = [];
                this.documents.set(uri, new TrackedScript(uri, this))
            }
            else if (f.name.endsWith(".tcil")) {
                this.documents.set(uri, new TrackedItemLibrary(uri, this))
            }
        }
        this.reanalyzeTypes();
    }
}