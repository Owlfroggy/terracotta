import * as Tokenizer from "./tokenizer/tokenizer"
import * as ErrorHandler from "./util/errorHandler"  
import * as LineCompiler from "./compiler/codelineCompiler"
import * as ProjectCompiler from "./compiler/projectCompiler"
import { parseArgs } from "@pkgjs/parseargs"
import * as path from "path"
import { StartServer } from "./languageServer/languageServer"
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
        compile: { type: "boolean" },
        //if true, copy the result to the clipboard (only works with file mode)
        copy: { type: "boolean" },

        
        //the file to take in (does not do anything in server mode)
        file: { type: "string" },
        //if true, compile inputted script or project
        /* only works for --file mode: */
        //"gzip": output gzipped df template json
        //"json": output stringified df template json
        //default is "gzip"
        cmode: { type: "string" },
        

        //the project to take in (does not do anything in server mode) (incompatible with --file)
        project: { type: "string" },
        //if true, output sorted by codeline type
        //if false, output every template seperated by newline with
        includemeta: { type: "boolean" },


        //if true, run as a language server
        server: { type: "boolean"},
    };

    const { values, positionals } = parseArgs({ options });
    
    if (values.compile) {
        //error handling
        if (values.file && values.project) {
            process.stderr.write("\nError: --file and --project are mutually exclusive\n")
        }

        let output: string = ""

        if (values.file) {
            let script = await Bun.file(values.file).text()
            let results = ProjectCompiler.CompileFile(script,300)

            if (results.error) {
                ErrorHandler.PrintError(results.error, script)
                return
            }

            output = ""
            results.templates?.forEach(data => {
                output += data.template
            })
        }
        else if (values.project) {
            let results = await ProjectCompiler.CompileProject(values.project,{maxCodeLineSize: 100})

            if (values.includemeta) {
                output = JSON.stringify(results)
            } else {
                output = ""
                for (const category of ["playerEvents","entityEvents","functions","processes"]) {
                    for (const template of Object.values(results[category])) {
                        output += template + "\n"
                    }
                }
                //chop off ending newline
                output = output.substring(0,output.length - 1)
            }
        } else {
            process.stderr.write("\nError: --compile must be provided with either a file or a project\n")
        }

        //copy to clipboard if you're into that
        if (values.copy) {
            ncp.copy(output)
            process.stdout.write("Copied output to clipboard\n")
        } else {
            process.stdout.write(output)
        }
    } 
    else if (values.server) {
        StartServer()
    }
}

await Main()