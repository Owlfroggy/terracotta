import { MessageType } from "vscode-languageserver";

//function that other things can call to log to the language server output when debugging
export let slog = (...data: any[]) => {}
export let snotif = (message: string, type: MessageType = MessageType.Info) => {}

export function setSlogCallback(callback: typeof slog) {
    slog = callback;
}

export function setSnotifCallback(callback: typeof snotif) {
    snotif = callback;
}