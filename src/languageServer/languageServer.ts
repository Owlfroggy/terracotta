import * as rpc from "vscode-jsonrpc/node"
import * as domains from "../util/domains"
import * as AD from "../util/actionDump"
import { CompletionItem, CompletionItemKind, CompletionList, CompletionRegistrationOptions, InitializeResult, MarkupContent, MarkupKind, MessageType, TextDocumentSyncKind } from "vscode-languageserver";
import { CodeContext, ContextType, Tokenize } from "../tokenizer/tokenizer";
import { DocumentTracker } from "./documentTracker";

function generateCompletionMap(entries: (string)[]): CompletionItem[] {
    let result: CompletionItem[] = []
    for (const v of entries) {
        let item: CompletionItem = {
            "label": v
        }
        result.push(item)
    }
    return result
}

const headerKeywords = generateCompletionMap(["LAGSLAYER_CANCEL","PLAYER_EVENT","ENTITY_EVENT","PROCESS","FUNCTION","PARAM"])
const genericKeywords = generateCompletionMap(["if","else","repeat","in","to","on","not","while","break","continue","return","returnmult","wait","endthread","select","filter","optional","plural"])
const variableScopeKeywords = generateCompletionMap(["local","saved","global","line"])

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
    
    //==========[ request handling ]=========\\

    connection.onRequest("initialize", (param) => {
        let response: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Full,
                // Tell the client that this server supports code completion.
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: [":","."],
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


        showText(`EChar: ${index}:'${script[index]} | ${JSON.stringify(param)} | "${script}" | ${line}`)
        let context: CodeContext = Tokenize(script,{"mode": "getContext","contextTestPosition": index}) as CodeContext
        showText(`Char: ${index}:'${script[index]}'\nContext: ${JSON.stringify(context)}`)

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
        else if (context.Type == ContextType.String) {
            // no autocomplete entries
        }
        else if (context.Type == ContextType.EventDeclaration) {
            let eventType = context.Data.type!
            showText(eventType)
            for (const [dfName, action] of Object.entries(AD.DFActionMap[`${eventType == "player" ? '' : 'entity_'}event`]!)) {
                let item: CompletionItem = {
                    "label": dfName,
                    "kind": CompletionItemKind.Function,
                    "commitCharacters": [";"]
                }
                items.push(item)
            }
        }

        items = items.flat()

        let response: CompletionList = {
            isIncomplete: false,
            items: items
        }
        return response
    })

    //==========[ notification handling ]=========\\

    connection.onNotification("initialized",(param) => {
        showText("Terracotta server successfully started!")
    })
}