import * as Tokenizer from "./tokenizer"
import * as ErrorHandler from "./errorHandler"

//function for spamming debug print statements
//its faster to type and i can search and destroy them after im done debugging without having to worry about nuking actually important log messages
export function print (...data: any[]) {
    console.log(...data)
}

async function Main() {
    //tokenize
    let FILE_PATH = "testscripts/variables.tc"
    let script = await Bun.file(FILE_PATH).text()
    let tokenResults: Tokenizer.TokenizerResults

    try {
        tokenResults = Tokenizer.Tokenize(script)
    } catch (e) {
        ErrorHandler.PrintError(e,script)
        return
    }

    console.log("CODE LINES!!!")
    console.log(JSON.stringify(tokenResults!.Lines, null, "  "))
}

await Main()