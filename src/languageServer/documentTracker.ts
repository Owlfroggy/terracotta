import * as rpc from "vscode-jsonrpc"
import * as fs from "node:fs/promises"
import { Tokenize, VariableToken } from "../tokenizer/tokenizer.ts"
import { CreateFilesParams, DeleteFilesParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams, DidRenameFilesNotification, DocumentLinkResolveRequest, DocumentUri, InitializeParams, MessageType, RenameFilesParams, TextDocumentContentChangeEvent } from "vscode-languageserver"
import { LinePositionToIndex, slog, snotif } from "./languageServer.ts"
import { Dict } from "../util/dict.ts"
import { URL } from "node:url"

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
    VariablesByLine: TrackedVariable[][] = []

    //all folders that this document is a descendant of
    AncestorFolders: Dict<TrackedFolder> = {}
    //the tracker that has authority over this document
    OwnedBy: TrackedFolder | null = null

    
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

    ApplyChanges(param) {
        let ranges: [number,number][] = []
        param.contentChanges.forEach(change => {
            //= update text =\\
            let startIndex = LinePositionToIndex(this.Text,change.range.start)!
            let endIndex = LinePositionToIndex(this.Text,change.range.end)!
            this.Text = this.Text.substring(0,startIndex) + change.text + this.Text.substring(endIndex);

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

            //update those lines
            this.UpdateVariables(change.range.start.line,change.range.start.line + changeLineCount - 1)
        });

        this.Version = param.textDocument.version

        
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

    Remove() {
        Object.values(this.AncestorFolders).forEach(folder => {
            delete folder?.Documents[this.Uri]
            delete folder?.OwnedDocuments[this.Uri]
        });

        this.VariablesByLine.forEach(line => {
            this.DealWithRemovedVariableLine(line)
        })

        delete this.ParentTracker.Documents[this.Uri]
    }

    Rename(newUri: string) {
        let oldUri = this.Uri
        this.Uri = newUri

        //update variables
        Object.values(this.Variables).forEach(scopedict => {
            Object.values(scopedict).forEach(variable => {
                variable!.InDocuments[newUri] = variable!.InDocuments[oldUri]
                delete variable!.InDocuments[oldUri]
            })
        });

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
                    this.AddDocument(file.uri)
                }
            })
        })

        connection.onRequest("workspace/willRenameFiles",(param: RenameFilesParams) => {
            param.files.forEach(file => {
                let doc = this.Documents[file.oldUri]
                if (doc) {
                    doc.Rename(file.newUri)
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
    }

    Connection: rpc.MessageConnection

    //= these are considered master 
    //key: doc uri (string)
    Documents: Dict<TrackedDocument> = {}
    //key: folder uri (string)
    Folders: Dict<TrackedFolder> = {}
    //key (in one of the scope dicts dicts): variable name
    Variables: VariableTable = {global: {}, saved: {}, local: {}, line: {}}

    Initialize(param: InitializeParams) {
        if (param.workspaceFolders) {
            param.workspaceFolders.forEach(folder => {
                this.AddFolder(folder.uri,folder.name)
            })
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
        if (this.Documents[uri] != undefined) { return }
        let urlified = new URL(uri)

        let doc = new TrackedDocument(uri, this)
        if (text == null) {
            text = (await fs.readFile(urlified)).toString("utf-8")
        }

        doc.Text = text
        doc.UpdateOwnership()
        if (doc.Text.length < 1000000) {
            let lines = (doc.Text.match(/\n/g) || '').length
            doc.UpdateVariables(0,lines)
        } else {
            let split = urlified.pathname.split("/")
            snotif(`Some language features were disabled on '${decodeURIComponent(split[split.length-1])}' because of its size.`)
        }

        this.Documents[uri] = doc
    }

    async AddFolder(uri: string, name: string) {
        if (this.Folders[uri] != undefined) { throw new Error(`Folder is already tracked: '${uri}'`) }
        let folder = new TrackedFolder(uri, this)
        folder.Name = name
        this.Folders[uri] = folder

        try {
            const files = await fs.readdir(new URL(uri),{recursive: true},);
            for (const relativeFilePath of files) {
                if (relativeFilePath.endsWith(".tc")) {
                    this.AddDocument(uri+"/"+fixUriComponent(relativeFilePath))
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