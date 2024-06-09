import * as rpc from "vscode-jsonrpc/node"
import { MessageType } from "vscode-languageserver"

class OpenDocument {
    Version: number
    Text: string
}

export class DocumentTracker {
    constructor(connection: rpc.MessageConnection) {
        this.Connection = connection
        
        connection.onNotification("textDocument/didOpen",param => {
            let doc = new OpenDocument()
            doc.Text = param.textDocument.text
            doc.Version = param.textDocument.version

            this.OpenDocuments[param.textDocument.uri] = doc
        })

        connection.onNotification("textDocument/didChange", param => {
            let doc = this.OpenDocuments[param.textDocument.uri]
            if (!doc) { return }
            if (doc.Version > param.textDocument.version) { return }
            doc.Text = param.contentChanges[0].text
        })

        connection.onNotification("textDocument/didClose", param => {
            delete this.OpenDocuments[param.textDocument.uri]
        })
    }

    Connection: rpc.MessageConnection
    //key: doc uri (string)
    OpenDocuments: Dict<OpenDocument> = {}


    GetFileText = function(uri: string): string {
        let doc = this.OpenDocuments[uri]
        if (doc == null) { throw Error(`Document is not tracked: '${uri}'`) }
        return doc.Text
    }
}