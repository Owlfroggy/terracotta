import * as rpc from "vscode-jsonrpc/node"
import * as fs from "node:fs/promises"
import { Tokenize, VariableToken } from "../tokenizer/tokenizer"
import { CreateFilesParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams, DocumentLinkResolveRequest, DocumentUri, InitializeParams, MessageType, TextDocumentContentChangeEvent } from "vscode-languageserver"
import { LinePositionToIndex, slog, snotif } from "./languageServer"

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
    slog(str)
}

export type VariableTable = {global: Dict<TrackedVariable>, saved: Dict<TrackedVariable>, local: Dict<TrackedVariable>, line: Dict<TrackedVariable>}
export type VariableScope = "global" | "saved" | "local" | "line"

//every tracked variable should have EXACTLY ONE instance of this class
//and all the places that need to keep track of tracked variables should reference that instance

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

    Untrack() {
        delete this.ParentTracker.Variables[this.Scope][this.Name]
    }
}

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
    
    //variables that are in this document
    Variables: VariableTable = {global: {}, saved: {}, local: {}, line: {}}
    //key = line number, value = array of variables that exist on that line
    //if there are no variables on a line, it will not have an entry in this table
    VariablesByLine: Dict<TrackedVariable[]> = {}

    //all folders that this document is a descendant of
    AncestorFolders: Dict<TrackedFolder> = {}
    //the tracker that has authority over this document
    OwnedBy: TrackedFolder | null = null

    UpdateVariables(bottomLine: number, topLine: number) {
        let lineVariableInfo = Tokenize(this.Text,{mode: "getVariables", startFromLine: bottomLine, goUntilLine: topLine, fromLanguageServer: true}) as Dict<VariableToken[]>
        for (const [line, vars] of Object.entries(lineVariableInfo)) {
            //remove old line state
            if (this.VariablesByLine[line]) {
                this.VariablesByLine[line].forEach(trackedVar => {
                    if (trackedVar.InDocuments[this.Uri] !== undefined) {
                        //why do must i ! it???? it says ^^^^^^^^^^^^^ literally right there that it cannot be undefined!!! grrrrrrrr
                        //(maybe typescript just forgot its glasses)
                        trackedVar.InDocuments[this.Uri]! -= 1

                        //if there are no more instances of the variable in this document
                        if (trackedVar.InDocuments[this.Uri]! <= 0) {
                            delete this.Variables[trackedVar.Scope][trackedVar.Name]
                            delete trackedVar.InDocuments[this.Uri]
                            if (Object.keys(trackedVar.InDocuments).length == 0) {
                                trackedVar.Untrack()
                            }
                        }
                    }
                })
            }
            
            //apply new line state
            if (vars != null && vars.length > 0) {
                this.VariablesByLine[line] = []
                vars.forEach(varToken => {
                    let trackedVar = this.ParentTracker.accessVariable(varToken.Scope,varToken.Name)
                    
                    this.VariablesByLine[line]!.push(trackedVar)
                    
                    if (trackedVar.InDocuments[this.Uri] == undefined) {
                        trackedVar.InDocuments[this.Uri] = 0
                    }

                    trackedVar.InDocuments[this.Uri]! += 1
                    
                    if (this.Variables[trackedVar.Scope][trackedVar.Name] == undefined) {
                        this.Variables[trackedVar.Scope][trackedVar.Name] = trackedVar
                    }
                })
            } else {
                delete this.VariablesByLine[line]
            }
        }
    }

    ApplyChanges(param) {
        let ranges: [number,number][] = []
        param.contentChanges.forEach(change => {
            //= update text =\\
            let startIndex = LinePositionToIndex(this.Text,change.range.start)!
            let endIndex = LinePositionToIndex(this.Text,change.range.end)!
            this.Text = this.Text.substring(0,startIndex) + change.text + this.Text.substring(endIndex);

            //= update variables =\\
            let bottomLineToUpdate = change.range.end.line + change.text.split("\n").length-1
            
            //move lines affected by newlines in the change but not contained with the change's range
            let linesToMove = change.text.split("\n").length - (change.range.end.line - change.range.start.line + 1)
            let keys = Object.keys(this.VariablesByLine)
            //iterate starting from bottom if moving lines down
            if (linesToMove > 0) {
                for (let i = Number(keys[keys.length-1]); i > change.range.end.line; i--) {
                    if (this.VariablesByLine[i] != undefined) {
                        this.VariablesByLine[Number(i)+linesToMove] = this.VariablesByLine[i]
                        delete this.VariablesByLine[i]
                    }
                }
            }
            //iterate starting from top if moving lines up
            else if (linesToMove < 0) {
                for (let i = bottomLineToUpdate; i <= Number(keys[keys.length-1]); i++) {
                    if (this.VariablesByLine[i] != undefined) {
                        this.VariablesByLine[Number(i)+linesToMove] = this.VariablesByLine[i]
                        delete this.VariablesByLine[i]
                    }
                }
            }

            
            //reparse lines that actually were in the change's range
            this.UpdateVariables(bottomLineToUpdate, change.range.start.line)
        });
        
        Object.keys(this.VariablesByLine).forEach(i => {
            if (this.VariablesByLine[i]) {
                let varnames: string[] = []
                this.VariablesByLine[i].forEach(variable => { varnames.push(variable.Name) });
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

    //updates ownership info, including on FolderTrackers
    UpdateOwnership() {
        Object.keys(this.AncestorFolders).forEach(key => {
            let folder = this.AncestorFolders[key]!
            delete folder.Documents[this.Uri]
            delete this.AncestorFolders[key]
        });

        //if you have this many nested folders and the language server breaks because of it, you are no longer allowed to use terracotta
        let shortestOwnerLength = 29342342395823923
        let docSplitPath = new URL(this.Uri).pathname.split("/")
        
        this.OwnedBy = null

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
                        delete this.OwnedBy.OwnedDocuments[this.Uri]
                    }
                    this.OwnedBy = folder
                    folder.OwnedDocuments[this.Uri] = this
                    shortestOwnerLength = folderSplitPath.length
                }
            }
        });
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
                    this.addDocument(file.uri)
                }
            })
        })
        
        connection.onNotification("textDocument/didOpen",(param: DidOpenTextDocumentParams) => {
            let doc = this.Documents[param.textDocument.uri]
            let openInfo = {text: param.textDocument.text, version: param.textDocument.version}

            if (doc == undefined) { 
                this.addDocument(param.textDocument.uri,param.textDocument.text)
                return
            }

            doc.Open(openInfo)
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
    }

    Connection: rpc.MessageConnection

    //= these are considered master 
    //key: doc uri (string)
    Documents: Dict<TrackedDocument> = {}
    //key: folder uri (string)
    Folders: Dict<TrackedFolder> = {}
    //key (in one of the scope dicts dicts): variable name
    Variables: VariableTable = {global: {}, saved: {}, local: {}, line: {}}

    initialize(param: InitializeParams) {
        if (param.workspaceFolders) {
            param.workspaceFolders.forEach(folder => {
                this.addFolder(folder.uri,folder.name)
            })
        }
    }

    //if the variable is not tracked, this function creates it
    //if the variable is already tracked, this function just returns it
    accessVariable(scope: VariableScope, name: string): TrackedVariable {
        if (this.Variables[scope][name] != undefined) { return this.Variables[scope][name] }
        let variable = new TrackedVariable(scope,name,this)
        this.Variables[scope][name] = variable
        return variable
    }

    //leave `text` as null to read file contents and use that
    //if the document is already tracked, this function does nothing
    async addDocument(uri: string, text: string | null = null) {
        if (this.Documents[uri]) { return }
        let urlified = new URL(uri)

        let doc = new TrackedDocument(uri, this)
        if (text == null) {
            text = (await fs.readFile(urlified)).toString("utf-8")
        }

        doc.Text = text

        doc.UpdateOwnership()
        if (doc.Text.length < 1000000) {
            let lines = (doc.Text.match(/\n/g) || '').length
            doc.UpdateVariables(lines,0)
        } else {
            let split = urlified.pathname.split("/")
            snotif(`Some language features were disabled on '${decodeURIComponent(split[split.length-1])}' because of its size.`)
        }

        this.Documents[uri] = doc
    }

    async addFolder(uri: string, name: string) {
        if (this.Folders[uri] != undefined) { throw new Error(`Folder is already tracked: '${uri}'`) }
        let folder = new TrackedFolder(uri, this)
        folder.Name = name
        this.Folders[uri] = folder

        try {
            const files = await fs.readdir(new URL(uri),{recursive: true},);
            for (const relativeFilePath of files) {
                if (relativeFilePath.endsWith(".tc")) {
                    this.addDocument(uri+"/"+fixUriComponent(relativeFilePath))
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    GetFileText(uri: string): string {
        let doc = this.Documents[uri]
        if (doc == null) { throw Error(`Document is not tracked: '${uri}'`) }
        return doc.Text
    }
}