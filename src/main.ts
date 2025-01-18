import * as Tokenizer from "./tokenizer/tokenizer.ts"
import * as ErrorHandler from "./util/errorHandler.ts"  
import * as LineCompiler from "./compiler/codelineCompiler.ts"
import * as ProjectCompiler from "./compiler/projectCompiler.ts"
import * as fs from "node:fs/promises"
import { parseArgs } from "node:util"
import { StartServer } from "./languageServer/languageServer.ts"
import { COLOR as c } from "./util/characterUtils.ts"
import { pathToFileURL } from "node:url"
import * as ncp from "copy-paste"

// process.stderr.write(`dingus ${typeof ()}\n`)
// throw "hands"

export const DEBUG_MODE = {
    enableDebugFunctions: true,
    disableOptimization: false,
}

export const VERSION = "alpha"

const SPLASH_TEXTS = [
    "200% productivity boost by stopping code parkour!",
    "Making development for mini plots possible!",
    "Never obliterate an if statement's contents again!",
    "Never touch %math ever again!",
    "If your plot isn't open source, I'm not playing it.",
    "Who needs long codespaces anyway?",
    "Expression items were canceled? Oh no",
    "Revolutionary new df features such as: Readable Code",
    "Revolutionary new df features such as: Copy & Paste",
    "Revolutionary new df features such as: Comments",
    "We don't talk about lagslayer.",
    "It shouldn't exist!",
    "Feature complete and then some!",
    `${c.Strikethrough}Communism${c.EndStrikethrough} Text->DF has failed every time it was tried... but not this time!`,
    "Magic!",
    "Y'all need to stop with this softcoding stuff",
    "Making Select Object a grand total of 5% less painful!",
    "What's that? Collaberating on plots? Uhhhhhhh Shut Up",
    "Shoutout to CodeClient",
]

//function for spamming debug print statements
//its faster to type and i can search and destroy them after im done debugging without having to worry about nuking actually important log messages
export function print (...data: any[]) {
    process.stderr.write(data.map(entry => {
        if (entry === undefined) {
            return "undefined"
        }
        else if (entry === null) {
            return "null"
        }
        try {
            return entry.toString()
        } catch (e) {
            return `[${typeof entry}]`
        }
    }).join(" ")+"\n")
}

async function Main() {
    const options = {
        //if true, copy the result to the clipboard (only works with file mode)
        copy: { type: "boolean" },
        //how long the codespace is in minecraft blocks (used for auto-slicing codelines)
        //default is 99999, basically disabling slicing
        plotsize: { type: "string" },

        
        //the file to take in (does not do anything in server mode)
        file: { type: "string" },
        //if true, compile inputted script or project
        /* only works for --file mode: */
        //"gzip": output gzipped df template json
        //"json": output stringified df template json
        //default is "gzip"
        outmode: { type: "string" },
        

        //the project to take in (does not do anything in server mode) (incompatible with --file)
        project: { type: "string" },
        //if true, output sorted by codeline type
        //if false, output every template seperated by newline with
        includemeta: { type: "boolean" },
    } as const; //const as const!! i love javascript!!!!!!!!!!!!!!!

    
    const { values, positionals } = parseArgs({ args: process.argv, options: options, allowPositionals: true });
    let command = positionals[2]
    
    let plotsize = values.plotsize == null ? 99999 : Number(values.plotsize)
    if (plotsize < 14) {
        process.stderr.write("Error: plot size cannot be lower than 14\n")
        process.exit(1)
    }
    
    if (command == "compile") {
        //error handling
        if (values.file && values.project) {
            process.stderr.write("\nError: --file and --project are mutually exclusive\n")
        }

        let output: string = ""

        if (values.file) {
            if (values.outmode && !(values.outmode == "gzip" || values.outmode == "json")) {
                process.stderr.write("Error: --outmode must be either 'gzip' or 'json'\n")
                process.exit(1)
            }
            let script = (await fs.readFile(values.file)).toString()
            let results = ProjectCompiler.CompileFile(script,plotsize,values.outmode as "gzip" | "json",{itemLibraries: {},codeInjections:{playerEvents:{},entityEvents:{},functions:{},processes:{}}})

            if (results.error) {
                ErrorHandler.PrintError(results.error, script, pathToFileURL(values.file).pathname.split('/').pop()!)
                return
            }

            output = ""
            results.templates?.forEach(data => {
                output += data.template
            })
        }
        else if (values.project) {
            let results = await ProjectCompiler.CompileProject(values.project,{maxCodeLineSize: plotsize})

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
    else if (command == "server") {
        StartServer()
    }
    else if (command == undefined) {
        console.log(
`${c.BrightCyan}${c.Bold}Terracotta${c.Reset} - ${c.LightYellow}${SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)]}${c.Reset}
${c.Gray}version ${c.Italic}${VERSION}${c.Reset}

${c.White}${c.Underline}Commands:${c.Reset}
${c.Yellow}compile ${c.White}(${c.Magenta}--project --includemeta${c.White}? | ${c.Magenta}--file --outmode${c.White}?) ${c.Magenta}--plotsize --copy${c.White}?
${c.White}├ ${c.Underline}Compiles either a single .tc file or an entire project and prints the compiled template data to stdout.${c.Reset}
${c.White}├ ${c.Magenta}--project ${c.Gray}path/to/folder${c.White}: Compile this folder as a project.
${c.White}├ ${c.Magenta}--includemeta${c.White}: If present, output a JSON structure containing more info about compiled templates. Currently only works with --project.
${c.White}│
${c.White}├ ${c.Magenta}--file ${c.Gray}path/to/file.tc${c.White}: Compile this file only (will ${c.Red}${c.Bold}NOT${c.Reset}${c.White} link any external modules or item libraries).
${c.White}├ ${c.Magenta}--outmode ${c.Gray}gzip | json${c.White}: What format to return compiled templates in. Currently only works with --file.
${c.White}│
${c.White}├ ${c.Magenta}--plotsize ${c.Gray}number${c.White}: Codespace size in minecraft blocks; used for automatic codeline splitting. If not present, disables codeline splitting.
${c.White}└ ${c.Magenta}--copy${c.White}: If present, copy compiled templates to the clipboard instead of printing to stdout.
`
        )
    }
}

await Main()