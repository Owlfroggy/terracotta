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
import { snotif } from "./logging.ts";

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

    pushDiagnostics() {
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
        for (const [uri, diagnostics] of Object.entries(diagnosticsByUri)) {
            this.server.connection.sendNotification('textDocument/publishDiagnostics', {
                uri: uri,
                diagnostics: [...diagnostics, ...(this.documents.get(uri)?.diagnostics ?? [])],
            });
        }

        // clear diagnostics for docs that had errors last time but don't anymore
        for (const [uri, doc] of this.documents.entries()) {
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
            if (!f.name.endsWith(".tc")) continue;
            let uri = pathToUri(path.join(f.parentPath, f.name));

            this.combinedAST[uri] = [];
            this.documents.set(uri, new TrackedDocument(uri, this))
        }
        this.reanalyzeTypes();
    }
}