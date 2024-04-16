import * as Tokenizer from "./tokenizer"
import * as ErrorHandler from "./errorHandler"
import * as Compiler from "./compiler"

export const DEBUG_MODE = {
    enableDebugFunctions: true
}

//function for spamming debug print statements
//its faster to type and i can search and destroy them after im done debugging without having to worry about nuking actually important log messages
export function print (...data: any[]) {
    console.log(...data,)
}

async function Main() { 
    //tokenize
    let FILE_PATH = "testscripts/fishgame.tc"
    let script = await Bun.file(FILE_PATH).text()
    let tokenResults: Tokenizer.TokenizerResults

    try {
        tokenResults = Tokenizer.Tokenize(script)
    } catch (e) {
        ErrorHandler.PrintError(e,script)
        return
    }

    // console.log("CODE LINES!!!")
    // console.log(JSON.stringify(tokenResults!.Lines, null, "  "))

    let compiledResults: Compiler.CompileResults
    try {
        compiledResults = Compiler.Compile(tokenResults.Lines)
    } catch (e) {
        ErrorHandler.PrintError(e,script)
        return
    }

    let jsonedResults: string = Compiler.JSONize(compiledResults.Code)
    
    let gzippedResults: string = Compiler.GZIP(jsonedResults)

    console.log(gzippedResults)

    let itemstring = `light_blue_terracotta{PublicBukkitValues:{"hypercube:codetemplatedata":'{"author":"Terracotta","name":"Compiled Template","version":1,"code":"${gzippedResults}"}'},display:{Name:'{"text":"","extra":[{"text":"Compiled Code Template","italic":false,"color":"green"}]}'}}`

    //temporary thing to make importing to df easier
    //only works on macos according to the stack overflow post i stole it from
    var proc = require('child_process').spawn('pbcopy');
    proc.stdin.write('/dfgive '+itemstring); proc.stdin.end();

    console.log("Copied to clipboard")
}

await Main()