import * as rpc from "vscode-jsonrpc/node"
import { CompletionList, CompletionRegistrationOptions, InitializeResult, MessageType, TextDocumentSyncKind } from "vscode-languageserver";

export function StartServer() {
    //==========[ create rpc connection ]=========\\

    let connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(process.stdin),
        new rpc.StreamMessageWriter(process.stdout)
    );

    connection.listen()

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
                    resolveProvider: true
                }
            }
        }
        return response
    })

    connection.onRequest("textDocument/completion", param => {
        let response: CompletionList = {
            isIncomplete: false,
            items: [
                {
                    label: "Hello world!"
                },
                {
                    label: "I don't like it here actually can i go back pls"
                }
            ]
        }
        return
    })

    //==========[ notification handling ]=========\\

    connection.onNotification("initialized",(param) => {
        showText("Terracotta server successfully started!")
    })
}