import { TextDocumentContentChangeEvent, URI } from "vscode-languageserver";
import { WorkspaceManager } from "./workspaceManager.ts";
import { inspect } from "node:util";
import { slog} from "./logging.ts";
import { TrackedDocument } from "./trackedDocument.ts";
import { ItemLibrary } from "../compiler/itemLibrary.ts";

export class TrackedItemLibrary extends TrackedDocument {
    /** Will be null if there's an error within the item library */
    public parsedContents: ItemLibrary | null = null;

    constructor(
        public uri: URI,
        public workspace: WorkspaceManager,
    ) {
        super(uri, workspace)
    }


    reparse() {
        try {
            this.parsedContents = JSON.parse(this.contents);
        } catch (e) {
            slog(`Internal error while reprocessing item library ${this.uri}: ${inspect(e)}`);
            this.parsedContents = null;
        }
    }

    update(changes: (TextDocumentContentChangeEvent | {text: string})[], version: number) {
        super.update(changes, version);
        this.reparse();
    }

    async initialize() {
        await super.initialize();
        this.reparse();
    }
}