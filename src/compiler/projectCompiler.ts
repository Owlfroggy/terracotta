import { pathToFileURL } from "node:url"
import * as Tokenizer from "../tokenizer/tokenizer"
import * as ErrorHandler from "../util/errorHandler"
import * as LineCompiler from "./codelineCompiler"
import * as fs from "node:fs/promises"

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

//maps a codeblock type to its category in project compile results
const categoryMap = {
    "PLAYER_EVENT": "playerEvents",
    "ENTITY_EVENT": "entityEvents",
    "FUNCTION": "functions",
    "PROCESS": "processes"
}

export function CompileFile(fileContents: string, mode: "gzip" | "json" = "gzip"): {error?: Error | ErrorHandler.TCError, template?: string, type?: string, name?: string} {
    //tokenize
    let script = fileContents
    let tokenResults: Tokenizer.TokenizerResults

    try {
        tokenResults = Tokenizer.Tokenize(script, { "mode": "getTokens" }) as Tokenizer.TokenizerResults
    } catch (e) {
        return {error: e}
    }

    //compile
    let compiledResults: LineCompiler.CompileResults
    try {
        compiledResults = LineCompiler.CompileLines(tokenResults.Lines)
    } catch (e) {
        return {error: e}
    }

    let jsoned = LineCompiler.JSONize(compiledResults.code)
    let gzipped = LineCompiler.GZIP(jsoned)

    let finalOutput: string = ""
    switch (mode) {
        case "gzip":
            finalOutput = gzipped
            break
        case "json":
            finalOutput = jsoned
            break
        default:
            finalOutput = gzipped
            break
    }

    if (!compiledResults.type || !compiledResults.name) {return {}}

    return {template: finalOutput, type: compiledResults.type, name: compiledResults.name}
}

export async function CompileProject(path: string): Promise<CompiledProjectTemplates> {
    if (!path.endsWith("/")) {path += "/"}
    let folderUrl = pathToFileURL(path)
    //error checking
    if (!(await fs.exists(folderUrl))) { 
        process.stderr.write("\nError: Provided path does not exist\n") 
        process.exit(1)
    }
    if (!(await fs.stat(folderUrl)).isDirectory()) { 
        process.stderr.write("\nError: Provided path is not a folder\n") 
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

    const files = await fs.readdir(folderUrl,{recursive: true},);

    await Promise.all(files.map(async (file) => {
        //ignore any files that aren't .tc
        if (!file.endsWith(".tc")) { return }
        try {
            let fileContents = (await fs.readFile(new URL(folderUrl+file))).toString()
            let compileResults = CompileFile(fileContents,"gzip")
            let codelineType = compileResults.type!

            //if this tc script has an error, print it and move on
            if (compileResults.error) {
                ErrorHandler.PrintError(compileResults.error,fileContents)
                failed = true
                return
            }

            if (results[categoryMap[codelineType]][compileResults.name] !== undefined) {
                process.stderr.write(`Error: Duplicate ${compileResults.type} '${compileResults.name}'\n`)
                failed = true
                return
            }
            
            results[categoryMap[codelineType]][compileResults.name] = compileResults.template
        } catch (e) {
            process.stderr.write(`Error while reading file '${file}': ${e} (this file will be skipped)\n`)
            return
        }
    }));

    if (failed) {
        process.exit(1)
    }

    return results
}