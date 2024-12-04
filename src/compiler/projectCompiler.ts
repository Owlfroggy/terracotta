import { pathToFileURL } from "node:url"
import * as Tokenizer from "../tokenizer/tokenizer.ts"
import * as ErrorHandler from "../util/errorHandler.ts"
import * as LineCompiler from "./codelineCompiler.ts"
import * as fs from "node:fs/promises"
import * as CodeblockNinja from "./codeblockNinja.ts"
import { COLOR } from "../util/characterUtils.ts"
import { URL } from "node:url"
import { Dict } from "../util/dict.ts"
import { walk } from "@std/fs"

export type CompiledTemplate = string | Dict<any>

export interface CompiledProjectTemplates {
    /** what the CompiledTemplate data will actually be */
    mode: "gzip" | "json"
    /** Key: event df name */
    playerEvents: Dict<CompiledTemplate>
    /** Key: event df name */
    entityEvents: Dict<CompiledTemplate>
    /** Key: function name */
    functions: Dict<CompiledTemplate>
    /** Key: function name */
    processes: Dict<CompiledTemplate>
}

export interface FileCompileResults {
    error?: Error | ErrorHandler.TCError,
    templates?: {
        type: string,
        name: string,
        template: string
    }[]
}

export interface ProjectCompileData {
    maxCodeLineSize: number
}

//maps a codeblock type to its category in project compile results
const categoryMap = {
    "PLAYER_EVENT": "playerEvents",
    "ENTITY_EVENT": "entityEvents",
    "FUNCTION": "functions",
    "PROCESS": "processes"
}

export function CompileFile(fileContents: string, maxLineLength: number, mode: "gzip" | "json" = "gzip"): FileCompileResults {
    //tokenize
    let script = fileContents
    let tokenResults: Tokenizer.TokenizerResults

    try {
        tokenResults = Tokenizer.Tokenize(script, { "mode": "getTokens" }) as Tokenizer.TokenizerResults
    } catch (e: any) {
        return {error: e}
    }

    //compile
    let compiledResults: LineCompiler.CompileResults
    try {
        compiledResults = LineCompiler.CompileLines(tokenResults.Lines)
    } catch (e: any) {
        return {error: e}
    }

    if (!compiledResults.type || !compiledResults.name) {return {}}

    //slice
    let slicedResults: LineCompiler.CodeBlock[][]
    try {
        slicedResults = CodeblockNinja.SliceCodeLine(compiledResults.code,maxLineLength)
    } catch (e: any) {
        return {error: e}
    }


    return {
        templates: slicedResults.map(line => {
            let template: string = LineCompiler.JSONize(line)
            if (mode == "gzip") {
                template = LineCompiler.GZIP(template) 
            }

            return {
                template: template,
                type: line[0].Block,
                name: line[0] instanceof LineCompiler.EventBlock ? line[0].Event : (line[0] as LineCompiler.FunctionBlock || LineCompiler.ProcessBlock).Name
            }
        })
    }
}


export async function CompileProject(path: string, data: ProjectCompileData): Promise<CompiledProjectTemplates> {
    if (!path.endsWith("/")) {path += "/"}
    let folderUrl = pathToFileURL(path)
    
    //error checking
    try {
        if (!(await fs.stat(folderUrl)).isDirectory()) { 
            process.stderr.write("\nError: Provided path is not a folder\n") 
            process.exit(1)
        }
    } catch (e) {
        process.stderr.write("\nError: Provided path does not exist\n") 
        process.exit(1)
    }

    let results: CompiledProjectTemplates = {
        mode: "gzip",
        playerEvents: {},
        entityEvents: {},
        functions: {},
        processes: {}
    }
    let failed = false

    //compilation
    const files: string[] = []
    for (const fileInfo of await Array.fromAsync(walk(folderUrl))) {
        if (fileInfo.isFile) {
            files.push(fileInfo.path)
        }
    }

    await Promise.all(files.map(async (file) => {
        //ignore any files that aren't .tc
        if (!file.endsWith(".tc")) { return }
        try {
            let fileContents: string
            try { fileContents = (await fs.readFile(file)).toString() } 
            catch (e) { process.stderr.write(`Error while reading file '${file}': ${e} (this file will be skipped)\n`); return }

            let compileResults = CompileFile(fileContents,data.maxCodeLineSize,"gzip")
            //if this tc script has an error, print it and move on
            if (compileResults.error) {
                if (failed) {process.stderr.write("\n\n")}
                ErrorHandler.PrintError(compileResults.error,fileContents,file)
                failed = true
                return
            }

            //add all templates produced by the file to final result
            for (const result of compileResults.templates!) {
                if (results[categoryMap[result.type]][result.name] !== undefined) {
                    process.stderr.write(`Error: Duplicate ${result.type} '${result.name}'\n`)
                    failed = true
                    return
                }
    
                results[categoryMap[result.type]][result.name] = result.template
            }
        } catch (e) {
            process.stderr.write(`\n${COLOR.White}${"#".repeat(50)}\n${COLOR.Red}There was an internal error while compiling ${file}.\nPlease file a bug report containing the the below output and, if possible, the script that caused this error.\n${COLOR.White}${"#".repeat(50)}${COLOR.Reset}\n`)
            console.error(e)
            // throw e
            process.exit(1)
        }
    }));

    if (failed) {
        process.exit(1)
    }

    return results
}