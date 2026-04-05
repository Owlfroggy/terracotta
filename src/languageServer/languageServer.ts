import * as rpc from "vscode-jsonrpc/node.js"
import * as AD from "../df/actiondump.ts"
import { CompletionItem, CompletionList, InitializeResult, MessageType, TextDocumentSyncKind, InitializeParams, CompletionParams, SignatureHelpParams, FileOperationRegistrationOptions, DefinitionParams, CreateFilesParams, RenameFilesParams, DeleteFilesParams, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidChangeWatchedFilesParams, URI } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import { WorkspaceManager } from "./workspaceManager.ts";

type ServerTCConfiguration = {
    dfRank: AD.DFRank,
    rankBehavior: "crossOutInaccessible" | "hideInaccessible"
}

//function that other things can call to log to the language server output when debugging
export let slog = (...data: any[]) => {}
export let snotif = (message: string, type: MessageType = MessageType.Info) => {}


export class LanguageServer {
    connection: rpc.MessageConnection;
    workspaces: Map<URI, WorkspaceManager> = new Map();

    constructor() {
        //==========[ setup ]=========\\

        let conn = rpc.createMessageConnection(
            new rpc.StreamMessageReader(process.stdin),
            new rpc.StreamMessageWriter(process.stdout)
        );
        this.connection = conn;
        conn.listen()

        let configuration: ServerTCConfiguration = {
            dfRank: AD.DFRank.OVERLORD,
            rankBehavior: "crossOutInaccessible"
        }
        
        slog = this.log
        snotif = this.showText
        
        //==========[ request handling ]=========\\

        conn.onRequest("initialize", (param: InitializeParams) => {
            let yesIWouldLikeToKnowAboutThat = {
                filters: [
                    { pattern: {"glob": "**/*.{tcil,tc}"} },
                ]
            } as FileOperationRegistrationOptions

            let response: InitializeResult = {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    //workspace folders
                    workspace: {
                        workspaceFolders: {
                            supported: true,
                            changeNotifications: false
                        },
                        fileOperations: {
                            didCreate: yesIWouldLikeToKnowAboutThat,
                            willRename: yesIWouldLikeToKnowAboutThat,
                            didDelete: yesIWouldLikeToKnowAboutThat,
                        }
                    },
                    definitionProvider: true,
                    //completion
                    completionProvider: {
                        resolveProvider: true,
                        triggerCharacters: [".","?",'"',"'"],
                        completionItem: {
                            labelDetailsSupport: true
                        }
                    },
                    //function signature
                    signatureHelpProvider: {
                        triggerCharacters: [",","("],
                    },
                }
            }

            if (param.workspaceFolders != null) {
                for (const w of param.workspaceFolders) {
                    this.workspaces.set(w.uri, new WorkspaceManager(w.uri, this))
                }
            }

            return response
        })

        conn.onRequest("textDocument/definition",(param: DefinitionParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) {return}
            
        })

        conn.onRequest("textDocument/signatureHelp",(param: SignatureHelpParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) {return}
            
        }) 

        conn.onRequest("completionItem/resolve", (item: CompletionItem) => {
            if (!item.data) { return item }

            item.documentation = {
                kind: "markdown",
                value: "documentation"
            }
            return item
        })

        conn.onRequest("textDocument/completion", async (param: CompletionParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) {return}

            let items: (CompletionItem | CompletionItem[])[] = [
                {label: "dingus"}
            ];

            slog ("Returned",items.length,"items")
            let response: CompletionList = {
                isIncomplete: true,
                items: items as CompletionItem[]
            }

            return response
        })

        //==========[ document handling ]=========\\

        conn.onNotification("workspace/didCreateFiles",(param: CreateFilesParams) => {
            
        })
        
        conn.onRequest("workspace/willRenameFiles",(param: RenameFilesParams) => {
            
        })
        
        conn.onNotification("workspace/didDeleteFiles",(param:DeleteFilesParams) => {

        })
        
        conn.onNotification("textDocument/didOpen",(param: DidOpenTextDocumentParams) => {
            this.getDocFromUri(param.textDocument.uri)!.update([{text: param.textDocument.text}]);
        })

        conn.onNotification("textDocument/didChange", (param: DidChangeTextDocumentParams) => {
            let doc = this.getDocFromUri(param.textDocument.uri)!;
            doc.update(param.contentChanges);
            doc.workspace.reanalyze();
        })

        conn.onNotification("textDocument/didClose", (param: DidCloseTextDocumentParams) => {
            
        })

        conn.onNotification("workspace/didChangeWatchedFiles", async (param: DidChangeWatchedFilesParams) => {
            
        })

        //==========[ notification handling ]=========\\

        conn.onNotification("initialized",(param) => {
            this.showText("Terracotta language server successfully started!")
            this.log("Terracotta language server successfully started!")
            conn.sendNotification("loaded",{});
        })

        conn.onNotification("terracotta/updateConfiguration", (param: ServerTCConfiguration) => {
            for (const [k, v] of Object.entries(param)) {
                configuration[k] = v
            }
        })

        conn.onNotification("terracotta/exit", param => {
            process.exit(0)
        })
    }

    showText = (message: string, messageType: MessageType = MessageType.Info) => {
        this.connection.sendNotification("window/showMessage",{message: message.toString(),type: messageType})
    }

    log = (...message: string[]) => {
        this.connection.sendNotification("window/logMessage",{message: message.join(" "), type: MessageType.Log})
    }

    // todo: make this less bad
    getDocFromUri(uri: URI): TrackedDocument | null {
        for (const w of this.workspaces.values()) {
            for (const doc of w.documents.values()) {
                if (doc.uri == uri) {
                    return doc;
                }
            }
        }
        return null;
    }
}