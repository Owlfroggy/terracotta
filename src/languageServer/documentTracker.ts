import * as rpc from "vscode-jsonrpc/node"
import * as fs from "node:fs/promises"
import { CreateFilesParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams, DocumentUri, InitializeParams, MessageType, TextDocumentContentChangeEvent } from "vscode-languageserver"
import { LinePositionToIndex, slog } from "./languageServer"

function fixUriComponent(str: string): string {
    return encodeURIComponent(str).replaceAll("%2F","/")
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
    

    //all folders that this document is a descendant of
    AncestorFolders: Dict<FolderTracker> = {}

    //the tracker that has authority over this document
    OwnedBy: FolderTracker

    ApplyChanges(param) {
        param.contentChanges.forEach(change => {
            let startIndex = LinePositionToIndex(this.Text,change.range.start)!
            let endIndex = LinePositionToIndex(this.Text,change.range.end)!
            this.Text = this.Text.substring(0,startIndex) + change.text + this.Text.substring(endIndex);
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
        Object.values(this.ParentTracker.FolderTrackers).forEach(folder => {
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

export class FolderTracker {
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

    //key: doc uri (string)
    Documents: Dict<TrackedDocument> = {}
    //key: folder uri (string)
    FolderTrackers: Dict<FolderTracker> = {}

    initialize(param: InitializeParams) {
        if (param.workspaceFolders) {
            param.workspaceFolders.forEach(folder => {
                this.addFolder(folder.uri,folder.name)
            })
        }
    }

    //leave `text` as null to read file contents and use that
    //if the document is already tracked, this function does nothing
    addDocument = async function(uri: string, text: string | null = null) {
        if (this.Documents[uri]) { return }

        let doc = new TrackedDocument(uri, this)
        if (text == null) {
            text = (await fs.readFile(new URL(uri))).toString("utf-8")
        }

        doc.Text = text

        doc.UpdateOwnership()
        this.Documents[uri] = doc
    }

    addFolder = async function(uri: string, name: string) {
        if (this.FolderTrackers[uri] != undefined) { throw new Error(`Folder is already tracked: '${uri}'`) }
        let folder = new FolderTracker(uri, this)
        folder.Name = name
        this.FolderTrackers[uri] = folder

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

    GetFileText = function(uri: string): string {
        let doc = this.Documents[uri]
        if (doc == null) { throw Error(`Document is not tracked: '${uri}'`) }
        return doc.Text
    }
}