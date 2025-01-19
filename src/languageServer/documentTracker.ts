import * as rpc from "vscode-jsonrpc"
import * as fs from "node:fs/promises"
import * as AD from "../util/actionDump.ts";
import { DescriptionHeaderToken, EventHeaderToken, ParamHeaderToken, Tokenize, TokenizerResults, VariableToken } from "../tokenizer/tokenizer.ts"
import { ChangeAnnotation, CreateFilesParams, DeleteFilesParams, DidChangeTextDocumentParams, DidChangeWatchedFilesParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams, DidRenameFilesNotification, DocumentLinkResolveRequest, DocumentUri, FileChangeType, InitializeParams, MessageType, RenameFilesParams, TextDocumentContentChangeEvent } from "vscode-languageserver"
import { LinePositionToIndex, slog, snotif } from "./languageServer.ts"
import { Dict } from "../util/dict.ts"
import { fileURLToPath, pathToFileURL, URL } from "node:url"
import { getAllFilesInFolder } from "../util/utils.ts";

function fixUriComponent(str: string): string {
    return encodeURIComponent(str).replaceAll("%2F","/")
}

function printvars(vars: VariableTable) {
    let str = "";
    ["global","saved","local","line"].forEach(scope => {
        let varnames: string[] = []
        Object.values(vars[scope]).forEach(variable => {
            varnames.push((variable as TrackedVariable).Name)
        })
        let varstr = "<none>"
        if (varnames.length > 0) { varstr = JSON.stringify(varnames) }
        str += `${str == "" ? "" : "\n"}> ${scope}: ${varstr}`
    });
    slog (str)
}

export type VariableTable = {global: Dict<TrackedVariable>, saved: Dict<TrackedVariable>, local: Dict<TrackedVariable>, line: Dict<TrackedVariable>}
export type VariableScope = "global" | "saved" | "local" | "line"

//every tracked variable should have EXACTLY ONE instance of this class
//and all the places that need to keep track of tracked variables should reference that instance

export class TrackedDocument {
    constructor(uri: string, parent: DocumentTracker) {
        this.Uri = uri
        this.ParentTracker = parent
    }

    //the document tracker that this document tracker is a part of
    ParentTracker: DocumentTracker

    Uri: string
    Text: string
    
    
    //whether or not this document is open in the editor
    IsOpen: Boolean = false
    //only used if the document is opened
    Version: number = 0

    //all folders that this document is a descendant of
    AncestorFolders: Dict<TrackedFolder> = {}
    //the tracker that has authority over this document
    OwnedBy: TrackedFolder | null = null


    ApplyChanges(param: DidChangeTextDocumentParams | null = null, forEachChangeCallback: ((change: TextDocumentContentChangeEvent, startIndex: number, endIndex: number) => void) | null = null) {
        if (param === null) { return }
        this.Version = param.textDocument.version

        param.contentChanges.forEach(change => {
            if (TextDocumentContentChangeEvent.isIncremental(change)) {
                //= update text =\\
                let startIndex = LinePositionToIndex(this.Text,change.range.start)!
                let endIndex = LinePositionToIndex(this.Text,change.range.end)!
                this.Text = this.Text.substring(0,startIndex) + change.text + this.Text.substring(endIndex);
    
                if (forEachChangeCallback) {
                    forEachChangeCallback(change,startIndex,endIndex)
                }
            } else {
                this.Text = change.text
                if (forEachChangeCallback) {
                    forEachChangeCallback(change,0,change.text.length)
                }
            }
        });
    }

    Open(info: {text: string, version: number}) {
        this.IsOpen = true
        if (info.version > this.Version) {
            this.Version = info.version
            this.Text = info.text
        }
    }

    Close() {
        this.IsOpen = false
    }

    Create() {

    }

    Remove() {
        Object.values(this.AncestorFolders).forEach(folder => {
            delete folder?.Documents[this.Uri]
            delete folder?.OwnedDocuments[this.Uri]
        });
        
        this.OwnedBy = null

        delete this.ParentTracker.Documents[this.Uri]
    }

    Rename(newUri: string,oldUri: string) {
        this.Uri = newUri

        //update in master doc list
        delete this.ParentTracker.Documents[oldUri]
        this.ParentTracker.Documents[newUri] = this
        
        //update in folders
        this.UpdateOwnership(oldUri)
    }

    //updates ownership info, including on FolderTrackers
    //if owneship is changing due to a rename, provide oldUri
    UpdateOwnership(oldUri: string | null = null) {
        Object.keys(this.AncestorFolders).forEach(key => {
            let folder = this.AncestorFolders[key]!
            delete folder.Documents[oldUri || this.Uri]
            delete this.AncestorFolders[key]
        });

        if (this.OwnedBy != null) {
            if (oldUri) {
                delete this.OwnedBy.OwnedDocuments[oldUri]
            }
            this.OwnedBy = null
        }

        //if you have this many nested folders and the language server breaks because of it, you are no longer allowed to use terracotta
        let shortestOwnerLength = 29342342395823923
        let docSplitPath = new URL(this.Uri).pathname.split("/")
        

        Object.values(this.ParentTracker.Folders).forEach(folder => {
            folder = folder! //shut the hell up about undefined nobody asked!!!!
            let folderPathName = new URL(folder.Uri).pathname
            let folderSplitPath = folderPathName.split("/")
            //only consider if the folder is an ancestor of this document
            if (docSplitPath.slice(0,folderSplitPath.length).join("/") == folderPathName) {
                this.AncestorFolders[folder.Uri] = folder
                folder.Documents[this.Uri] = this
                //the folder highest up the tree is the one given ownership of the document
                if (folderSplitPath.length < shortestOwnerLength) {
                    if (this.OwnedBy) {
                        this.OwnedBy.OwnedDocuments[this.Uri] = undefined
                    }
                    this.OwnedBy = folder
                    folder.OwnedDocuments[this.Uri] = this
                    shortestOwnerLength = folderSplitPath.length
                }
            }
        });
    }
}

export class TrackedItemLibrary extends TrackedDocument {
    Id: string
    ItemIds: string[] = []

    private cleanupTracking() {
        if (this.OwnedBy && this.OwnedBy.Libraries[this.Id]) {
            this.OwnedBy.Libraries[this.Id]?.delete(this)
            if (this.OwnedBy.Libraries[this.Id]?.size == 0) {
                delete this.OwnedBy.Libraries[this.Id]
            }
        }
    }

    UpdateOwnership(oldUri?: string | null, newId?: string): void {
        //remove from old location
        this.cleanupTracking()

        if (newId) {
            this.Id = newId
        }
        super.UpdateOwnership(oldUri)
        
        //add to new location
        if (this.OwnedBy) {
            if (!this.OwnedBy.Libraries[this.Id]) {
                this.OwnedBy.Libraries[this.Id] = new Set()
            }
            this.OwnedBy.Libraries[this.Id]?.add(this)
        }
    }

    Remove(): void {
        this.cleanupTracking()
        super.Remove()
    }

    ApplyChanges(param): void {
        super.ApplyChanges(param)
        try {
            let contents = JSON.parse(this.Text)
            if (!contents.id) { return }
            if (!contents.items) { return }
            this.ItemIds = Object.keys(contents.items)
            this.UpdateOwnership(this.Uri,contents.id)
        } catch {}
    }
}

export class TrackedVariable {
    constructor(scope: VariableScope, name: string, parent: DocumentTracker) {
        this.ParentTracker = parent
        this.Scope = scope
        this.Name = name
    }

    //the document tracker that this variable is a part of
    ParentTracker: DocumentTracker

    readonly Scope: VariableScope
    readonly Name: string

    //key: uri of the document this variable is in
    //value: the number of times this variable appears in that document
    InDocuments: Dict<number> = {}

    TryUntrack() {
        if (Object.keys(this.InDocuments).length == 0) {
            delete this.ParentTracker.Variables[this.Scope][this.Name]
        }
    }
}

export class TrackedScript extends TrackedDocument {
    //variables that are in this document
    Variables: VariableTable = {global: {}, saved: {}, local: {}, line: {}}
    //key = line number, value = array of variables that exist on that line
    //if there are no variables on a line, it will not have an entry in this table
    VariablesByLine: TrackedVariable[][] = []

    HeaderCategory: "Functions" | "Processes" | undefined
    CodeLineType: "PLAYER_EVENT" | "ENTITY_EVENT" | "PROCESS" | "FUNCTION" | undefined
    CodeLineName: string | undefined
    FunctionSignature: AD.Parameter[]
    FunctionDescription: string

    private lines: number = 0

    private cleanupTracking() {
        if (this.HeaderCategory && this.CodeLineName && this.OwnedBy && this.OwnedBy[this.HeaderCategory][this.CodeLineName]) {
            this.OwnedBy[this.HeaderCategory][this.CodeLineName]?.delete(this)
            if (this.OwnedBy[this.HeaderCategory][this.CodeLineName]?.size == 0) {
                delete this.OwnedBy[this.HeaderCategory][this.CodeLineName]
            }
        }
    }

    // to set newName or newCodeblock to undefined, pass in null
    // do NOT question why
    UpdateOwnership(oldUri?: string | null, newName: string | null | false = null, newCodeblock: "PLAYER_EVENT" | "ENTITY_EVENT" | "PROCESS" | "FUNCTION" | null | false = null): void {
        //remove from old location
        this.cleanupTracking()
        
        if (newName !== null) {
            this.CodeLineName = newName == false ? undefined : newName
        }
        if (newCodeblock !== null) {
            this.CodeLineType = newCodeblock == false ? undefined : newCodeblock
            this.HeaderCategory = this.CodeLineType == "FUNCTION" ? "Functions" : this.CodeLineType == "PROCESS" ? "Processes" : undefined
        }
        super.UpdateOwnership(oldUri)
        
        //add to new location
        if (this.CodeLineType && this.CodeLineName && this.CodeLineName.length > 0) {
            if (this.HeaderCategory && this.OwnedBy) {
                if (!this.OwnedBy[this.HeaderCategory][this.CodeLineName]) {
                    this.OwnedBy[this.HeaderCategory][this.CodeLineName] = new Set()
                }
                this.OwnedBy[this.HeaderCategory][this.CodeLineName]?.add(this)
            }
        }
    }

    //yeah i've kinda given up on the names
    DealWithRemovedVariableLine(line: TrackedVariable[]) {
        if (line == undefined) { return }
        line.forEach(variable => {
            if (variable.InDocuments[this.Uri] !== undefined) {
                //why do must i ! it?? it says ^^^^^^^^^^^^^ literally right there that it cannot be undefined!!! grrrrrrrr
                //(maybe typescript just forgot its glasses)
                variable.InDocuments[this.Uri]! -= 1
                if (variable.InDocuments[this.Uri]! <= 0) {
                    delete this.Variables[variable.Scope][variable.Name]
                    
                    delete variable.InDocuments[this.Uri]
                    variable.TryUntrack()
                }
            }
        })
    }

    UpdateVariables(topLine: number, bottomLine: number) {
        let lineVariableInfo = Tokenize(this.Text,{mode: "getVariables", startFromLine: bottomLine, goUntilLine: topLine, fromLanguageServer: true}) as Dict<VariableToken[]>
        for (let [lineString, vars] of Object.entries(lineVariableInfo)) {
            let lineNum = Number(lineString)
            //remove old line state
            if (this.VariablesByLine[lineNum]) {
                this.DealWithRemovedVariableLine(this.VariablesByLine[lineNum])
                this.VariablesByLine[lineNum].length = 0
            }
            
            //apply new line state
            if (vars != null && vars.length > 0) {
                this.VariablesByLine[lineNum] = []
                vars.forEach(varToken => {
                    let trackedVar = this.ParentTracker.AccessVariable(varToken.Scope,varToken.Name)
                    
                    this.VariablesByLine[lineNum]!.push(trackedVar)
                    
                    if (trackedVar.InDocuments[this.Uri] == undefined) {
                        trackedVar.InDocuments[this.Uri] = 0
                    }

                    trackedVar.InDocuments[this.Uri]! += 1
                    
                    if (this.Variables[trackedVar.Scope][trackedVar.Name] == undefined) {
                        this.Variables[trackedVar.Scope][trackedVar.Name] = trackedVar
                    }
                })
            } else {
                delete this.VariablesByLine[lineNum]
            }
        }
    }

    UpdateHeaders() {
        let headers = Tokenize(this.Text,{mode: "getHeaders", fromLanguageServer: true}) as TokenizerResults

        let eventHeaderDone = false;
        let heldDescription: string | undefined = undefined

        let signature: AD.Parameter[] = []

        for (const line of headers.Lines) {
            for (const header of line) {
                if (header instanceof EventHeaderToken && !eventHeaderDone) {
                    eventHeaderDone = true
                    if (header.Event != this.CodeLineName || header.Codeblock != this.CodeLineType) {
                        this.UpdateOwnership(null,header.Event ?? false,(header.Codeblock ?? false) as any)
                    }
                    if (heldDescription) {
                        this.FunctionDescription = heldDescription
                        heldDescription = undefined
                    }
                } else if (header instanceof ParamHeaderToken) {
                    let type = header.Type || "any"
                    signature.push(new AD.Parameter([
                        [new AD.ParameterValue(AD.TCTypeToDF[type],header.Name,header.Optional,header.Plural,heldDescription ? [heldDescription] : [])]
                    ]))
                    heldDescription = undefined
                } else if (header instanceof DescriptionHeaderToken) {
                    heldDescription = header.Description
                }
            }
        }

        if (!eventHeaderDone && (this.CodeLineName || this.CodeLineType)) {
            this.UpdateOwnership(null,false,false)
        }
        this.FunctionSignature = signature
    }

    ApplyChanges(param: DidChangeTextDocumentParams, forEachChangeCallback: (change: TextDocumentContentChangeEvent, startIndex: number, endIndex: number) => void = () => {}) {
        super.ApplyChanges(param, (change: TextDocumentContentChangeEvent, startIndex: number, endIndex: number) => {
            if (TextDocumentContentChangeEvent.isIncremental(change)) {
                //= update variables =\\
                //remove lines that were removed in the change
                let removedLines = this.VariablesByLine.splice(change.range.start.line,change.range.end.line - change.range.start.line + 1)
    
                removedLines.forEach((line: TrackedVariable[]) => {
                    this.DealWithRemovedVariableLine(line)
                })
    
                //make space in the array for the new content
                let changeLineCount = change.text.split("\n").length
                for (let i = 0; i < changeLineCount; i++) {
                    this.VariablesByLine.splice(change.range.start.line,0,[])
                }
                this.lines += changeLineCount - 1
                this.lines -= change.range.end.line - change.range.start.line
    
                //update those lines
                this.UpdateVariables(change.range.start.line,change.range.start.line + changeLineCount - 1)
            } else {
                let lines = (this.Text.match(/\n/g) || '').length
                this.UpdateVariables(0,this.lines > lines ? this.lines : lines)
                this.lines = lines + 1
            }
        })
        this.UpdateHeaders()
        //just gonna leave this useful logging stuff here in case my terrible variable tracker code ever introduces me to the consequences of my actions

        // slog ("\n\n\n\n\n\n\n\n")
        // Object.keys(this.VariablesByLine).forEach(i => {
        //     if (this.VariablesByLine[i]) {
        //         let varnames: string[] = []
        //         this.VariablesByLine[i].forEach(variable => { varnames.push(variable.Name) });
        //         slog (`> ${i} (${Number(i)+1}): ${varnames.join(", ")}`)
        //     }
        // });

        // printvars(this.Variables)
    }

    Create(): void {
        if (this.Text.length < 1000000) {
            let lines = (this.Text.match(/\n/g) || '').length
            this.UpdateVariables(0,lines)
            this.lines = lines + 1
        } else {
            let split = new URL(this.Uri).pathname.split("/")
            snotif(`Some language features were disabled on '${decodeURIComponent(split[split.length-1])}' because of its size.`)
        }
        super.Create()
    }

    Remove(): void {
        this.VariablesByLine.forEach(line => {
            this.DealWithRemovedVariableLine(line)
        })
        this.cleanupTracking()
        super.Remove()
    }

    Rename(newUri: string, oldUri: string): void {
        //update variables
        Object.values(this.Variables).forEach(scopedict => {
            Object.values(scopedict).forEach(variable => {
                variable!.InDocuments[newUri] = variable!.InDocuments[oldUri]
                delete variable!.InDocuments[oldUri]
            })
        });

        super.Rename(newUri,oldUri)
    }
}

export class TrackedFolder {
    constructor(uri: string, parent: DocumentTracker) {
        this.Uri = uri
        this.ParentTracker = parent
    }

    //the document tracker that this folder tracker is a part of
    ParentTracker: DocumentTracker

    Uri: string
    Name: string

    //key: library id
    Libraries: Dict<Set<TrackedItemLibrary>> = {}

    //key: function/process name
    Functions: Dict<Set<TrackedScript>> = {}
    Processes: Dict<Set<TrackedScript>> = {}

    //all documents that are descendents of this folder
    Documents: Dict<TrackedDocument> = {}
    //all documents that this folder has authority over
    OwnedDocuments: Dict<TrackedDocument> = {}
}

export class DocumentTracker {
    constructor(connection: rpc.MessageConnection) {
        this.Connection = connection
        
        connection.onNotification("workspace/didCreateFiles",(param: CreateFilesParams) => {
            param.files.forEach(file => {
                if (file.uri.endsWith(".tc")) {
                    this.AddDocument(file.uri)
                }
            })
        })

        connection.onRequest("workspace/willRenameFiles",(param: RenameFilesParams) => {
            param.files.forEach(file => {
                let doc = this.Documents[file.oldUri]
                if (doc) {
                    doc.Rename(file.newUri,file.oldUri)
                }
            })
        })
        
        connection.onNotification("workspace/didDeleteFiles",(param:DeleteFilesParams) => {
            param.files.forEach(file => {
                let doc = this.Documents[file.uri]
                if (doc) {
                    doc.Remove()
                }
            })
        })
        
        connection.onNotification("textDocument/didOpen",(param: DidOpenTextDocumentParams) => {
            let doc = this.Documents[param.textDocument.uri]
            let openInfo = {text: param.textDocument.text, version: param.textDocument.version}
            
            if (doc == undefined) { 
                this.AddDocument(param.textDocument.uri,param.textDocument.text)
                doc = this.Documents[param.textDocument.uri]
            }
            
            doc!.Open(openInfo)
        })

        connection.onNotification("textDocument/didChange", (param: DidChangeTextDocumentParams) => {
            let doc = this.Documents[param.textDocument.uri]
            if (doc != undefined) {
                doc.ApplyChanges(param)
            }
        })

        connection.onNotification("textDocument/didClose", (param: DidCloseTextDocumentParams) => {
            let doc = this.Documents[param.textDocument.uri]
            if (doc != undefined) {
                doc.Close()
            }
        })

        connection.onNotification("workspace/didChangeWatchedFiles", async (param: DidChangeWatchedFilesParams) => {
            for (const change of param.changes) {
                let uri = change.uri

                let doc = this.Documents[uri]
                if (doc && change.type == FileChangeType.Changed) {
                    if (doc.IsOpen) { return }
                    let text = await fs.readFile(new URL(uri))
                    doc.ApplyChanges({textDocument: {uri: uri, version: doc.Version},contentChanges: [{text: text.toString()}]})
                } else if (doc && change.type == FileChangeType.Deleted) {
                    doc.Remove()
                } else if (change.type == FileChangeType.Created) {
                    this.AddDocument(new URL(uri).toString())
                }
            }
        })
    }

    Connection: rpc.MessageConnection

    //= these are considered master 
    //key: doc uri (string)
    Documents: Dict<TrackedDocument> = {}
    //key: folder uri (string)
    Folders: Dict<TrackedFolder> = {}
    //key (in one of the scope dicts dicts): variable name
    Variables: VariableTable = {global: {}, saved: {}, local: {}, line: {}}

    async Initialize(param: InitializeParams) {
        if (param.workspaceFolders) {
            for (const folder of param.workspaceFolders) {
                await this.AddFolder(folder.uri,folder.name)
            }
        }
    }

    //if the variable is not tracked, this function creates it
    //if the variable is already tracked, this function just returns it
    AccessVariable(scope: VariableScope, name: string): TrackedVariable {
        if (this.Variables[scope][name] != undefined) { return this.Variables[scope][name] }
        let variable = new TrackedVariable(scope,name,this)
        this.Variables[scope][name] = variable
        return variable
    }

    //leave `text` as null to read file contents and use that
    //if the document is already tracked, this function does nothing
    async AddDocument(uri: string, text: string | null = null) {
        //i dont wanna talk about it
        if (uri.startsWith("file:///c:")) { 
            uri = uri.replace("file:///c:","file:///c%3A")
        }

        if (this.Documents[uri] != undefined) { 
            //it literally says ^^ RIGHT THERE THAT ITS NOT UNDEFINED WHY DO I NEED A ! ADFJKGN,MVX
            this.Documents[uri]!.UpdateOwnership()
            return 
        }
        let urlified = new URL(uri)
        if (text == null) {
            text = (await fs.readFile(fileURLToPath(urlified))).toString("utf-8")
            // text = (await fs.readFile(urlified)).toString("utf-8")
        }

        let doc = uri.endsWith(".tc") ? new TrackedScript(uri, this) : new TrackedItemLibrary(uri, this)

        doc.ApplyChanges({textDocument: {uri: uri, version: 0},contentChanges: [{text: text}]})
        doc.UpdateOwnership()
        doc.Create()
        
        this.Documents[uri] = doc
    }

    async AddFolder(uri: string, name: string) {
        if (this.Folders[uri] != undefined) { throw new Error(`Folder is already tracked: '${uri}'`) }
        let folder = new TrackedFolder(uri, this)
        folder.Name = name
        this.Folders[uri] = folder

        try {
            const files = await getAllFilesInFolder(new URL(uri));
            for (const filePath of files) {
                if (filePath.endsWith(".tc") || filePath.endsWith(".tcil")) {
                    await this.AddDocument(pathToFileURL(filePath).toString())
                }
            }
            // for (const relativeFilePath of files) {
            //     if (relativeFilePath.endsWith(".tc") || relativeFilePath.endsWith(".tcil")) {
            //         slog(`adding ${uri}; found path at `,relativeFilePath)
            //         this.AddDocument(uri+"/"+fixUriComponent(relativeFilePath))
            //     }
            // }
        } catch (err)  {
            throw err
            // console.error(err);
        }
    }

    GetFileText(uri: string): string {
        let doc = this.Documents[uri]
        if (doc == null) { throw Error(`Document is not tracked: '${uri}'`) }
        return doc.Text
    }
}