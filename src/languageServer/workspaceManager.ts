import { URI } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import * as fs from "node:fs/promises"
import { slog, snotif } from "./languageServer.ts";
import * as path from "node:path";
import { pathToUri } from "../util/utils.ts";

export class WorkspaceManager {
    documents: Map<URI, TrackedDocument> = new Map();

    constructor(
        public uri: URI
    ) {
        this.initialize();
    }

    async initialize() {
        let files = await fs.readdir(URL.parse(this.uri)!, {recursive: true, withFileTypes: true});
        for (const f of files) {
            if (!f.isFile()) continue;
            if (!f.name.endsWith(".tc")) continue;
            let uri = pathToUri(path.join(f.parentPath, f.name));

            this.documents.set(uri, new TrackedDocument(uri))
        }
    }
}