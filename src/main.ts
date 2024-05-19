import * as Tokenizer from "./tokenizer"
import * as ErrorHandler from "./errorHandler"  
import * as Compiler from "./compiler"
import { parseArgs } from "@pkgjs/parseargs"
import * as path from "path"
const ncp = require("copy-paste")

export const DEBUG_MODE = {
    enableDebugFunctions: true,
    disableOptimization: false,
}

//function for spamming debug print statements
//its faster to type and i can search and destroy them after im done debugging without having to worry about nuking actually important log messages
export function print (...data: any[]) {
    console.log(...data,)
}

async function Main() {
    const options = {
        //the file to take in
        file: { type: "string" },
        
        //if true, compile inputted script
        compile: { type: "boolean" },

        //if true, copy the result to the clipboard
        copy: { type: "boolean" },

        //"gzip": output gzipped df template json
        //"json": output stringified df template json
        //"dfgive": output a /dfgive command that gives the template
        //default is "gzip"
        cmode: { type: "string" },
    };

    const { values, positionals } = parseArgs({ options });
    
    //mode: --compile
    if (values.compile) {
        //tokenize
        let script = await Bun.file(values.file).text()
        let tokenResults: Tokenizer.TokenizerResults

        try {
            tokenResults = Tokenizer.Tokenize(script)
        } catch (e) {
            ErrorHandler.PrintError(e, script)
            return
        }

        //compile
        let compiledResults: Compiler.CompileResults
        try {
            compiledResults = Compiler.Compile(tokenResults.Lines)
        } catch (e) {
            ErrorHandler.PrintError(e,script)
            return
        }

        let jsoned = Compiler.JSONize(compiledResults.Code)
        let gzipped = Compiler.GZIP(jsoned)

        let finalOutput: string = ""
        switch (values.cmode) {
            case undefined || "gzip":
                finalOutput = gzipped
                break
            case "json":
                finalOutput = jsoned
                break
            case "dfgive":
                finalOutput = `/dfgive light_blue_terracotta{PublicBukkitValues:{"hypercube:codetemplatedata":'{"author":"Terracotta","name":"Compiled Template","version":1,"code":"${gzipped}"}'},display:{Name:'{"text":"","extra":[{"text":"${path.basename(values.file)}","italic":false,"color":"green"}]}'}}`
                break
        }

        //copy to clipboard if you're into that
        if (values.copy) {
            ncp.copy(finalOutput)
            print("Copied output to clipboard")
        }
    }   
}

await Main()