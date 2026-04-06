import * as rpc from "vscode-jsonrpc/node.js"
import * as AD from "../df/actiondump.ts"
import { CompletionItem, CompletionList, InitializeResult, MessageType, TextDocumentSyncKind, InitializeParams, CompletionParams, SignatureHelpParams, FileOperationRegistrationOptions, DefinitionParams, CreateFilesParams, RenameFilesParams, DeleteFilesParams, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidChangeWatchedFilesParams, URI, CompletionItemKind } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression } from "../ast/expression.ts";
import { access } from "node:fs";
import { NamespaceTypeData, Type } from "../typeProcessor/type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { DefinitionType } from "../compiler/namespace/definition.ts";
import { EnvironmentFrame, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { EventStatement } from "../ast/statement.ts";
import { HeaderType, tcEventToDf } from "../compiler/codeCompiler.ts";
import { Token, TokenType } from "../ast/token.ts";

type ServerTCConfiguration = {
    dfRank: AD.DFRank,
    rankBehavior: "crossOutInaccessible" | "hideInaccessible"
}

//function that other things can call to log to the language server output when debugging
export let slog = (...data: any[]) => {}
export let snotif = (message: string, type: MessageType = MessageType.Info) => {}

function generateNamespaceMemberCompletions(namespace: Namespace): CompletionItem[] {
    let items: CompletionItem[] = [];
    for (let [name, def] of Object.entries(namespace.members)) {
        if (def.definitionType == DefinitionType.FUNCTION) {
            // let isUnusable = !AD.RankCheck(tcConfig.dfRank,action?.RequiresRank!)
            // if (isUnusable && tcConfig.rankBehavior == "hideInaccessible") { return }
            items.push({
                label: name,
                kind: CompletionItemKind.Method,
                commitCharacters: ["("],
                data: {
                    // type: CompletionItemType.DomainAction,
                    // domainId: domain.Identifier,
                    // memberId: action?.TCId,
                },
            })
        }
        else if (def.definitionType == DefinitionType.VALUE) {
            items.push({
                label: name,
                kind: CompletionItemKind.Field,
                commitCharacters: [";"],
                data: {
                    // type: CompletionItemType.DomainValue,
                    // domainId: domain.Identifier,
                    // memberId: value?.TCId
                }
            })
        }
    }
    return items;
}

const keywordCompletions: CompletionItem[] = [
    "lscancel", "playerevent", "entityevent", "gameevent", "function", "process",
    "call", "start",
    "return", "break", "continue", "endthread", "endallthreads", "wait",
    "global", "saved", "local", "line",
    "for", "repeat", "if", "else", "while", "do",
    "as", "to", "in", "on",
    "select", "filter",
].map(kw => ({
    label: kw,
    kind: CompletionItemKind.Keyword
}));


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
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return

            let items: (CompletionItem | CompletionItem[])[] = [];

            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad
            let envFrame = doc.workspace.typeProcessor.getNodeFrame(node);

            function visualizeNodeAncestors(node: ASTNode, prev: ASTNode | null = null): string {
                // if (node.parent == null) 
                let cString = node.children.map(c => `\n    ${c == prev ? "> " : ""}${c.keyInParent}  ${c}`).join("")
                let thisNodeString = `${node.keyInParent} ${node}${cString}\n`;
                return (node.parent == null ? "" : visualizeNodeAncestors(node.parent, node)) + thisNodeString;
            }
            slog("\nNode trace:");
            slog(visualizeNodeAncestors(node));

            let includeGenerics = true;

            //=--------------------------=\\
            //=- context specific stuff -=\\
            //=--------------------------=\\

            if (node.parent instanceof AccessExpression && (node.keyInParent == "accessorToken" || node.keyInParent == "propertyName")) {
                let accesseeType = doc.workspace.typeProcessor.evaluateExpression(node.parent.accessee, envFrame);
                if (accesseeType.name == "namespace") {
                    let namespace = (accesseeType.data as NamespaceTypeData).namespace;
                    items = generateNamespaceMemberCompletions(namespace);
                    includeGenerics = false;
                }
            }
            // event names
            else if (
                (node instanceof EventStatement && index > node.type.endPos && index < node.chunk.startPos)
                || (node.parent instanceof EventStatement && node.keyInParent == "eventName")
            ) {
                let s = node instanceof EventStatement ? node : node.parent as EventStatement;
                let headerType: HeaderType = AD.DFCodeblockName[TokenType[s.type.type]];

                for (const event of Object.keys(tcEventToDf.get(headerType) ?? {})) {
                    items.push({
                        label: event,
                        kind: CompletionItemKind.Event
                    });
                }

                includeGenerics = false;
            }
            else if (node instanceof Token && (node.type == TokenType.STRING_LITERAL || node.type == TokenType.STYLED_LITERAL || node.type == TokenType.NUMERIC_LITERAL)) {
                includeGenerics = false;
            }

            //=-----------------=\\
            //=- generic stuff -=\\
            //=-----------------=\\
            if (includeGenerics) {
                // namespaces
                for (const id of Object.keys(Namespace.registry)) {
                    items.push({
                        label: id,
                        kind: CompletionItemKind.Module,
                        commitCharacters: ["."],
                    });
                }
                // keywords
                items.push(...keywordCompletions);

                //=- variables -=\\

                // collect variable data
                let seenVars: Map<string, Map<VariableScope, Type>> = new Map();
                let varFrame: EnvironmentFrame | null = envFrame;

                while (varFrame != null) {
                    for (const scopeLayer of varFrame.variables.values()) {
                        for (const varLayer of scopeLayer.values()) {
                            for (const variable of varLayer) {
                                let entries = seenVars.getOrInsert(variable.id.name, new Map());
                                if (entries.has(variable.id.scope)) continue;
                                entries.set(variable.id.scope, variable.type ?? Type.unknown);
                            }
                        }
                    }
                    varFrame = varFrame.parent;
                }

                // turn variable data into items
                for (const [name, scopeLayer] of seenVars.entries()) {
                    for (const [scope, type] of scopeLayer.entries()) {
                        let scopeStr = VariableScope[scope].toLowerCase();
                        let stringifiedName = name;
                        if (!/^[A-Za-z0-9_]+$/.test(stringifiedName)) {
                            stringifiedName = '"' + name.replace('\\','\\\\').replace('"', '\\"').replace('\n','\\n') + '"';
                        }
                        let multipleVars = (scopeLayer.size > 1 && scope != Math.max(...scopeLayer.keys()));
                        if (!multipleVars && stringifiedName == name) {
                            items.push({
                                label: name,
                                documentation: {
                                    kind: 'markdown', 
                                    value: `\`\`\`tc\n${scopeStr} ${name}: ${type.name}\n\`\`\``
                                },
                                kind: CompletionItemKind.Variable,
                            });
                        } else {
                            items.push({
                                label: multipleVars ? `${name} (${scopeStr})` : name,
                                documentation: {
                                    kind: 'markdown', 
                                    value: `\`\`\`tc\n${scopeStr} ${name}: ${type.name}\n\`\`\``
                                },
                                insertText: `${scopeStr} ${stringifiedName}`,
                                filterText: name,
                                kind: CompletionItemKind.Variable,
                            });
                        }
                    }
                }
            }

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
            let doc = this.getDocFromUri(param.textDocument.uri)!;
            doc.update([{text: param.textDocument.text}]);
            doc.workspace.reanalyze();
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