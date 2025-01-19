import * as rpc from "vscode-jsonrpc/node.js"
import * as Domains from "../util/domains.ts"
import * as AD from "../util/actionDump.ts"
import { CompletionItem, CompletionItemKind, CompletionList, CompletionRegistrationOptions, ConnectionStrategy, InitializeResult, MarkupContent, MarkupKind, Message, MessageType, TextDocumentSyncKind, Position, InitializeParams, CompletionParams, combineNotebooksFeatures, SignatureHelpParams, SignatureInformation, SignatureHelp, ParameterInformation, Range, FileOperationRegistrationOptions } from "vscode-languageserver";
import { EventHeaderToken, ExpressionToken, GetLineIndexes, OperatorToken, SelectActionToken, StringToken, Tokenize, VariableToken } from "../tokenizer/tokenizer.ts";
import { DocumentTracker, TrackedDocument, TrackedItemLibrary, TrackedScript } from "./documentTracker.ts";
import { ADDITIONAL_CONSTRUCTORS, CREATE_SELECTION_ACTIONS, FILTER_SELECTION_ACTIONS, PLAYER_ONLY_GAME_VALUES, REPEAT_ON_ACTIONS, STATEMENT_KEYWORDS, VALID_BOOLEAN_OPERATORS, VALID_PARAM_MODIFIERS, ValueType } from "../util/constants.ts";
import { Dict } from "../util/dict.ts"
import { AssigneeContext, CodeContext, ConditionContext, ConstructorContext, ContextDictionaryLocation, ContextDomainAccessType, DictionaryContext, DomainAccessContext, EventContext, ForLoopContext, ListContext, NumberContext, ParameterContext, RepeatContext, SelectionContext, TagsContext, TypeContext, UserCallContext, VariableContext } from "./codeContext.ts";
import { VALID_VAR_SCOPES, VAR_SCOPE_TC_NAMES } from "../util/constants.ts";
import { FOR_LOOP_MODES } from "../util/constants.ts";
import { print } from "../main.ts";
import { ActionBlock, CodeItem, CompileLines, VariableItem } from "../compiler/codelineCompiler.ts";
import { GameValueItem } from "../compiler/codelineCompiler.ts";

enum CompletionItemType {
    SelectionAction,
    DomainAction,
    DomainCondition,
    DomainValue,
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

function scuffedContextDebugPrint(context: CodeContext) {
    let rawNames: any = []
    let l = context
    while (l.parent) {
        rawNames.unshift(l.constructor.name.replace("Context",""))
        l = l.parent
        if (!l.parent) {
            rawNames.unshift(l.constructor.name.replace("Context",""))
        }
    }

    let printResult: any[] = []
    let layer = context
    while (layer.parent) {
        let thisLayer = layer
        let name = layer.constructor.name
        let displayLayer = structuredClone(layer)
        printResult.unshift(displayLayer)
        printResult.unshift(name)
        if (layer.parent) {
            layer = layer.parent
        }
        displayLayer.parent = undefined
        displayLayer.child = undefined
    }
    slog (JSON.stringify(printResult),"\n",rawNames)
}


function generateCompletions(entries: (string)[], kind: CompletionItemKind = CompletionItemKind.Property): CompletionItem[] {
    let result: CompletionItem[] = []
    for (const v of entries) {
        let item: CompletionItem = {
            label: v,
            kind: kind
        }
        result.push(item)
    }
    return result
}

//try not to use this function its very slow
function indexToLinePosition(script: string,index: number): Position {
    let lines = script.split("\n")///\r\n|\r|\n/)//"\n")
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

// warning: this function is stupid
// the idea here is we create a dummy script with our expression token and then compile it to see what comes out
// its the objectively wrong way of coding this but that basically describes this entire codebase so i dont care
function getExpressionType(expression: ExpressionToken): string {
    /**
     * FUNCTION dummyScript;
     * line dummyVariable = expression;
     */
    let dummyScript = [
        [new EventHeaderToken([],"FUNCTION","dummyScript")],
        [new VariableToken([],"line","dummyVariable",null),new OperatorToken([],"="),expression]
    ]

    try {
        let compilationResults = CompileLines(dummyScript,{
            codeInjections: {playerEvents: {}, entityEvents: {}, functions: {}, processes: {}}, itemLibraries: {}, 
            skipConstructorValidation: true
        })
        let item: CodeItem = (compilationResults.code[1] as ActionBlock).Arguments[1]!
        if (item instanceof VariableItem) {
            return item.StoredType ?? "any"
        } else if (item instanceof GameValueItem) {
            return AD.DFGameValueMap[item.Value]!.ReturnType ?? "any"
        } else {
            return item.itemtype
        }
    } catch {
        return "any"
    }
}

// keyword aggregation
let variableScopeKeywords = generateCompletions(Object.keys(VALID_VAR_SCOPES),CompletionItemKind.Keyword)
let typeKeywords = generateCompletions(Object.keys(ValueType),CompletionItemKind.Keyword)
let paramModifierKeywords = generateCompletions(VALID_PARAM_MODIFIERS,CompletionItemKind.Keyword)
let toKeyword = {
    label: "to",
    kind: CompletionItemKind.Keyword,
}

let forLoopModeKeywords = FOR_LOOP_MODES.map(mode => {
    return {
        label: mode,
        kind: CompletionItemKind.Keyword,
        sortText: "\u0000" + mode
    }
})

let generalKeywords = generateCompletions([
    STATEMENT_KEYWORDS,
    ADDITIONAL_CONSTRUCTORS,
    VALID_BOOLEAN_OPERATORS,
].flat(),CompletionItemKind.Keyword)

let domainKeywords = Object.values(Domains.PublicDomains).map(domain => {
    return {
        label: domain!.Identifier,
        commitCharacters: [":",".","?"],
        kind: CompletionItemKind.Keyword
    }
})

let genericDomainKeywords = ["player","entity"].map(id => {
    return {
        label: id,
        commitCharacters: [":",".","?"],
        kind: CompletionItemKind.Keyword,
        sortText: "\u0000" + id
    } as CompletionItem
})

let domainMemberCompletionEntries: Dict<{
    [ContextDomainAccessType.Action]: CompletionItem[], 
    [ContextDomainAccessType.Condition]: CompletionItem[], 
    [ContextDomainAccessType.Value]: CompletionItem[], 
}> = {}
for (const domain of Object.values(Domains.DomainList)) {
    if (!domain) { continue }
    domainMemberCompletionEntries[domain.Identifier] = {
        [ContextDomainAccessType.Action]: Object.values(domain.Actions).map(action => {
            return {
                label: action?.TCId,
                kind: CompletionItemKind.Method,
                commitCharacters: [";","("],
                data: {
                    type: CompletionItemType.DomainAction,
                    domainId: domain.Identifier,
                    memberId: action?.TCId
                }
            } as CompletionItem
        }), 
        [ContextDomainAccessType.Condition]: Object.values(domain.Conditions).map(action => {
            return {
                label: action?.TCId,
                kind: CompletionItemKind.Method,
                commitCharacters: ["(",")"],
                data: {
                    type: CompletionItemType.DomainCondition,
                    domainId: domain.Identifier,
                    memberId: action?.TCId
                }
            } as CompletionItem
        }), 
        [ContextDomainAccessType.Value]: Object.values(domain.Values).map(value => {
            return {
                label: value?.TCId,
                kind: CompletionItemKind.Field,
                commitCharacters: [";"],
                data: {
                    type: CompletionItemType.DomainValue,
                    domainId: domain.Identifier,
                    memberId: value?.TCId
                }
            } as CompletionItem
        }), 
    }
}

let eventNameCompletionEntries = {
    player: [] as CompletionItem[],
    entity: [] as CompletionItem[]
}
for (const mode of ["player","entity"]) {
    for (const [dfName, event] of Object.entries(AD.DFActionMap[`${mode == "player" ? '' : 'entity_'}event`]!)) {
        let item: CompletionItem = {
            label: dfName,
            kind: CompletionItemKind.Function,
            commitCharacters: [";"],
            data: {
                type: CompletionItemType.EventName,
                eventType: mode,
                eventDFId: dfName
            }
        }
        eventNameCompletionEntries[mode].push(item)
    }
}

let selectionActionCompletionEntries = {
    select: [] as CompletionItem[],
    filter: [] as CompletionItem[]
}
for (const actionType of ["select","filter"]) {
    for (const dfName of actionType == "select" ? CREATE_SELECTION_ACTIONS : FILTER_SELECTION_ACTIONS) {
        let action = AD.DFActionMap.select_obj![dfName]!
        let item: CompletionItem = {
            label: action.TCId,
            kind: CompletionItemKind.Function,
            commitCharacters: ["(",";"],
            data: {
                type: CompletionItemType.SelectionAction,
                selectionType: actionType,
                actionDFId: dfName
            }
        }
        selectionActionCompletionEntries[actionType].push(item)
    }
}

let forOnActionCompletionEntries: CompletionItem[] = REPEAT_ON_ACTIONS.map(dfId => {
    let action = AD.DFActionMap.repeat![dfId]!
    return {
        label: action.TCId,
        kind: CompletionItemKind.Function,
        commitCharacters: ["("]
    } as CompletionItem
});


// ugly ahh function
function getParamString(parameters: AD.Parameter[], header: string, noParamsFallback: string) {
    if (parameters.length == 0) { return noParamsFallback }

    let paramStrings: string[] = []

    for (const param of parameters) {
        let groupStrings: string[] = []
        for (const group of param.Groups) {
            let valueStrings: string[] = []
            for (const value of group) {                
                // notes
                let notesString = ""
                for (const note of value.Notes) {
                    notesString += `\\\n  ⏵ ${note}`
                }

                // main string
                let pluralSuffix = value.Plural ? "(s)" : ""
                let optionalSuffix = value.Optional ? "*" : ""
                valueStrings.push(`\`${AD.DFTypeToString[value.DFType]}${pluralSuffix}${optionalSuffix}\` ${value.Description.length + notesString.length > 0 ? "-" : ""} ${value.Description}${notesString}`)
            }
            groupStrings.push(valueStrings.join("\\\n"))
        }
        paramStrings.push(groupStrings.join("\\\n **OR**\\\n"))
    }
    return header + paramStrings.join("\n\n\n\n")
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

    function getFunctionCompletions(documentUri: string, context: CodeContext): CompletionItem[] {
        let categories = 
              context instanceof UserCallContext && context.mode == "function" ? ["Functions"]
            : context instanceof UserCallContext && context.mode == "process" ?  ["Processes"]
            : ["Functions", "Processes"]
        let document = documentTracker.Documents[documentUri] as TrackedScript
        let ownerFolder = document?.OwnedBy
        if (document && ownerFolder) {
            let items: CompletionItem[] = []
            for (const category of categories) {
                items.push(...Object.keys(ownerFolder[category]).map(name => {
                    let item: CompletionItem
                    item = {
                        label: name,
                        kind: CompletionItemKind.Function,
                        commitCharacters: [";"],
                        data: {}
                    }

                    //if name has special characters and needs ["akjhdgffkj"] syntax
                    if ((name.match(/[^a-z_0-9]/gi) || name.match(/^[0-9]/gi)) && !context.inComplexName && !context.stringInfo) {
                        item.insertText = `["${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`
                    } else {
                        item.insertText = name
                    }

                    if (context instanceof UserCallContext) {
                        if (context.stringInfo || context.inComplexName) {
                            item.data.isString = true
                        }
                    } else {
                        item.insertText = (category == "Functions" ? "call " : "start ") + item.insertText
                    }

                    if (category == "Functions") {
                        item.commitCharacters?.push("(")
                    } else {
                        item.commitCharacters?.push("{")
                    }
                    
                    return item
                }))
            }
            return items
        }
        return []
    }

    function getVariableCompletions(documentUri: string, context: CodeContext) {
        let document = documentTracker.Documents[documentUri] as TrackedScript
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
                if (doc instanceof TrackedScript) {
                    ["global","saved"].forEach(scope => {
                        Object.keys(doc!.Variables[scope]).forEach(name => {
                            addvar(scope,name)
                        });
                    });
                }
            });
        }
        
        //include all variables from this document
        ["global","saved","local","line"].forEach(scope => {
            Object.keys(document.Variables[scope]).forEach(name => {
                addvar(scope,name)
            });
        });
        
        let scopes = ["global","saved","local","line"]
        
        if (context instanceof VariableContext) {
            scopes = [VAR_SCOPE_TC_NAMES[context.scope]!]
        }

        //generate completion items
        for (const scope of scopes) {
            for (let name of Object.keys(variables[scope])) {
                let item: CompletionItem = {
                    label: `${name}`,
                    sortText: `${name} ${scope == "line" ? "a" : scope == "local" ? "b" : scope == "saved" ? "c" : "d"}`,
                    filterText: name,
                    kind: CompletionItemKind.Variable,
                    data: {}
                }

                if (multiScopeNames[name] && scopes.length != 1) {
                    item.label = `${name} (${scope})`
                }

                //if name has special characters and needs ["akjhdgffkj"] syntax
                if ((name.match(/[^a-z_0-9]/gi) || name.match(/^[0-9]/gi)) && !context.inComplexName && !context.stringInfo) {
                    item.insertText = `["${name.replaceAll("\\","\\\\").replaceAll('"','\\"')}"]`
                } else {
                    item.insertText = `${name}`
                }

                if (context instanceof VariableContext) {
                    //prevent what's already typed in the doc from hogging the top of the autocomplete list
                    if ((context.name && context.name == name) || (context.stringInfo && context.stringInfo.value == name)) {
                        continue
                    }
                    if (context.stringInfo || context.inComplexName) {
                        item.data.isString = true
                    }
                } else {
                    item.insertText = scope + " " + item.insertText
                }
                items.push(item)
            }
        }

        return items
    }
    
    slog = log
    snotif = showText
    
    //==========[ request handling ]=========\\

    connection.onRequest("initialize", (param: InitializeParams) => {
        documentTracker.Initialize(param)

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
                //completion
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: [":",".","?",'"',"'"],
                    completionItem: {
                        labelDetailsSupport: true
                    }
                },
                //function signature
                signatureHelpProvider: {
                    triggerCharacters: [",","(","["],
                },
            }
        }

        return response
    })

    connection.onRequest("textDocument/signatureHelp",(param: SignatureHelpParams) => {
        let previouslySelectedSignature = param.context?.activeSignatureHelp?.activeSignature
        let script = documentTracker.GetFileText(param.textDocument.uri)

        let lineIndexes = GetLineIndexes(script)
        let context: CodeContext = Tokenize(script,{"mode": "getContext","contextTestPosition": lineIndexes[param.position.line]+param.position.character + 1,"startFromLine": param.position.line, "fromLanguageServer": true}) as CodeContext

        //travel up the context tree until an arguments list context is found
        while (context.parent) {
            if (context instanceof ListContext && (context.parent instanceof UserCallContext || context.parent instanceof DomainAccessContext || context.parent instanceof ConstructorContext || context.parent instanceof SelectionContext)) {
                break
            }
            context = context.parent
        }
        if (!(context instanceof ListContext)) { return }

        let paramData: AD.Parameter[] = []

        //check if this call is in an assignee
        let isAssignee = false
        let level: CodeContext = context
        while (level?.parent) {
            if (level instanceof AssigneeContext || (level instanceof ForLoopContext && level.mode == "in")) {
                isAssignee = true
                break
            }
            level = level.parent
        }

        //get signature data from context
        let prefix: string = ""
        let tagAmount: number = 0
        if (context.parent instanceof DomainAccessContext) {
            prefix = context.parent.name + "("
            let action = Domains.DomainList[context.parent.domainId]?.[context.parent.type == ContextDomainAccessType.Condition ? "Conditions" : "Actions"]?.[context.parent.name!]
            if (action) {
                tagAmount = Object.keys(action.Tags).length
                paramData = action.Parameters
            } else { return }
        } else if (context.parent instanceof SelectionContext) {
            prefix = context.parent.type + " " + context.parent.action + "("
            let action = AD.TCActionMap.select_obj![context.parent.action!]
            if (action) {
                tagAmount = Object.keys(action.Tags).length
                paramData = action.Parameters
            } else { return }
        } else if (context.parent instanceof UserCallContext) {
            let category = context.parent.mode == "function" ? "Functions" : "Processes"
            let document = documentTracker.Documents[param.textDocument.uri] as TrackedScript
            let ownerFolder = document?.OwnedBy
            prefix = context.parent.name + "("
            if (document && ownerFolder && ownerFolder[category][context.parent.name]) {
                paramData = ([...ownerFolder[category][context.parent.name]?.values()][0] as TrackedScript).FunctionSignature
            } else {
                return
            }
        } else if (context.parent instanceof ConstructorContext) {
            prefix = context.parent.name + "["
            paramData = AD.ConstructorSignatures[context.parent.name]
        } else {
            return
        }

        
        // create a unique signature for every possible combination of arguments
        let uniqueSignatures: AD.ParameterValue[][] = [[]]
        for (const parameter of paramData) {
            let groupIndex = -1
            let initialSignatureAmount = uniqueSignatures.length
            for (const group of parameter.Groups) {
                let values = [...group]
                //if being assigned to a variable, exclude first var param from signature
                if (values[0].DFType == "VARIABLE" && values[0].Description == "Variable to set" && isAssignee) {
                    values.shift()
                    if (values.length == 0) {
                        continue
                    }
                }

                groupIndex++
                for (let i = 0; i < initialSignatureAmount; i++) {
                    if (groupIndex == parameter.Groups.length - 1) {
                        uniqueSignatures[i].push(...values)
                    } else {
                        uniqueSignatures.push([...uniqueSignatures[i], ...values])
                    }
                }
            }
        }

        // build the signature infos
        let signatureInfos: SignatureInformation[] = []
        for (const signature of uniqueSignatures) {
            let info = {
                parameters: [],
                label: ""
            } as SignatureInformation

            let valueStrings: string[] = []

            for (const value of signature) {
                let valueString: string
                if (value.DFType == "NONE") {
                    if (value.Description.endsWith(")")) {value.Description = value.Description.substring(0,value.Description.length-1)}
                    valueString = `Empty Slot${value.Description ? " - " + value.Description : ""}`
                } else {
                    valueString = `${value.Description}: ${AD.DFTypeToTC[value.DFType]}${value.Plural ? "(s)" : ""}${value.Optional ? "*" : ""}`
                }
                info.parameters!.push({label: valueString, documentation: value.Notes.join("\n")})
                valueStrings.push(valueString)
            }

            info.label = valueStrings.join(", ")
            info.label = prefix + info.label + (context.parent instanceof ConstructorContext ? "]" : `)${tagAmount > 0 ? ` + ${tagAmount} tag${tagAmount > 1 ? "s" : ""}` : ""}`)
            signatureInfos.push(info)

            let activeParameter: number = 0
            for (let i = 0; i < context.elementIndex; i++) {
                //always highlight the final parameter if its plural
                if (i == signature.length-1 && signature[signature.length-1].Plural) {
                    break
                }
                activeParameter++
            }
            info.activeParameter = activeParameter
        }

        // figure out which signature should be displayed first based on what arguments
        // are present earlier in the list
        let activeSignature = 0
        let candidateIndexes = [...Array(uniqueSignatures.length).keys()]
        candidateLoop: for (let elementIndex = 0; elementIndex < context.elementIndex; elementIndex++) {
            let expression = context.prevoiusElements[elementIndex]
            let candidatesToRemove: number[] = []

            if (candidateIndexes.length <= 1) { break }
            
            let i = -1
            for (const signatureIndex of candidateIndexes) {
                i++
                let signature = uniqueSignatures[signatureIndex]
                if (
                    signature.length < elementIndex ||
                    signature[signature.length - 1].DFType == "NONE" ||
                    expression && AD.DFTypeToTC[signature[elementIndex].DFType] != getExpressionType(expression)
                ) {
                    if (candidateIndexes.length - candidatesToRemove.length > 1) {
                        candidatesToRemove.push(i)
                    } else {
                        activeSignature = signatureIndex
                        break candidateLoop
                    }
                } else {
                    activeSignature = signatureIndex
                }
            }
            for (const index of candidatesToRemove) {candidateIndexes.splice(index,1)}
        }
        //never put the "NONE" signature as the top result since thats usually not what you want
        if (uniqueSignatures[activeSignature][uniqueSignatures[activeSignature].length - 1]?.DFType == "NONE") {
            activeSignature += 1
            if (activeSignature > uniqueSignatures.length - 1) {
                activeSignature = 0
            }
        }

        return {
            signatures: signatureInfos,
            activeSignature: activeSignature
        } as SignatureHelp
    }) 

    connection.onRequest("completionItem/resolve", (item: CompletionItem) => {
        if (!item.data) { return item }
        var itemType: CompletionItemType = item.data.type

        let domain: Domains.Domain
        if (item.data.domainId) {domain = Domains.DomainList[item.data.domainId]!}

        let documentation: string = ""
        // domain action
        if (itemType == CompletionItemType.DomainAction || itemType == CompletionItemType.DomainCondition || itemType == CompletionItemType.SelectionAction) {
            let action: AD.Action = 
                itemType == CompletionItemType.SelectionAction ? AD.DFActionMap.select_obj![item.data.actionDFId]!
                : domain![itemType == CompletionItemType.DomainAction ? "Actions" : "Conditions"][item.data.memberId]!
            if (!action) { return item }

            let paramString = getParamString(action.Parameters,"\n\n**Parameters:**\n\n","\n\n**No Parameters**")
            let infoString = action.AdditionalInfo.join("\\\n  ⏵ "); if (infoString) {infoString = "\\\n  ⏵ " + infoString}

            let worksWithString = ""
            if (action.WorksWith.length > 0) {
                worksWithString = "\n\n**Works with:**\n\n  ⏵ " + action.WorksWith.join("\\\n  ⏵ ")
            }

            let tagsString = ""
            if (Object.keys(action.Tags).length > 0) {
                tagsString = "\n\n**Tags:**"
                for (const tag of Object.values(action.Tags)) {
                    tagsString += `\\\n\`${tag?.Name}\` - ${tag?.Options.map(v => `"${v}"`).join(", ")}`
                }
            }

            let returnString = getParamString(action.ReturnValues,"\n\n**Returns:**\n\n","")
            

            documentation = `${action.Description}${infoString}${worksWithString}${paramString}${tagsString}${returnString}`
        }
        // game value
        else if (itemType == CompletionItemType.DomainValue) {
            let val = domain!.Values[item.data.memberId]
            if (!val) { return item }
            
            let description = val.Description
            let info = val.AdditionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
            let worksWithString = ""
            if (val.WorksWith.length > 0) {
                worksWithString = "\n\n**Works with:**\n\n  ⏵ " + val.WorksWith.join("\\\n  ⏵ ")
            }

            //creating a parameter object so that it can work with the existing string gen is kinda a hack but whatever
            let returnV = new AD.ParameterValue()
            returnV.DFType = val.DFReturnType
            returnV.Description = val.ReturnDescription
            let returnP = new AD.Parameter()
            returnP.Groups[0] = [returnV]
            let returnType = getParamString([returnP],"\n\n**Returns Value:**\n\n","")

            documentation = `${description}${worksWithString}${info}${returnType}`
        }
        else if (item.data.type == CompletionItemType.EventName) {
            let event = AD.DFActionMap[`${item.data.eventType == "player" ? '' : 'entity_'}event`]![item.data.eventDFId]
            if (!event) { return item }
            let info = event.AdditionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
            let cancelInfo = event.Cancellable ? "\n\n∅ Cancellable" : event.CancelledAutomatically ? "\n\n∅ Cancelled automatically" : ""
            documentation = `${event.Description}${info}${cancelInfo}`
        }
        
        if (documentation === "") { return item }

        item.documentation = {
            kind: "markdown",
            value: documentation
        }
        return item
    })

    connection.onRequest("textDocument/completion", async (param: CompletionParams) => {
        let script = documentTracker.GetFileText(param.textDocument.uri)

        let lineIndexes = GetLineIndexes(script)
        let context: CodeContext = Tokenize(script,{"mode": "getContext","contextTestPosition": lineIndexes[param.position.line]+param.position.character + 1,"startFromLine": param.position.line, "fromLanguageServer": true}) as CodeContext

        let includeGeneralKeywords = true
        let items: (CompletionItem | CompletionItem[])[] = []
        
        if (context instanceof DomainAccessContext) {
            includeGeneralKeywords = false
            items.push(domainMemberCompletionEntries[context.domainId]![context.type])
        } 
        else if (context instanceof EventContext) {
            includeGeneralKeywords = false
            items.push(eventNameCompletionEntries[context.mode])
        }
        else if (context instanceof SelectionContext) {
            includeGeneralKeywords = false
            items.push(selectionActionCompletionEntries[context.type])
        }
        else if (context instanceof ConditionContext) {
            if (context.parent instanceof SelectionContext) {
                items.push(genericDomainKeywords)
            }
        }
        else if (context instanceof TypeContext) {
            includeGeneralKeywords = false
            items.push(typeKeywords)
            if (context.parent instanceof ParameterContext) {
                items.push(paramModifierKeywords)
            }
        } 
        else if (context instanceof ForLoopContext) {
            if (context.mode == undefined && context.variables.length > 0) {
                items.push(forLoopModeKeywords)
            } else if (context.mode == "on") {
                includeGeneralKeywords = false
                items.push(forOnActionCompletionEntries)
            }
        }
        else if (context instanceof RepeatContext) {
            items.push(toKeyword)
        }
        else if (context instanceof NumberContext || context instanceof ParameterContext) {
            includeGeneralKeywords = false
        }
        else if (context instanceof VariableContext) {
            includeGeneralKeywords = false
            items.push(getVariableCompletions(param.textDocument.uri,context)!)
        }
        else if (context instanceof TagsContext) {
            includeGeneralKeywords = false
            let accessContext = (context.parent as DomainAccessContext)
            let domain = Domains.DomainList[accessContext.domainId]
            if (domain && accessContext.name) {
                let action = domain[accessContext.type == ContextDomainAccessType.Action ? "Actions" : "Conditions"][accessContext.name] as AD.Action
                if (action) {
                    // tag names
                    if (context.in == ContextDictionaryLocation.Key) {
                        for (const tag of Object.values(action.Tags)) {
                            items.push({
                                label: tag?.Name!,
                                data: {isString: true},
                                sortText: "\u0000" + tag?.Name,
                                documentation: {
                                    kind: "markdown",
                                    value: `**Default value:** \`${tag?.Default}\``
                                }
                            })
                        }
                    }
                    //tag values
                    else if (context.keyName) {
                        let tag = action.Tags[context.keyName]
                        if (tag) {
                            let i = -1
                            for (const option of tag.Options) {
                                i++
                                items.push({
                                    label: option!,
                                    data: {isString: true},
                                    sortText: "\u0000" + option,
                                    documentation: tag.OptionDescriptions[i]
                                })
                            }
                        }
                        if (!context.isVariable) {
                            items.push(variableScopeKeywords,getVariableCompletions(param.textDocument.uri,context)!)
                        }
                    }
                }
            }
        }
        else if (context instanceof ListContext) {
            if (context.parent instanceof ConstructorContext) {
                let constructor = context.parent.name
                let values: string[] = []
                if (constructor == "pot") {
                    if (context.elementIndex == 0) { values = AD.Potions }
                } else if (constructor == "par") {
                    if (context.elementIndex == 0) { values = Object.keys(AD.Particles) }
                } else if (constructor == "snd") {
                    if      (context.elementIndex == 0) { values = [...AD.Sounds.keys()] }
                    else if (context.elementIndex == 3) { 
                        //try to get sound id from first list arg
                        if (context.prevoiusElements.length >= 1 && context.prevoiusElements[0]?.Expression[0] instanceof StringToken) {
                            let soundID = context.prevoiusElements[0]?.Expression[0].String

                            values = AD.SoundVariants[AD.SoundInternalIds[soundID!]!] ?? []
                        }
                    }
                } else if (constructor == "litem") {
                    let document = documentTracker.Documents[param.textDocument.uri] as TrackedScript
                    let ownerFolder = document?.OwnedBy
                    if (document && ownerFolder) {
                        if (context.elementIndex == 0) { 
                            values = Object.keys(ownerFolder.Libraries)
                        } else if (context.elementIndex == 1) {
                            //try to get lib id from first list arg
                            if (context.prevoiusElements.length >= 1 && context.prevoiusElements[0]?.Expression[0] instanceof StringToken) {
                                let libraryId = context.prevoiusElements[0]?.Expression[0].String
                                let library = [...ownerFolder.Libraries[libraryId]?.values()!][0] as TrackedItemLibrary
                                if (library) {
                                    values = library.ItemIds
                                }
                            }
                        }
                    }
                } else if (constructor == "item") {
                    if (context.elementIndex == 0) {
                        values = [...AD.ItemMaterialIds.values()]
                    }
                }
                items.push(values.map(item => {
                    return {
                        label: item,
                        kind: CompletionItemKind.Text,
                        data: {isString: true},
                        sortText: "\u0000\u0000\u0000\u0000\u0000"+item
                    }
                }))
            }
        }
        else if (context instanceof UserCallContext) {
            includeGeneralKeywords = false
            items.push(getFunctionCompletions(param.textDocument.uri,context))
        }
        else if (context instanceof DictionaryContext) {
            // particle fields
            if (context.parent instanceof ListContext && context.parent.parent instanceof ConstructorContext) {
                let listContext = context.parent
                let constructorContext = listContext.parent as ConstructorContext

                if (constructorContext.name == "par" && listContext.elementIndex == 1) {
                    //try to get particle id from first list arg
                    let particleID: string | undefined
                    if (listContext.prevoiusElements.length >= 1 && listContext.prevoiusElements[0]?.Expression[0] instanceof StringToken) {
                        particleID = listContext.prevoiusElements[0]?.Expression[0].String
                    }

                    let particleData = AD.Particles[particleID ?? ""]
                    let fields: string[] = particleData?.Fields ?? AD.AllParticleFields

                    for (const field of fields) {
                        items.push({
                            label: field,
                            kind: CompletionItemKind.Text,
                            data: {isString: true},
                            sortText: "\u0000\u0000\u0000\u0000\u0000"+field
                        })
                    }
                }
            }
        }

        if (includeGeneralKeywords) {
            items.push(generalKeywords, variableScopeKeywords, domainKeywords, getVariableCompletions(param.textDocument.uri,context)!, getFunctionCompletions(param.textDocument.uri,context))
        }
        
        scuffedContextDebugPrint(context)
        
        items = items.flat()

        //modify string completion items to work different whether the cursor is in a string or not
        if (context.stringInfo) {
            let range: Range
            let startPos: Position = indexToLinePosition(script,context.stringInfo.startIndex) 
            //dont bother getting end index if its not necessary
            let endPos: Position | undefined = !context.stringInfo.unclosed ? indexToLinePosition(script,context.stringInfo.endIndex+1) : undefined

            items = (items as CompletionItem[]).filter(item => {
                if (item.data?.isString) {
                    item.filterText = context.stringInfo?.openingChar + item.label + context.stringInfo?.openingChar
                    item.textEdit = {
                        range: 
                            context.stringInfo?.unclosed ? {start: startPos, end: {line: startPos.line, character: param.position.character}}
                            : {start: startPos, end: endPos!}    
                        ,
                        newText: context.stringInfo?.openingChar + item.label + context.stringInfo?.openingChar
                    }
                }
                return (item.data && item.data.isString) 
            })
        } else {
            for (const item of (items as CompletionItem[])) {
                if (item.data?.isString) {
                    item.insertText = `${param.context?.triggerCharacter == "?" ? " " : ""}"${item.label}"`
                    item.filterText = `${param.context?.triggerCharacter == "?" ? " " : ""}${item.filterText ?? item.label}`
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

    //==========[ notification handling ]=========\\

    connection.onNotification("initialized",(param) => {
        showText("Terracotta language server successfully started!")
        log("Terracotta language server successfully started!")
    })
}