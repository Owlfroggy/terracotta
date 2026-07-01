import * as rpc from "vscode-jsonrpc/node.js"
import * as AD from "../df/actiondump.ts"
import * as fs from "node:fs/promises"
import { CompletionItem, CompletionList, InitializeResult, MessageType, TextDocumentSyncKind, InitializeParams, CompletionParams, SignatureHelpParams, FileOperationRegistrationOptions, DefinitionParams, CreateFilesParams, RenameFilesParams, DeleteFilesParams, DidOpenTextDocumentParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidChangeWatchedFilesParams, URI, CompletionItemKind, SignatureInformation, SignatureHelp, MarkupContent, HoverParams, Hover, Location, FileChangeType, CompletionItemTag } from "vscode-languageserver";
import { TrackedDocument } from "./trackedDocument.ts";
import { WorkspaceManager } from "./workspaceManager.ts";
import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, CallOrStartExpression, Expression, GroupExpression, ListExpression, MultiTypeAssignmentExpression, ParameterExpression, SelectionExpression, TypeAssignmentExpression, TypeExpression, VariableExpression } from "../ast/expression.ts";
import { FuncTypeData, NamespaceTypeData, Type, TYPE_NAMESPACES } from "../typeProcessor/type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { Definition, DefinitionType, FunctionDefinition, isFunctionDefinition, ValueDefinition } from "../compiler/namespace/definition.ts";
import { EnvironmentFrame, isVariableEntry, TypeProcessor, VariableEntry, VariableId, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { AssignmentStatement, EventStatement, ExpressionStatement, ForStatement, FunctionStatement, RepeatStatement } from "../ast/statement.ts";
import { HeaderType, tcEventToDf } from "../compiler/codeCompiler.ts";
import { StringExtraData, Token, TokenType } from "../ast/token.ts";
import { getActionDocumentation, getDFParamString, getEventDocumentation, getValueDocumentation, visualizeNodeAncestors } from "./utils.ts";
import { getAllowedParticleFields, isIdentifier, valueToTCString } from "../util/utils.ts";
import { DFCodeblockName, DFRank, tcTypeToDF } from "../df/constants.ts";
import { OVERRIDES } from "../data/overrides.ts";
import { FILTER_ACTIONS, REPEAT_ACTIONS, SELECT_ACTIONS } from "../compiler/namespace/builtins.ts";
import { posIndexIsInListElement, isForLoopActionCall, binaryIsNamedArgument, getExistingNamedArgs } from "../util/astUtils.ts";
import { brotliDecompress } from "node:zlib";
import { GLOBAL_SCOPE_INJECTIONS } from "../compiler/namespace/globalScopeInjections.ts";
import { CSND_CONSTRUCTOR, ITEM_CONSTRUCTOR, LITEM_CONSTRUCTOR, PAR_CONSTRUCTOR, POT_CONSTRUCTOR, SND_CONSTRUCTOR } from "../compiler/namespace/constructors.ts";
import { FunctionValue, StringValue } from "../compiler/codeValue.ts";
import { BLOCK_OR_ITEM_IDS, PAR_MATERIAL_FIELD_TYPES, PARTICLE_FIELD_DEFAULTS, TYPE_DESCRIPTIONS, VALID_ITEM_IDS } from "../data/constants.ts";
import { setSlogCallback, setSnotifCallback, slog } from "./logging.ts";
import { matchArgsToParams } from "../util/argValidation.ts";
import { COMPILE_START_PROCESS } from "../compiler/namespace/compileCallFunction.ts";
import { methodizeParameterSignatures } from "../compiler/namespace/utils.ts";
import { TrackedScript } from "./trackedScript.ts";
import { TrackedItemLibrary } from "./trackedItemLibrary.ts";
import { MCNote } from "../util/note.ts";
import { convertDFValue } from "./valueConverter.ts";

type ServerTCConfiguration = {
    dfRank: DFRank,
    rankBehavior: "crossOutInaccessible" | "hideInaccessible"
}

enum CompletionItemType {
    EVENT,
    TAG_NAME,
    TAG_OPTION,
}
type CompletionItemData = {
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

let configuration: ServerTCConfiguration = {
    dfRank: DFRank.OVERLORD,
    rankBehavior: "crossOutInaccessible"
}

/**
 * NOTE: The item passed into this should have the string's raw contents as its label.
 * This function takes care of the stringification of said contents.
 * 
 * @param leaveIdentifiersAlone If existingNode is an identifier and the completion item's label can stay as an identifier, make no changes to this tiem
 */
function stringizeCompletionItem(item: CompletionItem, existingNode: ASTNode, doc: TrackedDocument, leaveIdentifiersAlone: boolean = false) {
    if (
        leaveIdentifiersAlone 
        && existingNode instanceof Token 
        && existingNode.type == TokenType.IDENTIFIER 
        && isIdentifier(item.label)
    ) return item;

    let extraStringData: StringExtraData | null = (existingNode instanceof Token && existingNode.type == TokenType.STRING_LITERAL) ? existingNode.getStringExtraData() : null;
    let stringified = valueToTCString(item.label, extraStringData?.quoteChar ?? '"');
    if (
        existingNode instanceof Token 
        && (existingNode.parent instanceof AtomicExpression || existingNode.parent instanceof CallOrStartExpression) 
        && extraStringData?.isClosed
    ) {
        item.textEdit = {
            range: {
                start: doc.indexToLinePosition(existingNode.startPos), 
                end: doc.indexToLinePosition(existingNode.endPos),
                // start: param.position,
                // end: param.position,
            },
            newText: stringified,
        };
        if (existingNode.type == TokenType.STRING_LITERAL) {
            item.filterText = stringified//extraData.quoteChar + stringified + extraData.quoteChar;
        }
    } else {
        item.insertText = valueToTCString(item.label);
    }
    return item;
}

function generateDefinitionCompletion(name: string, def: Definition, allowCallOrStartInersion: boolean = true): CompletionItem {
    let item: CompletionItem;
    let documentation: string = "";
    if (def.definitionType == DefinitionType.FUNCTION) {
        // let isUnusable = !AD.RankCheck(tcConfig.dfRank,action?.RequiresRank!)
        // if (isUnusable && tcConfig.rankBehavior == "hideInaccessible") { return }
        item = {
            label: name,
            kind: (def as any).compileIf ? CompletionItemKind.Property : CompletionItemKind.Method,
            commitCharacters: ["("],

        }
        if (def.autocompleteSortPrefix) {
            item.sortText = "z" + def.autocompleteSortPrefix + item.label;
        }
        if (allowCallOrStartInersion && !isIdentifier(name)) {
            item.insertText = `call ${valueToTCString(name)}`;
        }
        if (def.action) {
            documentation = getActionDocumentation(def.action, configuration.dfRank);
            if (!AD.rankCheck(configuration.dfRank, def.action.requiresRank)) {
                if (!item.tags) item.tags = [];
                item.sortText = "\uFFFF" + item.label;
                item.tags.push(CompletionItemTag.Deprecated);
            }
        } else {
            //creating a parameter object so that it can work with the existing string gen is kinda a hack but whatever
            let returnTypeString: string = ""
            if (def.defaultReturnType != null) {
                let returnP = new AD.Parameter([
                    [new AD.ParameterGroupValue(
                        tcTypeToDF[def.defaultReturnType.name],
                        // TODO: description for return types
                    )]
                ])

                returnTypeString = getDFParamString([returnP],"\n\n**Returns Value:**\n\n","")
            }

            let paramString: string;
            let convertedParams: AD.Parameter[] = [];
            // TODO: handle multiple signatures maybe?
            for (const param of def.signatures[0].params) {
                convertedParams.push(new AD.Parameter([
                    [new AD.ParameterGroupValue(
                        tcTypeToDF[param.type.name],
                        param.name,
                        param.optional,
                        param.plural,
                        param.description != undefined ? param.description.split("\n") : undefined
                    )]
                ]))
            }
            paramString = getDFParamString(convertedParams, "\n\n**Parameters:**\n\n", "\n\n**No Parameters**");
            
            
            documentation = `${paramString}${returnTypeString}`
        }
    }
    else {
        item = {
            label: name,
            kind: CompletionItemKind.Field,
            commitCharacters: [";"],
        }
        if (def.gameValue) {
            documentation = getValueDocumentation(def.gameValue);
        }
    }
    item.documentation = {
        kind: "markdown",
        value: documentation
    }
    return item;
}

function generateTypeMemberCompletions(type: Type): CompletionItem[] {    
    let members = type.getMembers();
    if (members == null) return [];

    let items: CompletionItem[] = [];
    for (const m of members) {
        let mType = type.getMemberType(m);
        if (mType.matches(Type.func)) {
            items.push(generateDefinitionCompletion(m, (mType.data as FuncTypeData).definition));
        } else {
            // TODO: make these items prettier
            items.push({
                label: m, 
                documentation: mType.toString(),
                kind: CompletionItemKind.Field
            });
        }
    }
    return items;
}

function generateTypePropertyCompletions(type: Type): CompletionItem[] {
    let properties = type.getProperties();
    if (properties == null) return [];


    let items: CompletionItem[] = [];
    for (const p of properties) {
        let def = type.getPropertyDefinition(p);
        if (!def) continue;
        if (
            configuration.rankBehavior == "hideInaccessible" 
            && isFunctionDefinition(def) 
            && def.action
            && !AD.rankCheck(configuration.dfRank, def.action.requiresRank)
        ) continue;
        items.push(generateDefinitionCompletion(p, def));
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
            if (!isIdentifier(stringifiedName) || options.replaceString) {
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
    "return", "break", "continue",
    "global", "saved", "local", "line",
    "for", "repeat", "if", "else", "while", "do",
    "perselected",
    "as", "to", "in", "on",
    "select", "filter",
].map(kw => ({
    label: kw,
    kind: CompletionItemKind.Keyword
}));

const particleFieldCompletions: {[field: string]: CompletionItem} = Object.fromEntries(
    Object.keys(PARTICLE_FIELD_DEFAULTS).map(
        (field): [string, CompletionItem] => [field, {
            label: field,
            kind: CompletionItemKind.Enum,
            sortText: "\u0000"+field,
        }]
    )
);

const globalScopeInjectionCompletions: CompletionItem[] = Object.entries(GLOBAL_SCOPE_INJECTIONS).map(
    ([name, def]) => generateDefinitionCompletion(name, def)
);

const createSelectionCompletions: CompletionItem[] = Object.entries(SELECT_ACTIONS).map(
    ([name, def]) => generateDefinitionCompletion(name, def)
);
const filterSelectionCompletions: CompletionItem[] = Object.entries(FILTER_ACTIONS).map(
    ([name, def]) => generateDefinitionCompletion(name, def)
);

function getNearestCallNode(node: ASTNode, typeProcessor: TypeProcessor, envFrame: EnvironmentFrame, index: number): [callNode: CallExpression | CallOrStartExpression, definition: FunctionDefinition] | [null, null] {
    // find the function call this node is a part of, if there is one
    let callNode: ASTNode = node;
    let listFound = false;
    while (callNode.parent != null) {
        if (callNode instanceof ListExpression) listFound = true;
        // checking index < n.endPos is required otherwise placing the caret after
        // the argument list's closer would be counted as inside the list
        if (
            listFound 
            && (callNode instanceof CallExpression || callNode instanceof CallOrStartExpression) 
            && index < callNode.endPos
        ) {
            break;
        }
        callNode = callNode.parent;
    }
    
    
    if (callNode instanceof CallOrStartExpression) {
        let isProcess = callNode.keyword.type == TokenType.START;
        let definition = typeProcessor.globalFrame[isProcess ? "processes" : "functions"].get(callNode.callee.value)?.[0];
        return definition ? [callNode, definition] : [null, null];
    } else if (callNode instanceof CallExpression) {
        let closestForLoop = callNode.getClosestAncestor(ForStatement);
        let calleeType = typeProcessor.evaluateExpression(callNode.callee, envFrame);
        let definition: FunctionDefinition | null = null;

        // special for loop actions
        if (
            closestForLoop 
            && closestForLoop?.iteratorExpression 
            && (callNode == closestForLoop.iteratorExpression || callNode.isChildOf(closestForLoop.iteratorExpression))
            && isForLoopActionCall(callNode)
        ) {
            definition = REPEAT_ACTIONS[callNode.callee.token.value]!.def;
        } 
        // normal functions
        else if (calleeType.name == "func") {
            definition = (calleeType.data as FuncTypeData).definition
        } else if (calleeType.name == "namespace") {
            definition = (calleeType.data as NamespaceTypeData).namespace.nameFunction ?? null;
        }
        if (!definition) return [null, null];
        return [callNode, definition];
    } else {
        return [null, null]
    }
}

export class LanguageServer {
    connection: rpc.MessageConnection;
    workspaces: Map<URI, WorkspaceManager> = new Map();
    configuration: ServerTCConfiguration;

    constructor() {
        //==========[ setup ]=========\\

        let conn = rpc.createMessageConnection(
            new rpc.StreamMessageReader(process.stdin),
            new rpc.StreamMessageWriter(process.stdout)
        );
        this.connection = conn;
        conn.listen()
        
        setSlogCallback(this.log);
        setSnotifCallback(this.showText);
        this.configuration = configuration;
        
        //==========[ request handling ]=========\\

        conn.onRequest("initialize", (param: InitializeParams) => {
            let response: InitializeResult = {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Full,
                    //workspace folders
                    workspace: {
                        workspaceFolders: {
                            supported: true,
                            changeNotifications: false
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
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getScriptFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return;
            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad

            let result: Location | null = null;

            let resolved: Namespace | VariableEntry | Definition | null = null;
            let getVarEntryOf: VariableId | undefined;
            if (node instanceof Token && node.type == TokenType.IDENTIFIER && node.parent instanceof AtomicExpression) {
                resolved = doc.workspace.typeProcessor.resolveIdentifier(node);
                // if this declaration doesn't have an ast node, find one that does
                if (isVariableEntry(resolved) && !resolved.astNode) getVarEntryOf = resolved.id;
            }
            else if (node instanceof Token && node.parent instanceof VariableExpression && node.keyInParent == 'name') {
                getVarEntryOf = node.parent.getVarId();
            }
            else if (node instanceof Token && node.parent instanceof CallOrStartExpression && node.keyInParent == "callee") {
                let type = node.parent.keyword.type == TokenType.CALL ? "functions" : "processes"
                resolved = doc.workspace.typeProcessor.globalFrame[type].get(node.value)?.[0] ?? null;
            }
            if (getVarEntryOf) {
                resolved = doc.workspace.typeProcessor.getNodeFrame(node).getVariableEntry(getVarEntryOf, node.startPos, true);
            }
            if (!resolved) return;

            if (
                (isFunctionDefinition(resolved) || isVariableEntry(resolved)) 
                && resolved 
                && resolved.astNode
            ) {
                let declarationDoc = this.getScriptFromUri(resolved.astNode.getRoot().filePath)
                if (!declarationDoc) return null;
                result = {
                    uri: declarationDoc.uri,
                    range: {
                        start: declarationDoc.indexToLinePosition(resolved.astNode.startPos),
                        end: declarationDoc.indexToLinePosition(resolved.astNode.endPos),
                    }
                }
            }

            return result;
        })

        conn.onRequest("textDocument/hover", (param: HoverParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getScriptFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return;
            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad
            let envFrameNode = node;

            // TODO: abstract documentation generation into its own function
            // and just hook into that

            // show variable type on hover
            if (node instanceof Token && node.type == TokenType.IDENTIFIER) {
                let queryVarId: string | VariableId = node.value;
                let queryPosition = node.endPos;
                if (node.parent instanceof VariableExpression) {
                    // if the scope is specified here, use that when looking up the var
                    queryVarId = node.parent.getVarId();

                    let closestGroup = node.getClosestAncestor(GroupExpression);
                    let closestList = node.getClosestAncestor(ListExpression);

                    // if this variable is being assigned to something (type or value), query after the assignment has been completed
                    if (node.parent.parent instanceof AssignmentStatement || node.parent.parent instanceof ExpressionStatement){ 
                        queryPosition = node.parent.parent.endPos+1;
                    }
                    // repeat (var to ...)
                    else if (closestGroup && closestGroup.keyInParent == "countExpression" && closestGroup.parent instanceof RepeatStatement && closestGroup.parent.chunk) {
                        envFrameNode = closestGroup.parent.chunk
                        queryPosition = closestGroup.parent.chunk.startPos+1;
                    }
                    // for (var of ...)
                    else if (closestList && closestList.keyInParent == "variableList" && closestList.parent instanceof ForStatement && closestList.parent.chunk) {
                        envFrameNode = closestList.parent.chunk;
                        queryPosition = closestList.parent.chunk.startPos+1;
                    }
                }

                let envFrame = doc.workspace.typeProcessor.getNodeFrame(envFrameNode);
                let varEntry = envFrame.getVariableEntry(queryVarId, queryPosition);
                
                if (!varEntry) return;

                let name = node.value;
                let scopeStr = VariableScope[varEntry.id.scope].toLowerCase();
                let stringifiedName = name;
                if (!isIdentifier(stringifiedName)) {
                    stringifiedName = valueToTCString(name, '"');
                }
                let documentation: MarkupContent = {
                    kind: 'markdown', 
                    value: `\`\`\`tc\n${scopeStr} ${stringifiedName}: ${varEntry.type ?? "any"}\n\`\`\``
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
            let doc = this.getScriptFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return
            let node = doc.getAstNodeAtIndex(index);
            if (node == null) return; // todo: this is bad
            let envFrame = doc.workspace.typeProcessor.getNodeFrame(node);


            let [callNode, definition] = getNearestCallNode(node, doc.workspace.typeProcessor, envFrame, index);
            if (callNode == null || definition == null) return;

            let [calleeValue, calleeCode] = doc.compiler.compileExpression(callNode.callee, {});

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

            // handle signatures that are modified by method calls
            let signaturesToUse = definition.signatures;
            if (calleeValue instanceof FunctionValue && calleeValue.methodCallOf != undefined) 
                signaturesToUse = methodizeParameterSignatures(definition.signatures, calleeValue.methodCallOf.getType(doc.workspace.typeProcessor));

            for (let sigIndex = 0; sigIndex < signaturesToUse.length; sigIndex++) {
                const signature = signaturesToUse[sigIndex];
                let info = {
                    parameters: [],
                    label: ""
                } as SignatureInformation

                let paramStrings: string[] = []

                for (const param of signature.params) {
                    let paramString: string
                    paramString = `${param.plural ? "..." : ""}${param.name}${param.optional ? "*" : ""}: ${param.type.name}`
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
                else if (signature.params.length > 0 && info.activeParameter >= signature.params.length && signature.params[signature.params.length-1].plural) {
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
                        // prioritize filling required parameters over later on optional parameters of the same type
                        if (signature.params[paramIndex].optional) {
                            strength += 1;
                        } else {
                            strength += 2;
                        }
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
            if (data.type == CompletionItemType.TAG_NAME) {
                let options = Object.entries(data.tag.options).map(([name, data]) => `\`${name}\`${data.description.length > 0 ? " - "+data.description.replaceAll("<","\\<") : ""}`).join("\n\n")
                documentation = `${data.tag.name}\n\n**Options:** \n\n${options}\n\n**Default option:** \`${data.tag.defaultOption}\``;
            }
            else if (data.type == CompletionItemType.TAG_OPTION) {
                documentation = data.tag.options?.[data.option].description.replaceAll("<","\\<");
            }
            item.documentation = {
                kind: "markdown",
                value: documentation
            };
            return item;
        })

        conn.onRequest("textDocument/completion", async (param: CompletionParams) => {
            if (!param.textDocument.uri.endsWith(".tc")) return
            let doc = this.getScriptFromUri(param.textDocument.uri);
            if (doc == undefined) return;
            let index = doc?.linePositionToIndex(param.position);
            if (index == undefined) return

            let items: CompletionItem[] = [];

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
                let accessExpression = node.parent as AccessExpression;
                let accesseeType = doc.workspace.typeProcessor.evaluateExpression(accessExpression.accessee, envFrame);
                items = generateTypePropertyCompletions(accesseeType);

                // also include field items that just turn into the proper bracketed access expressions
                if (accesseeType.matches(Type.dict)) {
                    items.push(...generateTypeMemberCompletions(accesseeType).map(item => {
                        item.textEdit = {
                            range: {
                                start: doc.indexToLinePosition(accessExpression.accessorToken.startPos),
                                end: doc.indexToLinePosition(node.endPos),
                            },
                            newText: `[${valueToTCString(item.label)}]`
                        }
                        item.filterText = "." + item.label;
                        item.commitCharacters = [".","["," "];
                        return item;
                    }))
                }

                includeGenerics = false;
            }
            else if (node.parent instanceof BracketedAccessExpression || (node.parent instanceof AtomicExpression && node.parent.parent instanceof BracketedAccessExpression)) {
                let accessExpression = (node.parent instanceof BracketedAccessExpression ? node.parent : node.parent.parent) as BracketedAccessExpression;
                let accesseeType = doc.workspace.typeProcessor.evaluateExpression(accessExpression.accessee, envFrame);
                items = generateTypeMemberCompletions(accesseeType).map(
                    item => {
                        item = stringizeCompletionItem(item, node, doc)
                        item.sortText = "\u0000"+item.label;
                        return item;
                    }
                );
            }
            // event names
            else if (
                (node instanceof EventStatement && index > node.type.endPos && index < node.chunk.startPos)
                || (node.parent instanceof EventStatement && node.keyInParent == "eventName")
            ) {
                let s = node instanceof EventStatement ? node : node.parent as EventStatement;
                let headerType: HeaderType = DFCodeblockName[TokenType[s.type.type]];

                for (const [tcEvent, dfEvent] of Object.entries(tcEventToDf.get(headerType) ?? {})) {
                    let eventAction = AD.actions.get(headerType)![dfEvent];
                    let item: CompletionItem = {
                        label: tcEvent,
                        kind: CompletionItemKind.Event,
                        documentation: {
                            kind: "markdown",
                            value: getEventDocumentation(eventAction, configuration.dfRank)
                        }
                    };
                    if (!AD.rankCheck(configuration.dfRank, eventAction.requiresRank)) {
                        if (configuration.rankBehavior == "crossOutInaccessible") {
                            item.tags = [CompletionItemTag.Deprecated];
                            item.sortText = "\uFFFF" + item.label;
                        } else {
                            continue;
                        }
                    }
                    items.push(item);
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
            else if (
                node instanceof TypeAssignmentExpression 
                || node instanceof MultiTypeAssignmentExpression
                || (node instanceof Token && node.type == TokenType.COLON && node.keyInParent == "colon")
                || node.getClosestAncestor(TypeExpression) != null
                || node.getClosestAncestor(MultiTypeAssignmentExpression) != null
            ) {
                includeGenerics = false;
                items.push(...typeNameCompletions);
            }
            // function names in a call/start expression
            else if (node instanceof CallOrStartExpression || (node instanceof Token && node.parent instanceof CallOrStartExpression && node.keyInParent == "callee")) {
                includeGenerics = false;
                let callExpression = (node instanceof CallOrStartExpression ? node : node.parent) as CallOrStartExpression;
                let isProcess = callExpression.keyword.type == TokenType.START;
                items.push(...doc.workspace.typeProcessor.globalFrame[isProcess ? "processes" : "functions"].values().map(
                    v => {
                        let item = generateDefinitionCompletion(v[0].name, v[0]);
                        item = stringizeCompletionItem(item, node, doc, true);
                        return item;
                    }
                ))
            }

            // action names in a select/filter statement
            else if (
                (node instanceof SelectionExpression && node.keyword.endPos < index && index <= node.endPos) || 
                (node instanceof Token && node.parent instanceof SelectionExpression && node.keyInParent == "name")
            ) {
                includeGenerics = false;
                let callExpression = (node instanceof SelectionExpression ? node : node.parent) as SelectionExpression;
                let isFilter = callExpression.keyword.type == TokenType.FILTER;
                items = isFilter ? filterSelectionCompletions : createSelectionCompletions;
            }
            // hide generics when typing parameters in a function definition
            // or when typing a function's name
            else if (
                // parameters
                (node instanceof ListExpression && node.parent instanceof FunctionStatement && node.keyInParent == "params")
                || (node instanceof Token && node.parent instanceof ParameterExpression && node.keyInParent == "name")
                || (node instanceof Token && node.parent instanceof ListExpression && node.parent.parent instanceof FunctionStatement)
                // function name
                || (node instanceof Token && node.parent instanceof FunctionStatement && node.keyInParent == "name")
            ) {
                includeGenerics = false;
            }
            else if (includeGenerics && callNode && definition && node.getClosestAncestor(ListExpression) == callNode.args) {
                let closestBinary = node.getClosestAncestor(BinaryExpression);
                // action tags
                if (definition.action ?? definition.compile == COMPILE_START_PROCESS) {
                    let action = definition.action ?? AD.actions.get(DFCodeblockName.START_PROCESS)!.dynamic!;
                    // tag value
                    if (
                        binaryIsNamedArgument(closestBinary, callNode)
                        && (node.isChildOf(closestBinary.right) || node == closestBinary.operator)
                    ) {
                        let tagName = closestBinary.left.token.value;
                        let tag = action.tcTagMap[tagName];
                        if (tag) {
                            for (const [optName, optData] of Object.entries(tag.options)) {
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
                                stringizeCompletionItem(item, node, doc);
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
                        const existingTags = getExistingNamedArgs(callNode.args);

                        for (const tag of Object.values(action.tags)) {
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
                // note names in pitch param
                else if (posIndexIsInListElement(callNode.args, index, 1) && definition == SND_CONSTRUCTOR || definition == CSND_CONSTRUCTOR) {
                    let relevantArg = callNode.args.elements[1]?.getRealExpression();
                    // only show if you're in a string to avoid unnecessarily cluttering completion list
                    if (relevantArg instanceof AtomicExpression && relevantArg.token.type == TokenType.STRING_LITERAL) {
                        items.push(...MCNote.getAllNotes().map(note => stringizeCompletionItem({
                            label: note,
                            filterText: note,
                            kind: CompletionItemKind.Text,
                            sortText: ""+MCNote.getPitchFromNote(note)!
                        }, relevantArg.token, doc)));
                    }
                }
                // sound names and variants
                else if (definition == SND_CONSTRUCTOR) {
                    // names
                    if (posIndexIsInListElement(callNode.args, index, 0)) {
                        items.push(...Object.keys(AD.sounds).map(name => 
                            stringizeCompletionItem({
                                label: name,
                                kind: CompletionItemKind.Text,
                                sortText: "\u0000"+name,
                            }, node, doc)
                        ));
                    }
                    // variants
                    else if (posIndexIsInListElement(callNode.args, index, 3)) {
                        let [nameValue, _] = doc.compiler.compileExpression(callNode.args.elements[0], {});
                        if (nameValue instanceof StringValue && nameValue.isCompileTimeConstant()) {
                            let soundName = nameValue.value;
                            let soundDef = AD.sounds[nameValue.value];
                            if (soundDef) {
                                items.push(...soundDef.variants.map(name => 
                                    stringizeCompletionItem({
                                        label: name,
                                        kind: CompletionItemKind.Text,
                                        sortText: "\u0000"+name,
                                    }, node, doc)
                                ));
                            }
                        }
                    }
                }
                // potion ids
                else if (definition == POT_CONSTRUCTOR) {
                    // names
                    if (posIndexIsInListElement(callNode.args, index, 0)) {
                        items.push(...Object.keys(AD.potions).map(name => 
                            stringizeCompletionItem({
                                label: name,
                                kind: CompletionItemKind.Text,
                                sortText: "\u0000"+name,
                            }, node, doc)
                        ));
                    }
                }
                // particle stuff
                else if (definition == PAR_CONSTRUCTOR) {
                    let parNameArg = callNode.args.elements[0]?.getRealExpression();
                    
                    // TODO: actually compile this expression
                    let parName: string | undefined;
                    if (parNameArg && parNameArg instanceof AtomicExpression && parNameArg.token.type == TokenType.STRING_LITERAL) {
                        parName = parNameArg.token.value;
                    }

                    // particle name
                    if (posIndexIsInListElement(callNode.args, index, 0)) {
                        items.push(...Object.values(AD.particles).map(par => 
                            stringizeCompletionItem({
                                label: par.name,
                                kind: CompletionItemKind.Text,
                                sortText: "\u0000"+par.name,
                            }, node, doc)
                        ));
                    }
                    // field values 
                    else if (
                        binaryIsNamedArgument(closestBinary, callNode)
                        && (node.isChildOf(closestBinary.right) || node == closestBinary.operator)
                    ) {
                        let fieldName = closestBinary.left.token.value;
                        if (fieldName == "material") {
                            let validIds: Set<string> = PAR_MATERIAL_FIELD_TYPES[parName ?? ''] ?? BLOCK_OR_ITEM_IDS; // least sinful use of ?? operator
                            items.push(...validIds.values().map(
                                (id) => stringizeCompletionItem({
                                    label: id,
                                    kind: CompletionItemKind.Text,
                                    sortText: "\u0000"+id,
                                }, node, doc)
                            ))
                        }
                    } 
                    // field names
                    else if ( 
                        !(node instanceof Token && node.parent instanceof AtomicExpression && node.type != TokenType.IDENTIFIER)
                    ) {
                        let allowedFields = getAllowedParticleFields(AD.particles[parName ?? ""]);
                        let existingArgs = getExistingNamedArgs(callNode.args);
                        for (const field of allowedFields) {
                            if (!existingArgs.includes(field)) {
                                items.push(particleFieldCompletions[field])
                            }
                        }
                    }
                }
                // item ids
                else if (definition == ITEM_CONSTRUCTOR) {
                    // names
                    if (posIndexIsInListElement(callNode.args, index, 0)) {
                        items.push(...VALID_ITEM_IDS.values().map(name => 
                            stringizeCompletionItem({
                                label: name,
                                kind: CompletionItemKind.Text,
                                sortText: "\u0000"+name,
                            }, node, doc)
                        ));
                    }
                }
                else if (definition == LITEM_CONSTRUCTOR) {
                    // library id
                    if (posIndexIsInListElement(callNode.args, index, 0)) {
                        doc.workspace.forEachItemLibrary(lib => {
                            if (!lib.parsedContents) return;
                            items.push(stringizeCompletionItem({
                                label: lib.parsedContents.id,
                                kind: CompletionItemKind.Text,
                                sortText: "\u0000"+name,
                            }, node, doc));
                        })
                    }
                    else if (posIndexIsInListElement(callNode.args, index, 1)) {
                        let libraryNameArg = callNode.args.elements[0];
                        if (libraryNameArg instanceof GroupExpression) libraryNameArg = libraryNameArg.getRealExpression();

                        if (libraryNameArg && libraryNameArg instanceof AtomicExpression && libraryNameArg.token.type == TokenType.STRING_LITERAL) {
                            let library = doc.workspace.allItemLibraryDatas()[libraryNameArg.token.value];
                            if (library) {
                                for (const id of Object.keys(library.items)) {
                                    items.push(stringizeCompletionItem({
                                        label: id,
                                        kind: CompletionItemKind.Text,
                                        sortText: "\u0000"+name,
                                    }, node, doc));
                                }
                            }
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
                for (const [id, namespace] of Object.entries(Namespace.registry)) {
                    let isTypeNamespace = (id in TYPE_NAMESPACES && id != "var");
                    items.push({
                        label: id,
                        kind: isTypeNamespace ? CompletionItemKind.Class : CompletionItemKind.Module,
                        commitCharacters: ["."],
                        documentation: isTypeNamespace ? {
                            kind: "markdown",
                            value: (TYPE_DESCRIPTIONS[id] ?? "") + `\n\nAccess this as a namespace (e.g. \`${id}.${Object.keys(namespace.members)[0]}\`) for related functions.`
                        } : undefined
                    });
                }
                // keywords
                items.push(...keywordCompletions);

                items.push(...globalScopeInjectionCompletions);
                
                // variables and functions
                items.push(...generateVariableCompletions(envFrame));
                items.push(...doc.workspace.typeProcessor.globalFrame.functions.values().flatMap(
                    funcs => funcs.map(f => generateDefinitionCompletion(f.name, f))
                ));

                // for loop actions
                let closestForLoop = node.getClosestAncestor(ForStatement);
                if (
                    closestForLoop
                    && (
                        node == closestForLoop.iteratorExpression
                        || (node instanceof Token && node.parent == closestForLoop.iteratorExpression)
                        || (node instanceof Token && node.parent instanceof AtomicExpression && node.parent.parent == closestForLoop.iteratorExpression)
                    )
                ) {
                    items.push(...Object.entries(REPEAT_ACTIONS).map(
                        ([name, data]) => {
                            let item = generateDefinitionCompletion(name, data.def);
                            item.sortText = "\u0001"+item.label;
                            return item;
                        }
                    ));
                }
            }

            // items = [];
            // doc.workspace.forEachItemLibrary(l => {
            //     if (l.parsedContents == null) return;
            //     for (const i of Object.keys(l.parsedContents.items)) {
            //         items.push({
            //             label: `${l.parsedContents.id} ${i}`
            //         })
            //     }
            // })

            slog ("Returned",items.length,"items")
            let response: CompletionList = {
                isIncomplete: true,
                items: items as CompletionItem[]
            }

            return response
        })

        //==========[ special requests ]=========\\
        conn.onRequest("terracotta/convertValues", (param: string[]) => {
            let output: {dfType: string, value: string}[] = [];

            for (const rawValue of param) {
                let parsedValue = JSON.parse(rawValue);
                let converted = convertDFValue(parsedValue);
                if (converted != null) {
                    output.push({dfType: parsedValue.id, value: converted});
                }
            }

            return {values: output};
        })

        //==========[ document handling ]=========\\
        conn.onNotification("textDocument/didOpen",(param: DidOpenTextDocumentParams) => {
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (!doc) return;
            doc.isOpen = true;
            doc.update([{text: param.textDocument.text}], param.textDocument.version);
        })

        conn.onNotification("textDocument/didChange", (param: DidChangeTextDocumentParams) => {
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (!doc) return;
            doc.update(param.contentChanges, param.textDocument.version);
        })

        conn.onNotification("textDocument/didClose", (param: DidCloseTextDocumentParams) => {
            let doc = this.getDocFromUri(param.textDocument.uri);
            if (!doc) return;
            doc.isOpen = false;
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
            this.reanalyzeAllFiles();
        })

        conn.onNotification("terracotta/exit", param => {
            process.exit(0)
        })
    }
    
    /** Reanalyzes every script in every workspace */
    reanalyzeAllFiles() {
        for (const workspace of this.workspaces.values()) {
            workspace.forEachScript(s => s.reparse());
        }
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

    /** 
     * if the uri to a workspace is passed in, it will return that workspace
     * if the uri to a file inside a workspace is passed in, it will return the farthest down workspace that contains that file
     */
    getWorkspaceFromUri(uri: URI): WorkspaceManager | null {
        let closestWorkspace: WorkspaceManager | null = null;
        let closestLength: number = 0;
        for (const workspace of this.workspaces.values()) {
            if (uri == workspace.uri) return workspace;
            if (
                uri.startsWith(workspace.uri) 
                && uri.charAt(workspace.uri.length) == "/"
                && workspace.uri.length > closestLength
            ) {
                closestWorkspace = workspace;
                closestLength = workspace.uri.length;
            }
        }
        return closestWorkspace
    }

    getScriptFromUri(uri: URI): TrackedScript | null {
        let doc = this.getDocFromUri(uri);
        if (doc instanceof TrackedScript) return doc;
        return null;
    }

    getLibraryFromUri(uri: URI): TrackedItemLibrary | null {
        let doc = this.getDocFromUri(uri);
        if (doc instanceof TrackedItemLibrary) return doc;
        return null;
    }
}