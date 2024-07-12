import * as rpc from "vscode-jsonrpc/node"
import * as domains from "../util/domains"
import * as AD from "../util/actionDump"
import { CompletionItem, CompletionItemKind, CompletionList, CompletionRegistrationOptions, ConnectionStrategy, InitializeResult, MarkupContent, MarkupKind, Message, MessageType, TextDocumentSyncKind, Position, InitializeParams, CompletionParams, combineNotebooksFeatures } from "vscode-languageserver";
import { CodeContext, ContextType, GetLineIndexes, Tokenize } from "../tokenizer/tokenizer";
import { DocumentTracker } from "./documentTracker";
import { CREATE_SELECTION_ACTIONS, FILTER_SELECTION_ACTIONS, REPEAT_ON_ACTIONS, VALID_PARAM_MODIFIERS, ValueType } from "../util/constants";

enum CompletionItemType {
    CodeblockAction,
    GameValue,
    EventName,
}

//function that other things can call to log to the language server output when debugging
export let slog = (...data: any[]) => {}
export let snotif = (message: string, type: MessageType = MessageType.Info) => {}

export function LinePositionToIndex(script: string, position: Position): number | null {
    let lines = script.split("\n")

    let index = 0

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (lineNum == position.line) {
            index += position.character
            return index
        }
        index += lines[lineNum].length + 1
    }

    return null
}


function generateCompletions(entries: (string)[], kind: CompletionItemKind = CompletionItemKind.Property): CompletionItem[] {
    let result: CompletionItem[] = []
    for (const v of entries) {
        let item: CompletionItem = {
            "label": v,
            "kind": kind
        }
        result.push(item)
    }
    return result
}

//try not to use this function its very slow
function indexToLinePosition(script: string,index: number): Position {
    let lines = script.split("\n")
    let finalLine: number = 0
    let totalIndex: number = 0
    for (const l of lines) {
        totalIndex += l.length + 1
        if (totalIndex >= index) {
            return {"line": finalLine, "character": 1 + index - (totalIndex - (l.length))}
        }
        finalLine++
    }
    return {} as Position
}


function getParamString(parameters: AD.Parameter[][], yesHeader: string, noHeader: string): string {
    let paramString = ""
    let paramEntries: string[] = []
    if (parameters.length == 0) {
        paramString += noHeader
    }
    else {
        paramString += yesHeader
        parameters.forEach(paramList => {
            let paramTypes: string[] = []
            paramList.forEach(param => {
                let notesString = ""
                param.notes.forEach(note => {
                    notesString += `\\\n  ⏵ ${note}`
                });
                paramTypes.push(`\`${AD.DFTypeToString[param.type]}${param.plural ? "(s)" : ""}${param.optional ? "*" : ""}\` ${(param.description + notesString).length > 0 ? "-" : ""} ${param.description}${notesString}`)
            });
            let e = paramTypes.join("\\\n **OR**\\\n")
            paramEntries.push(e)
        });
        paramString += paramEntries.join("\n\n\n\n")
    }

    return paramString
}

var paramTypeKeywords = generateCompletions(["plural","optional"],CompletionItemKind.Keyword)
var headerKeywords = generateCompletions(["LAGSLAYER_CANCEL","PLAYER_EVENT","ENTITY_EVENT","PROCESS","FUNCTION","PARAM"],CompletionItemKind.Keyword)
var genericKeywords = generateCompletions(["if","else","repeat","in","to","on","not","while","break","continue","return","returnmult","endthread","select","filter","optional","plural"],CompletionItemKind.Keyword)
genericKeywords.push({
    "label": "wait",
    "kind": CompletionItemKind.Function,
    "documentation": {
        "kind": MarkupKind.Markdown,
        "value": "kill me now"
    },
    "data": {
        "type": CompletionItemType.CodeblockAction,
        "codeblock": "control",
        "actionDFId": "Wait",
    }
})

var variableScopeKeywords = generateCompletions(["local","saved","global","line"],CompletionItemKind.Keyword)
var genericDomains = generateCompletions(["player","entity"],CompletionItemKind.Keyword)
var typeKeywords = generateCompletions(Object.keys(ValueType),CompletionItemKind.Keyword)
var forLoopActionKeywords: CompletionItem[] = []

REPEAT_ON_ACTIONS.forEach(dfId => {
    let action = AD.DFActionMap.repeat![dfId]!
    forLoopActionKeywords.push({
        "label": action.TCId,
        "kind": CompletionItemKind.Function,
        "data": {
            "type": CompletionItemType.CodeblockAction,
            "codeblock": "repeat",
            "actionDFId": dfId
        }
    } as CompletionItem)
});

function getDomainKeywords() {
    let result: CompletionItem[] = []
    for (const [id, domain] of Object.entries(domains.PublicDomains)) {
        let item: CompletionItem = {
            "label": id,
            "commitCharacters": [":",".","?"],
            "kind": CompletionItemKind.Keyword
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

    let documentTracker: DocumentTracker = new DocumentTracker(connection)

    //==========[ utility functions ]=========\\

    function showText(message: string, messageType: MessageType = MessageType.Info) {
        connection.sendNotification("window/showMessage",{message: message.toString(),type: messageType})
    }

    function log(...message: string[]) {
        connection.sendNotification("window/logMessage",{message: message.join(" "), type: MessageType.Log})
    }

    //function that does the replacing logic for string completions
    function stringizeCompletionItem(context: CodeContext,string: string,item: CompletionItem) {
        if (context.Type == ContextType.String || context.Type == ContextType.ActionTagString || context.Data.inString) {
            item.insertText = string
        }
        else {
            item.insertText = `"${string}"`
        }
        item.filterText = `"${string}"`
    }

    function getVariableCompletions(documentUri: string, context: CodeContext) {
        let document = documentTracker.Documents[documentUri]
        if (document == undefined) { return }
        let ownerFolder = document.OwnedBy

        let variables = {global: {}, saved: {}, local: {}, line: {}}
        let items: CompletionItem[] = []
        

        let nameFirstScopes: Dict<string> = {}
        let multiScopeNames: Dict<boolean> = {}
        function addvar(scope,name) {
            if (variables[scope][name] == undefined) {
                variables[scope][name] = true
            }
            if (nameFirstScopes[name] == undefined) {
                nameFirstScopes[name] = scope
            } else if (nameFirstScopes[name] != scope) {
                multiScopeNames[name] = true
            }
        }

        //if this document is owned by a folder, include all global and saved vars from that folder
        if (ownerFolder != null) {
            Object.values(ownerFolder.OwnedDocuments).forEach(doc => {
                ["global","saved"].forEach(scope => {
                    Object.keys(doc!.Variables[scope]).forEach(name => {
                        addvar(scope,name)
                    });
                });
            });
        }
        
        //include all variables from this document
        ["global","saved","local","line"].forEach(scope => {
            Object.keys(document.Variables[scope]).forEach(name => {
                addvar(scope,name)
            });
        });
        
        let scopes = ["global","saved","local","line"]
        
        if (context.Type == ContextType.VariableName) {
            scopes = [context.Data.scope]   
        }

        //generate completion items
        scopes.forEach(scope => {
            for (let name of Object.keys(variables[scope])) {
                let item: CompletionItem = {
                    "label": `${name}`,
                    "sortText": `${name} ${scope == "line" ? "a" : scope == "local" ? "b" : scope == "saved" ? "c" : "d"}`,
                    "filterText": name,
                    "kind": CompletionItemKind.Variable,
                }

                if (multiScopeNames[name] && scopes.length != 1) {
                    item.label = `${name} (${scope})`
                }

                //if name has special characters and needs ["akjhdgffkj"] syntax
                if (name.match(/[^a-z_0-9]/gi) || name.match(/^[0-9]/gi)) {
                    item.insertText = `["${name.replaceAll("\\","\\\\").replaceAll('"','\\"')}"]`
                } else {
                    item.insertText = `${name}`
                }

                if (context.Type == ContextType.VariableName) {
                    //prevent what's already typed in the doc from hogging the top of the autocomplete list
                    if (context.Data.name && context.Data.name == name) {
                        continue
                    }
                    if (context.Data.inComplex) {
                        stringizeCompletionItem(context,name,item)
                    }
                } else {
                    item.insertText = scope + " " + item.insertText
                }

                items.push(item)
            }
        })

        return items
    }
    
    slog = log
    snotif = showText
    
    //==========[ request handling ]=========\\

    connection.onRequest("initialize", (param: InitializeParams) => {
        documentTracker.Initialize(param)

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
                        didCreate: {
                            filters: [
                                {
                                    pattern: {
                                        "glob": "**/*.tc"
                                    }
                                }
                            ]
                        }
                    }
                },
                //completion
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: [":",".","?"],
                    completionItem: {
                        labelDetailsSupport: true
                    }
                }
            }
        }

        return response
    })

    connection.onRequest("completionItem/resolve", (item: CompletionItem) => {
        if (item.data == null || item.data.type == null) {return item}

        let documentation: string | undefined = undefined

        // action
        if (item.data.type == CompletionItemType.CodeblockAction) {
            let action: AD.Action = AD.DFActionMap[item.data.codeblock]![item.data.actionDFId]!
            if (action != undefined) {
                let paramString = getParamString(action.Parameters,"\n\n**Parameters:**\n\n","\n\n**No Parameters**")
                let returnString = getParamString(action.ReturnValues,"\n\n**Returns:**\n\n","")
                documentation = `${AD.DFActionMap[item.data.codeblock]![item.data.actionDFId]!.Description || "<Failed to get action description>"}${paramString}${returnString}`
            }
        }
        // game value
        else if (item.data.type == CompletionItemType.GameValue) {
            let val = AD.DFGameValueMap[item.data.valueDFId]
            if (val != undefined) {
                let description = val.Description
                let info = val.AdditionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
                let returnP = new AD.Parameter()
                returnP.type = val.DFReturnType
                returnP.description = val.ReturnDescription
                let returnType = getParamString([[returnP]],"\n\n**Returns Value:**\n\n","")
                documentation = `${description}${info}${returnType}`
            }
        }
        // event
        else if (item.data.type == CompletionItemType.EventName) {
            let event = AD.DFActionMap[item.data.codeblock]![item.data.eventDFId]
            if (event != undefined) {
                let info = event.AdditionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
                let cancelInfo = event.Cancellable ? "\n\n∅ Cancellable" : event.CancelledAutomatically ? "\n\n∅ Cancelled automatically" : ""
                documentation = `${event.Description}${info}${cancelInfo}`
            }
        }

        if (documentation !== undefined) {
            item.documentation = {
                "kind": MarkupKind.Markdown,
                "value": documentation
            }
        }

        return item
    })

    connection.onRequest("textDocument/completion", async (param: CompletionParams) => {
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
        let context: CodeContext = Tokenize(script,{"mode": "getContext","contextTestPosition": lineIndexes[param.position.line]+param.position.character + 1,"startFromLine": param.position.line, "fromLanguageServer": true}) as CodeContext

        let items: any[] = []
        
        if (context.Type == ContextType.General) {
            items.push(headerKeywords,variableScopeKeywords,genericKeywords,getDomainKeywords(),getVariableCompletions(param.textDocument.uri,context))
        }
        else if (context.Type == ContextType.DomainMethod) {
            let domain = domains.DomainList[context.Data.domain]!
            for (const [tcName, action] of Object.entries(domain.Actions)) {
                let item: CompletionItem = {
                    "label": tcName,
                    "kind": CompletionItemKind.Method,
                    "commitCharacters": [";","("],
                    "data": {
                        "type": CompletionItemType.CodeblockAction,
                        "codeblock": domain.ActionCodeblock,
                        "actionDFId": action!.DFId
                    }
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.DomainValue) {
            let domain = domains.DomainList[context.Data.domain]!
            if (domain.SupportsGameValues) {
                for (const [tcName, value] of Object.entries(domain.Values)) {
                    let item: CompletionItem = {
                        "label": tcName,
                        "kind": CompletionItemKind.Field,
                        "commitCharacters": [";"],
                        "data": {
                            "type": CompletionItemType.GameValue,
                            "valueDFId": value?.DFId
                        }
                    }
                    items.push(item)
                }
            }
        }
        else if (context.Type == ContextType.DomainCondition) {
            let domain = domains.DomainList[context.Data.domain]!
            for (const [tcName, action] of Object.entries(domain.Conditions)) {
                let item: CompletionItem = {
                    "label": tcName,
                    "kind": CompletionItemKind.Method,
                    "commitCharacters": ["(",")"],
                    "data": {
                        "type": CompletionItemType.CodeblockAction,
                        "codeblock": domain.ConditionCodeblock,
                        "actionDFId": action!.DFId
                    }
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.String || context.Type == ContextType.PureUser) {
            // no autocomplete entries
        }
        else if (context.Type == ContextType.EventDeclaration) {
            let eventType = context.Data.type!
            let codeblock = `${eventType == "player" ? '' : 'entity_'}event`
            for (const [dfName, event] of Object.entries(AD.DFActionMap[codeblock]!)) {
                let item: CompletionItem = {
                    "label": dfName,
                    "kind": CompletionItemKind.Function,
                    "commitCharacters": [";"],
                    "data": {
                        "type": CompletionItemType.EventName,
                        "codeblock": codeblock,
                        "eventDFId": event?.DFId
                    }
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
                    "commitCharacters": ["(",";"],
                    "data": {
                        "type": CompletionItemType.CodeblockAction,
                        "codeblock": "select_obj",
                        "actionDFId": AD.DFActionMap.select_obj![dfName]!.DFId
                    }
                }
                items.push(item)
            }
        }
        else if (context.Type == ContextType.ActionTagString) {
            
        }
        else if (context.Type == ContextType.TypeAssignment) {
            items.push(typeKeywords)
        }
        else if (context.Type == ContextType.ParamType) {
            items.push(typeKeywords)
            items.push(paramTypeKeywords)
        }
        else if (context.Type == ContextType.RepeatAction) {
            items.push(forLoopActionKeywords)
        }
        else if (context.Type == ContextType.VariableName) {
            items.push(getVariableCompletions(param.textDocument.uri,context))
        }

        if (context.Data.addons) {
            if (context.Data.addons.genericDomains) { items.push(genericDomains) }
            if (context.Data.addons.actionTagString) {
                for (const tagName of context.Data.addons.actionTagString) {
                    let item: CompletionItem = {
                        "label": tagName,
                        "sortText": "0000000000"+tagName,
                        "kind": CompletionItemKind.Text,
                        "commitCharacters": ["(",";"]
                    }
                    
                    stringizeCompletionItem(context,tagName,item)
    
                    items.push(item)
                }

                if (context.Data.canHaveVariable) {
                    getVariableCompletions(param.textDocument.uri,context)?.forEach(item => {
                        //make sure they appear below the tagnames
                        item.label = item.label
                        item.sortText = "zzzzzzz"+item.filterText
                        items.push(item)
                    })
                }
            }
            if (context.Data.addons.potionTypes) {
                AD.Potions.forEach(potionType => {
                    let item = {
                        "label": potionType,
                        "kind": CompletionItemKind.Text
                    }
                    
                    stringizeCompletionItem(context,potionType,item)

                    items.push(item)
                })
            }
            if (context.Data.addons.particleTypes) {
                Object.keys(AD.Particles).forEach(particleType => {
                    let item = {
                        "label": particleType,
                        "kind": CompletionItemKind.Text
                    }

                    stringizeCompletionItem(context,particleType,item)

                    items.push(item)
                })
            }
            if (context.Data.addons.particleFields) {
                let fields: string[] | null = null
                if (context.Data.addons.particleFields == "$all") {
                    fields = AD.AllParticleFields
                } else {
                    let par = AD.Particles[context.Data.addons.particleFields]
                    if (par) { fields = par.Fields }
                }
                if (fields) {
                    fields.forEach(field => {
                        let item = {
                            "label": field,
                            "kind": CompletionItemKind.Text
                        }

                        stringizeCompletionItem(context,field,item)

                        items.push(item)
                    })
                }
            }
        }

        if (context.Data.addItems) {
            items.push(context.Data.addItems)
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