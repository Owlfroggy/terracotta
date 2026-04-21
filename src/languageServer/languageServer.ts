import * as rpc from "vscode-jsonrpc/node.js"
import * as AD from "../df/actiondump.ts"
import { CompletionItem, CompletionList, InitializeResult, MessageType, TextDocumentSyncKind, InitializeParams, CompletionParams, SignatureHelpParams, FileOperationRegistrationOptions, DefinitionParams, CreateFilesParams, RenameFilesParams, DeleteFilesParams, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidChangeWatchedFilesParams, URI, CompletionItemKind, SignatureInformation, SignatureHelp, MarkupContent, HoverParams, Hover } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, CallExpression, ListExpression, TypeAssignmentExpression, TypeExpression, VariableExpression } from "../ast/expression.ts";
import { FuncTypeData, NamespaceTypeData, Type } from "../typeProcessor/type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { DefinitionType, FunctionDefinition, ValueDefinition } from "../compiler/namespace/definition.ts";
import { EnvironmentFrame, TypeProcessor, VariableId, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { EventStatement } from "../ast/statement.ts";
import { HeaderType, tcEventToDf } from "../compiler/codeCompiler.ts";
import { StringExtraData, Token, TokenType } from "../ast/token.ts";
import { getActionDocumentation, getEventDocumentation, getValueDocumentation, visualizeNodeAncestors } from "./utils.ts";
import { matchArgsToParams, valueToTCString } from "../util/utils.ts";
import { DFCodeblockName, DFRank } from "../df/constants.ts";
import { OVERRIDES } from "../data/overrides.ts";

type ServerTCConfiguration = {
    dfRank: DFRank,
    rankBehavior: "crossOutInaccessible" | "hideInaccessible"
}

enum CompletionItemType {
    FUNCTION,
    VALUE,
    EVENT,
    TAG_NAME,
    TAG_OPTION,
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
} | {
    type: CompletionItemType.TAG_NAME,
    tag: AD.Tag,
} | {
    type: CompletionItemType.TAG_OPTION,
    tag: AD.Tag,
    option: string,
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
                kind: (def as any).compileIf ? CompletionItemKind.Property : CompletionItemKind.Method,
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

function generateVariableCompletions(envFrame: EnvironmentFrame, options: {explicitScope?: VariableScope, replaceString?: Token, doc?: TrackedDocument, excludeName?: string} = {}): CompletionItem[] {
    if (options.replaceString != undefined && options.doc == undefined) throw new Error("options.doc must be provided if options.replaceString is present");
    let items: CompletionItem[] = [];
    // collect variable data
    let seenVars: Map<string, Map<VariableScope, Type>> = new Map();
    let varFrame: EnvironmentFrame | null = envFrame;

    while (varFrame != null) {
        for (const scopeLayer of varFrame.variables.values()) {
            for (const [scope, varLayer] of scopeLayer.entries()) {
                if (options.explicitScope !== undefined && scope != options.explicitScope) continue;
                for (const variable of varLayer) {
                    if (options.excludeName !== undefined && variable.id.name == options.excludeName) continue;
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
            if (!/^[A-Za-z0-9_]+$/.test(stringifiedName) || options.replaceString) {
                stringifiedName = valueToTCString(name, options.replaceString?.getStringExtraData().quoteChar ?? '"');
            }
            let multipleVars = (scopeLayer.size > 1 && scope != Math.max(...scopeLayer.keys()));
            let documentation: MarkupContent = {
                kind: 'markdown', 
                value: `\`\`\`tc\n${scopeStr} ${stringifiedName}: ${type}\n\`\`\``
            };
            if (!multipleVars && stringifiedName == name) {
                items.push({
                    label: name,
                    documentation: documentation,
                    kind: CompletionItemKind.Variable,
                });
            } else if (options.replaceString && options.doc) {
                items.push({
                    label: name,
                    documentation: documentation,
                    kind: CompletionItemKind.Variable,
                    textEdit: {
                        range: {
                            start: options.doc.indexToLinePosition(options.replaceString.startPos), 
                            end: options.doc.indexToLinePosition(options.replaceString.endPos),
                            // start: param.position,
                            // end: param.position,
                        },
                        newText: stringifiedName,
                    },
                    filterText: stringifiedName,
                })
            } else {
                items.push({
                    label: multipleVars ? `${name} (${scopeStr})` : name,
                    documentation: documentation,
                    insertText: `${options.explicitScope ? '' : scopeStr+" "}${stringifiedName}`,
                    filterText: name,
                    kind: CompletionItemKind.Variable,
                });
            }
        }
    }
    return items;
}

const typeNameCompletions: CompletionItem[] = Object.entries(Type).map(([k, v]) => {
    if (!(v instanceof Type || v.constructsType)) return null;
    if (!Type.assignableTypes.has(k)) return null;
    return k
}).filter(v => v != null).map(n => ({
    label: n,
    kind: CompletionItemKind.TypeParameter
}))

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

function getNearestCallNode(node: ASTNode, typeProcessor: TypeProcessor, envFrame: EnvironmentFrame, index: number): [callNode: CallExpression, definition: FunctionDefinition] | [null, null] {
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
    if (!(callNode instanceof CallExpression)) return [null, null];
    
    let calleeType = typeProcessor.evaluateExpression(callNode.callee, envFrame);
    let definition: FunctionDefinition | null = null;
    if (calleeType.name == "func") {
        definition = (calleeType.data as FuncTypeData).definition
    } else if (calleeType.name == "namespace") {
        definition = (calleeType.data as NamespaceTypeData).namespace.nameFunction ?? null;
    }
    if (!definition) return [null, null];
    return [callNode, definition];
}

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
            dfRank: DFRank.OVERLORD,
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
                    textDocumentSync: TextDocumentSyncKind.Full,
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
                    hoverProvider: true,
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

        conn.onRequest("textDocument/hover", (param: HoverParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return;
            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad
            let envFrame = doc.workspace.typeProcessor.getNodeFrame(node);

            // TODO: abstract documentation generation into its own function
            // and just hook into that

            // show variable type on hover
            if (node instanceof Token && node.type == TokenType.IDENTIFIER) {
                let queryVarId: string | VariableId = node.value;
                let queryPosition = node.endPos;
                if (node.parent instanceof VariableExpression) {
                    // if the scope is specified here, use that when looking up the var
                    queryVarId = VariableId.get(VariableScope[TokenType[node.parent.scope.type]], node.value);

                    // if this variable is being assigned to something, query after the assignment has been completed
                    if (node.parent.parent instanceof BinaryExpression && node.parent.parent.operator.type == TokenType.EQUALS ){ 
                        queryPosition = node.parent.parent.endPos+1;
                    }
                }

                let varEntry = envFrame.getVariableEntry(queryVarId, queryPosition);
                if (!varEntry) return;

                let name = node.value;
                let scopeStr = VariableScope[varEntry.id.scope].toLowerCase();
                let stringifiedName = name;
                if (!/^[A-Za-z0-9_]+$/.test(stringifiedName)) {
                    stringifiedName = valueToTCString(name, '"');
                }
                let documentation: MarkupContent = {
                    kind: 'markdown', 
                    value: `\`\`\`tc\n${scopeStr} ${stringifiedName}: ${varEntry.type}\n\`\`\``
                };
                return {contents: documentation, range: {
                    start: doc.indexToLinePosition(node.startPos),
                    end: doc.indexToLinePosition(node.endPos),
                }} as Hover
            }
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


            let [callNode, definition] = getNearestCallNode(node, doc.workspace.typeProcessor, envFrame, index);
            if (callNode == null || definition == null) return;

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
            let bestFitIndex = 0;
            let bestFitStrength = 0;
            for (let sigIndex = 0; sigIndex < definition.signatures.length; sigIndex++) {
                const signature = definition.signatures[sigIndex];
                let info = {
                    parameters: [],
                    label: ""
                } as SignatureInformation

                let paramStrings: string[] = []

                for (const param of signature.params) {
                    let paramString: string
                    paramString = `${param.name}: ${param.type.name}${param.plural ? "(s)" : ""}${param.optional ? "*" : ""}`
                    info.parameters!.push({label: paramString, documentation: param.description})
                    paramStrings.push(paramString)
                }

                let tagAmount = Object.values(definition.action?.tags ?? {}).length;
                let tagString = tagAmount > 0 ? ` + ${tagAmount} tag${tagAmount > 1 ? "s" : ""}` : "";
                info.label = `${definition.name}(${paramStrings.join(", ")})${tagString}`
                
                info.parameters?.push({label: tagString});

                let argsToParams = matchArgsToParams(args,argTypes, signature);
                info.activeParameter = argsToParams[activeArgIndex] ?? argTypes.length;

                // highlight tags string if this arg is a tag
                if (info.activeParameter == -1) {
                    info.activeParameter = info.parameters!.length-1;
                }
                // always highlight the last parameter if it's something plural (e.g. the texts in SendMessage)
                else if (info.activeParameter >= signature.params.length && signature.params[signature.params.length-1].plural) {
                    info.activeParameter = signature.params.length-1;
                }
                // if the argument is beyond the parameter list, by default it will land at the extra param for tags
                // therefore it needs to be bumped up one to display properly
                else if (info.activeParameter == signature.params.length) {
                    info.activeParameter++;
                }

                // score how many arguments are correct to figure out which signature should be shown
                let strength = 0;
                for (let argIndex = 0; argIndex < argsToParams.length; argIndex++) {
                    let paramIndex = argsToParams[argIndex];
                    if (paramIndex == -1) continue;
                    if (argTypes[argIndex].matches(signature.params[paramIndex].type)) {
                        strength++;
                    }
                }
                if (strength > bestFitStrength) {
                    bestFitIndex = sigIndex;
                    bestFitStrength = strength;
                }

                signatureInfos.push(info)
            }

            return {
                signatures: signatureInfos,
                activeSignature: bestFitIndex,
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
            else if (data.type == CompletionItemType.TAG_NAME) {
                let options = Object.entries(data.tag.options).map(([name, data]) => `\`${name}\`${data.description.length > 0 ? " - "+data.description : ""}`).join("\n\n")
                documentation = `**${data.tag.name}**\n\nOptions: \n\n${options}`;
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

            slog("\nNode trace:");
            slog(visualizeNodeAncestors(node));

            let includeGenerics = true;

            //=--------------------------=\\
            //=- context specific stuff -=\\
            //=--------------------------=\\

            let [callNode, definition] = getNearestCallNode(node, doc.workspace.typeProcessor, envFrame, index);
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
                let headerType: HeaderType = DFCodeblockName[TokenType[s.type.type]];

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
            // variable names when a scope is provided
            else if (node instanceof VariableExpression || (node instanceof Token && node.parent instanceof VariableExpression && node.keyInParent == "name")) {
                let variableExpression = (node instanceof VariableExpression ? node : node.parent) as VariableExpression;
                includeGenerics = false;
                items.push(...generateVariableCompletions(envFrame, {
                    explicitScope: VariableScope[TokenType[variableExpression.scope.type]],
                    replaceString: node instanceof Token && node.type == TokenType.STRING_LITERAL ? node : undefined,
                    doc: doc,
                    excludeName: node instanceof Token ? node.value : undefined,
                }));
            }
            // types if ur inside a type expression
            else if (node instanceof TypeAssignmentExpression || node.getClosestAncestor(TypeExpression) != null) {
                includeGenerics = false;
                items.push(...typeNameCompletions);
            }

            // action tags
            if (includeGenerics && callNode && definition) {
                if (definition.action && node.getClosestAncestor(ListExpression) == callNode.args) {
                    let closestBinary = node.getClosestAncestor(BinaryExpression);
                    // tag value
                    if (
                        closestBinary 
                        && closestBinary.isChildOf(callNode.args) 
                        && (node.isChildOf(closestBinary.right) || node == closestBinary.operator)
                        && closestBinary.operator.type == TokenType.EQUALS 
                        && closestBinary.left instanceof AtomicExpression
                        && (closestBinary.left.token.type == TokenType.STRING_LITERAL || closestBinary.left.token.type == TokenType.IDENTIFIER)
                    ) {
                        let tagName = closestBinary.left.token.value;
                        let tag = definition.action.tcTagMap[tagName];
                        let extraStringData: StringExtraData | null = (node instanceof Token && node.type == TokenType.STRING_LITERAL) ? node.getStringExtraData() : null;
                        if (tag) {
                            for (const [optName, optData] of Object.entries(tag.options)) {
                                let stringified = valueToTCString(optName, extraStringData?.quoteChar ?? '"');
                                let item: CompletionItem = {
                                    label: optName,
                                    kind: CompletionItemKind.EnumMember,
                                    sortText: "\u0000"+optName,
                                    data: {
                                        type: CompletionItemType.TAG_OPTION,
                                        tag: tag,
                                        option: optName,
                                    } as CompletionItemData
                                };
                                if (node instanceof Token && node.parent instanceof AtomicExpression && extraStringData?.isClosed) {
                                    item.textEdit = {
                                        range: {
                                            start: doc.indexToLinePosition(node.startPos), 
                                            end: doc.indexToLinePosition(node.endPos),
                                            // start: param.position,
                                            // end: param.position,
                                        },
                                        newText: stringified,
                                    };
                                    if (node.type == TokenType.STRING_LITERAL) {
                                        item.filterText = stringified//extraData.quoteChar + stringified + extraData.quoteChar;
                                    }
                                } else {
                                    item.insertText = valueToTCString(optName);
                                }
                                items.push(item);
                            }
                            includeGenerics = false;
                            if (!(node instanceof Token && node.type == TokenType.STRING_LITERAL)) {
                                items.push(...generateVariableCompletions(envFrame));
                            }
                        }
                    }
                    // tag name
                    else if (includeGenerics && !(node instanceof Token && node.parent instanceof AtomicExpression && node.type != TokenType.IDENTIFIER)) {
                        let existingTags: string[] = [];
                        // figure out what tags already exist
                        for (const arg of callNode.args.elements) {
                            if (
                                arg instanceof BinaryExpression 
                                && arg.operator.type == TokenType.EQUALS 
                                && arg.left instanceof AtomicExpression
                                && (arg.left.token.type == TokenType.STRING_LITERAL || arg.left.token.type == TokenType.IDENTIFIER)
                            ) {
                                existingTags.push(arg.left.token.value);
                            }
                        }

                        for (const tag of Object.values(definition.action.tags)) {
                            let tcName = AD.getTCTagName(tag.name);
                            if (existingTags.includes(tcName)) continue;

                            items.push({
                                label: tcName,
                                insertText: tcName,
                                kind: CompletionItemKind.Enum,
                                commitCharacters: ["="],
                                data: {
                                    type: CompletionItemType.TAG_NAME,
                                    tag: tag,
                                } as CompletionItemData,
                                sortText: "\u0000"+tcName
                            });
                        }
                    }
                }
            }

            if (node instanceof Token && (node.type == TokenType.STRING_LITERAL || node.type == TokenType.STYLED_LITERAL || node.type == TokenType.NUMERIC_LITERAL)) {
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
                // variables
                items.push(...generateVariableCompletions(envFrame));
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