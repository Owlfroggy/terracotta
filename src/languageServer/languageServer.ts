import * as rpc from "vscode-jsonrpc/node.js"
import * as AD from "../df/actiondump.ts"
import { CompletionItem, CompletionList, InitializeResult, MessageType, TextDocumentSyncKind, InitializeParams, CompletionParams, SignatureHelpParams, FileOperationRegistrationOptions, DefinitionParams, CreateFilesParams, RenameFilesParams, DeleteFilesParams, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidChangeWatchedFilesParams, URI, CompletionItemKind, SignatureInformation, SignatureHelp } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, CallExpression, ListExpression } from "../ast/expression.ts";
import { FuncTypeData, NamespaceTypeData, Type } from "../typeProcessor/type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { DefinitionType, FunctionDefinition, ValueDefinition } from "../compiler/namespace/definition.ts";
import { EnvironmentFrame, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { EventStatement } from "../ast/statement.ts";
import { HeaderType, tcEventToDf } from "../compiler/codeCompiler.ts";
import { Token, TokenType } from "../ast/token.ts";
import { getActionDocumentation, getEventDocumentation, getValueDocumentation, visualizeNodeAncestors } from "./utils.ts";
import { sign } from "node:crypto";
import { matchArgsToParams } from "../util/utils.ts";

type ServerTCConfiguration = {
    dfRank: AD.DFRank,
    rankBehavior: "crossOutInaccessible" | "hideInaccessible"
}

enum CompletionItemType {
    FUNCTION,
    VALUE,
    EVENT,
}
type CompletionItemData = {
    type: CompletionItemType.FUNCTION,
    definition: FunctionDefinition,
} | {
    type: CompletionItemType.VALUE,
    definition: ValueDefinition,
} | {
    type: CompletionItemType.EVENT,
    event: AD.Action
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
                    type: CompletionItemType.FUNCTION,
                    definition: def,
                } as CompletionItemData,
            })
        }
        else if (def.definitionType == DefinitionType.VALUE) {
            items.push({
                label: name,
                kind: CompletionItemKind.Field,
                commitCharacters: [";"],
                data: {
                    type: CompletionItemType.VALUE,
                    definition: def,
                } as CompletionItemData
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


        // TODO: handle empties
        conn.onRequest("textDocument/signatureHelp",(param: SignatureHelpParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return
            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad
            let envFrame = doc.workspace.typeProcessor.getNodeFrame(node);


            // find the function call this node is a part of, if there is one
            let callNode: ASTNode = node;
            let listFound = false;
            while (callNode.parent != null) {
                if (callNode instanceof ListExpression) listFound = true;
                // checking index < n.endPos is required otherwise placing the caret after
                // the argument list's closer would be counted as inside the list
                if (listFound && callNode instanceof CallExpression && index < callNode.endPos) {
                    break;
                }
                callNode = callNode.parent;
            }
            if (!(callNode instanceof CallExpression)) return;

            // slog("\nNode trace:");
            // slog(visualizeNodeAncestors(node));
            
            let calleeType = doc.workspace.typeProcessor.evaluateExpression(callNode.callee, envFrame);
            if (calleeType.name != "func") return;
            let definition = (calleeType.data as FuncTypeData).definition;

            let args = callNode.args.elements;
            let argTypes = args.map(a => doc.workspace.typeProcessor.evaluateExpression(a, envFrame));
            if (callNode.args.hasTrailingDelimiter) argTypes.push(Type.any);

            let activeArgIndex = 0;
            for (let i = 0; i < args.length; i++) {
                let argUpperBound = (
                    (i == args.length-1 && !callNode.args.hasTrailingDelimiter)
                    ? callNode.args.closer.startPos+1
                    : callNode.args.elementStartPositions[i+1]
                );
                if (index < argUpperBound) break;
                activeArgIndex++;
            }


            // build the signature infos
            let signatureInfos: SignatureInformation[] = []
            for (const signature of definition.signatures) {
                let info = {
                    parameters: [],
                    label: ""
                } as SignatureInformation

                let argStrings: string[] = []

                for (const arg of signature.params) {
                    let argString: string
                    // if (arg.DFType == "NONE") {
                    //     if (arg.Description.endsWith(")")) {arg.Description = arg.Description.substring(0,arg.Description.length-1)}
                    //     argString = `Empty Slot${arg.Description ? " - " + arg.Description : ""}`
                    // } else {}
                    argString = `${arg.name}: ${arg.type.name}${arg.plural ? "(s)" : ""}${arg.optional ? "*" : ""}`
                    info.parameters!.push({label: argString, documentation: arg.description})
                    argStrings.push(argString)
                }

                let tagAmount = Object.values(definition.action?.tags ?? {}).length;
                info.label = `${definition.name}(${argStrings.join(", ")})${tagAmount > 0 ? ` + ${tagAmount} tag${tagAmount > 1 ? "s" : ""}` : ""}`
                
                info.activeParameter = matchArgsToParams(argTypes, signature)[activeArgIndex] ?? argTypes.length+1;

                // always highlight the last parameter if it's something plural (e.g. the texts in SendMessage)
                if (info.activeParameter >= signature.params.length && signature.params[signature.params.length-1].plural) {
                    info.activeParameter = signature.params.length-1;
                }

                signatureInfos.push(info)
            }

            return {
                signatures: signatureInfos,
            } as SignatureHelp;
        }) 

        conn.onRequest("completionItem/resolve", (item: CompletionItem) => {
            let data = item.data as CompletionItemData;
            if (!data) { return item; }

            let documentation = "";
            if (data.type == CompletionItemType.FUNCTION) {
                if (data.definition.action) {
                    documentation = getActionDocumentation(data.definition.action);
                }
            }
            else if (data.type == CompletionItemType.EVENT) {
                documentation = getEventDocumentation(data.event);
            }
            else if (data.type == CompletionItemType.VALUE) {
                if (data.definition.gameValue) {
                    documentation = getValueDocumentation(data.definition.gameValue);
                }
            }

            item.documentation = {
                kind: "markdown",
                value: documentation
            };
            return item;
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

            // slog("\nNode trace:");
            // slog(visualizeNodeAncestors(node));

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

                for (const [tcEvent, dfEvent] of Object.entries(tcEventToDf.get(headerType) ?? {})) {
                    items.push({
                        label: tcEvent,
                        kind: CompletionItemKind.Event,
                        data: {
                            type: CompletionItemType.EVENT,
                            event: AD.actions.get(headerType)![dfEvent]
                        } as CompletionItemData
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
            doc.update([{text: param.textDocument.text}], param.textDocument.version);
            doc.workspace.reanalyze();
        })

        conn.onNotification("textDocument/didChange", (param: DidChangeTextDocumentParams) => {
            let doc = this.getDocFromUri(param.textDocument.uri)!;
            doc.update(param.contentChanges, param.textDocument.version);
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