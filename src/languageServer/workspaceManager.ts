import { Diagnostic, URI } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import * as fs from "node:fs/promises"
import { LanguageServer, snotif} from "./languageServer.ts";
import * as path from "node:path";
import { pathToUri } from "../util/utils.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { CodeCompiler } from "../compiler/codeCompiler.ts";
import { Statement } from "../ast/statement.ts";
import { inspect } from "node:util";

export class WorkspaceManager {
    documents: Map<URI, TrackedDocument> = new Map();

    combinedAST: {[uri: string]: Statement[]} = {};
    typeProcessor: TypeProcessor = new TypeProcessor();
    compiler: CodeCompiler = new CodeCompiler([], {types: this.typeProcessor, optimizationsEnabled: true});

    constructor(
        public uri: URI,
        public server: LanguageServer,
    ) {
        this.initialize();
    }

    reanalyze() {
        let ast = Object.values(this.combinedAST).flat();

        let typeProcessor = new TypeProcessor();
        this.typeProcessor = typeProcessor;
        typeProcessor.errors.length = 0;
        typeProcessor.collectionStage(ast);
        typeProcessor.evaluationStage();

        let compiler = new CodeCompiler(ast, {types: typeProcessor, optimizationsEnabled: false});
        this.compiler = compiler;
        compiler.ast = ast;
        try {
            compiler.compile({outputFormat: 'GZIP'});
        } catch (e) {
            snotif(`Internal compiler error: ${inspect(e)}`)
        }

        let diagnosticsByUri: {[uri: string]: Diagnostic[]} = {};

        for (const e of [...compiler.errors, ...typeProcessor.errors]) {
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
                diagnostics: [...diagnostics, ...(this.documents.get(uri)?.parserDiagnostics ?? [])],
            });
        }

        // clear diagnostics for docs that had errors last time but don't anymore
        for (const [uri, doc] of this.documents.entries()) {
            if (!(uri in diagnosticsByUri)) {
                this.server.connection.sendNotification('textDocument/publishDiagnostics', {
                    uri: uri,
                    diagnostics: doc.parserDiagnostics ?? [],
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
        this.reanalyze();
    }
}