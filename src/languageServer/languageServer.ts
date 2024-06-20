import * as rpc from "vscode-jsonrpc/node"
import * as domains from "../util/domains"
import * as AD from "../util/actionDump"
import { CompletionItem, CompletionItemKind, CompletionList, CompletionRegistrationOptions, ConnectionStrategy, InitializeResult, MarkupContent, MarkupKind, Message, MessageType, TextDocumentSyncKind, Position } from "vscode-languageserver";
import { CodeContext, ContextType, GetLineIndexes, Tokenize } from "../tokenizer/tokenizer";
import { DocumentTracker } from "./documentTracker";
import { CREATE_SELECTION_ACTIONS, FILTER_SELECTION_ACTIONS } from "../util/constants";

//function that other things can call to log to the language server output when debugging
export let slog

function generateCompletions(entries: (string)[]): CompletionItem[] {
    let result: CompletionItem[] = []
    for (const v of entries) {
        let item: CompletionItem = {
            "label": v
        }
        result.push(item)
    }
    return result
}

function indexToLinePosition(script: string,index: number): Position {
    let lines = script.split("\n")
    let finalLine: number = 0
    let totalIndex: number = 0
    for (const l of lines) {
        totalIndex += l.length + 1
        if (totalIndex >= index) {
            return {"line": finalLine, "character": 1 + index - (totalIndex - (l.length))}
            // console.log(finalLine, index - (totalIndex - (l.length)))
            // break
        }
        finalLine++
    }
    return {} as Position
}

const headerKeywords = generateCompletions(["LAGSLAYER_CANCEL","PLAYER_EVENT","ENTITY_EVENT","PROCESS","FUNCTION","PARAM"])
const genericKeywords = generateCompletions(["if","else","repeat","in","to","on","not","while","break","continue","return","returnmult","wait","endthread","select","filter","optional","plural"])
const variableScopeKeywords = generateCompletions(["local","saved","global","line"])
const genericDomains = generateCompletions(["player","entity"])

function getDomainKeywords() {
    let result: CompletionItem[] = []
    for (const [id, domain] of Object.entries(domains.PublicDomains)) {
        let item: CompletionItem = {
            "label": id,
            "commitCharacters": [":",".","?"]
        }
        result.push(item)
    }
    return result
}

export function StartServer() {
    //==========[ setup ]=========\\

    let connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(process.stdin),
        new rpc.StreamMessageWriter(process.stdout)
    );
    connection.listen()

    let documentTracker = new DocumentTracker(connection)

    //==========[ utility functions ]=========\\

    function showText(message: string, messageType: MessageType = MessageType.Info) {
        connection.sendNotification("window/showMessage",{message: message.toString(),type: messageType})
    }

    function log(...message: string[]) {
        connection.sendNotification("window/logMessage",{message: message.join(" "), type: MessageType.Log})
    }
    
    slog = log
    
    //==========[ request handling ]=========\\

    connection.onRequest("initialize", (param) => {
        let response: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Full,
                // Tell the client that this server supports code completion.
                completionProvider: {
                    // resolveProvider: true,
                    triggerCharacters: [":",".","?"],
                }
            }
        }
        return response
    })

    connection.onRequest("textDocument/completion", async (param) => {
        let script = documentTracker.GetFileText(param.textDocument.uri)
        let line = 0
        let index = 0
        for (let i = 0; i < script.length; i++) {
            if (line == param.position.line) {
                index = i + param.position.character
                break
            }
            if (script[i] === '\n') {
                line++
            }
        }

        let lineIndexes = GetLineIndexes(script)
        let context: CodeContext = Tokenize(script,{"mode": "getContext","contextTestPosition": lineIndexes[param.position.line]+param.position.character + 1,"startFromLine": param.position.line}) as CodeContext

        let items: any[] = []
        
        if (context.Type == ContextType.General) {
            items.push(headerKeywords,variableScopeKeywords,genericKeywords,getDomainKeywords())
        }
        else if (context.Type == ContextType.DomainMethod) {
            let domain = domains.DomainList[context.Data.domain]!
            for (const [tcName, action] of Object.entries(domain.Actions)) {
                let item: CompletionItem = {
                    "label": tcName,
                    "kind": CompletionItemKind.Method,
                    "commitCharacters": [";","("]
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.DomainValue) {
            let domain = domains.DomainList[context.Data.domain]!
            if (domain.SupportsGameValues) {
                for (const [tcName, action] of Object.entries(domain.Values)) {
                    let item: CompletionItem = {
                        "label": tcName,
                        "kind": CompletionItemKind.Value,
                        "commitCharacters": [";"]
                    }
                    items.push(item)
                }
            }
        }
        else if (context.Type == ContextType.DomainCondition) {
            let domain = domains.DomainList[context.Data.domain]!
            if (domain.SupportsGameValues) {
                for (const [tcName, action] of Object.entries(domain.Conditions)) {
                    let item: CompletionItem = {
                        "label": tcName,
                        "kind": CompletionItemKind.Value,
                        "commitCharacters": ["(",")"]
                    }
                    items.push(item)
                }
            }
        }
        else if (context.Type == ContextType.String) {
            // no autocomplete entries
        }
        else if (context.Type == ContextType.EventDeclaration) {
            let eventType = context.Data.type!
            for (const [dfName, action] of Object.entries(AD.DFActionMap[`${eventType == "player" ? '' : 'entity_'}event`]!)) {
                let item: CompletionItem = {
                    "label": dfName,
                    "kind": CompletionItemKind.Function,
                    "commitCharacters": [";"]
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.SelectionAction) {
            let actionType = context.Data.type!
            for (const dfName of actionType == "select" ? CREATE_SELECTION_ACTIONS : FILTER_SELECTION_ACTIONS) {
                let item: CompletionItem = {
                    "label": AD.DFActionMap.select_obj![dfName]!.TCId,
                    "kind": CompletionItemKind.Function,
                    "commitCharacters": ["(",";"]
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.ActionTagString) {
            for (const tagName of context.Data.validValues) {
                let item: CompletionItem = {
                    "label": tagName,
                    "filterText": `" ${tagName}"`,
                    "kind": CompletionItemKind.Property,
                    "commitCharacters": ["(",";"]
                }
                if (context.Data.replaceRange) {
                    item.textEdit = {
                        "newText": `"${tagName}"`,
                        "range": {
                            "start": indexToLinePosition(script,context.Data.replaceRange[0]),
                            "end": indexToLinePosition(script,context.Data.replaceRange[1]),
                        }
                    }
                }
                else {
                    item.insertText = `"${tagName}"`
                }
                items.push(item)
            }
        }

        if (context.Data.addons) {
            if (context.Data.addons.genericDomains) { items.push(genericDomains) }
        }

        items = items.flat()

        let response: CompletionList = {
            isIncomplete: true,
            items: items
        }
        return response
    })

    //==========[ notification handling ]=========\\

    connection.onNotification("initialized",(param) => {
        showText("Terracotta language server successfully started!")
        log("Terracotta language server successfully started!")
    })
}