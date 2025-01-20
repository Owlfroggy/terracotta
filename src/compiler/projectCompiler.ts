import { fileURLToPath, pathToFileURL } from "node:url"
import * as Tokenizer from "../tokenizer/tokenizer.ts"
import * as ErrorHandler from "../util/errorHandler.ts"
import * as LineCompiler from "./codelineCompiler.ts"
import * as fs from "node:fs/promises"
import * as CodeblockNinja from "./codeblockNinja.ts"
import * as NBT from "nbtify"
import { COLOR } from "../util/characterUtils.ts"
import { URL } from "node:url"
import { Dict } from "../util/dict.ts"
import { walk } from "@std/fs"
import { getAllFilesInFolder } from "../util/utils.ts";

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

export interface ItemLibrary {
    compilationMode: "directInsert" | "insertByVar"
    id: string,
    items: Dict<{
        data: string,
        version: number,
        material: string,
        componentsString: string
    }>,
    lastEditedWithExtensionVerison: number
}

export interface CodeInjections {
    /** Blocks to place before script code */
    before: LineCompiler.CodeBlock[][],
    /** Blocks to place after script code */
    after: LineCompiler.CodeBlock[][]
}

export interface CompilationEnvironment {
    itemLibraries: Dict<ItemLibrary>
    /**To access the injections for a given line, do codeInjections[header][linename]["before"|"after"] */
    codeInjections: {
        playerEvents: Dict<CodeInjections>,
        entityEvents: Dict<CodeInjections>,
        functions: Dict<CodeInjections>,
        processes: Dict<CodeInjections>,
    }
    funcReturnTypes: Dict<string>
    skipConstructorValidation?: boolean
}


//maps a codeblock type to its category in project compile results
const categoryMap = {
    "PLAYER_EVENT": "playerEvents",
    "ENTITY_EVENT": "entityEvents",
    "FUNCTION": "functions",
    "PROCESS": "processes"
}

function getInjections(environment: CompilationEnvironment,header: "playerEvents" | "entityEvents" | "functions" | "processes",name: string) {
    let injections = environment.codeInjections[header][name]
    if (injections) {
        return injections
    } else {
        injections = {before: [], after: []}
        environment.codeInjections[header][name] = injections
        return injections
    }
}

export function CompileFile(fileContents: Tokenizer.TokenizerResults | ItemLibrary, maxLineLength: number, mode: "gzip" | "json" = "gzip", environment: CompilationEnvironment): FileCompileResults {
    let compiledResults: LineCompiler.CompileResults

    //for compiling .tc files
    if (fileContents instanceof Tokenizer.TokenizerResults) {
        //compile
        try {
            compiledResults = LineCompiler.CompileLines(fileContents.Lines,environment)
        } catch (e: any) {
            return {error: e}
        }
    }
    //for compiling library files
    else {
        try {
            compiledResults = LineCompiler.CompileLibrary(fileContents)
        } catch (e: any) {
            return {error: e}
        }
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
    
    let itemLibraries: Dict<ItemLibrary> = {} //key is library id
    let environment: CompilationEnvironment = {
        itemLibraries: itemLibraries,
        codeInjections: {
            playerEvents: {},
            entityEvents: {},
            functions: {},
            processes: {},
        },
        funcReturnTypes: {}
    }

    const files = await getAllFilesInFolder(folderUrl)

    //util functions
    function failAndPrintError(error: string) {
        process.stderr.write(error+"\n");
        failed = true
    }

    //scan for relevent file extensions
    let scriptFiles: string[] = []
    let itemLibraryFiles: string[] = []

    for (const filePath of files) {
        if (filePath.endsWith(".tc")) {
            scriptFiles.push(filePath)
        } else if (filePath.endsWith(".tcil")){ 
            itemLibraryFiles.push(filePath)
        }
    }

    //read and validate library files
    await Promise.all(itemLibraryFiles.map(async (file) => {
        //read file
        let fileContents: string
        try { fileContents = (await fs.readFile(file)).toString() } 
        catch (e) { process.stderr.write(`Error while reading file '${file}': ${e} (this file will be skipped)\n`); return }

        //parse json
        let library: ItemLibrary
        try { library = JSON.parse(fileContents) } 
        catch (e) { 
            failAndPrintError(`Error: Library at ${file} is not valid json (${e})\n`)
            return
        }

        //make sure all required fields exist
        for (const field of ["id","items","compilationMode"]) {
            if (!(field in library)) {
                failAndPrintError(`Error: Library at ${file} is missing the '${field}' field\n`)
                return
            }
        }

        //error for duplicate ids
        if (library.id in itemLibraries) {
            failAndPrintError(`Error: Duplicate library ${library.id}`)
            return
        }

        itemLibraries[library.id] = library

        //validate items
        for (const [itemId, item] of Object.entries(library.items)) {
            if (!item) {continue}
            let parsed: NBT.CompoundTag
            try {parsed = NBT.parse(item.data)}
            catch (e) {
                failAndPrintError(`Error: Item '${itemId}' in library '${library.id}' has invalid NBT`)
                continue
            }
            if (!parsed?.id) {
                failAndPrintError(`Error: Item '${itemId}' in library '${library.id}' has no id in its NBT`)
                continue
            }
            if (parsed?.components && NBT.getTagType(parsed.components) !== NBT.TAG.COMPOUND) {
                failAndPrintError(`Error: Item '${itemId}' in library '${library.id}' has a 'tag' field which is not a compound tag`)
                continue
            }
            item.material = parsed.id as string
            item.componentsString = parsed?.components ? NBT.stringify(parsed.components as NBT.RootTagLike) : "{}"
        }

        //compile this library's setup template
        let compileResults = CompileFile(library,data.maxCodeLineSize,"gzip",environment)
        if (compileResults.error) {
            failAndPrintError(`Error compiling library at ${file}: ${compileResults.error}`)
            return
        }

        //add all templates produced by the file to final result
        for (const result of compileResults.templates!) {
            if (results[categoryMap[result.type]][result.name] !== undefined) {
                failAndPrintError(`Error: Duplicate ${result.type} '${result.name}'\n`)
                return
            }

            results[categoryMap[result.type]][result.name] = result.template
        }
    }))

    //if item libraries exist, create the code to load their items on plot startup
    if (itemLibraryFiles.length > 0) {
        let injections = getInjections(environment,"playerEvents","Join").before
        let trackerVar = new LineCompiler.VariableItem([],"unsaved","@__TC_INTERNAL_ITEMSLOADED")

        let codeLine: LineCompiler.CodeBlock[] = [
            new LineCompiler.IfActionBlock("if_var","VarExists",[trackerVar],[],null,true),
            new LineCompiler.BracketBlock("open","if"),
                new LineCompiler.ActionBlock("set_var","=",[trackerVar,new LineCompiler.NumberItem([],"1")]),
                
                //sorted so that the output is deterministic
                ...Object.keys(itemLibraries).sort().map(libraryId => {
                    return new LineCompiler.ActionBlock("call_func",`@__TC_IL_${itemLibraries[libraryId]?.id}`)
                }),
            new LineCompiler.BracketBlock("close","if")
        ]
        injections.push(codeLine)
    }

    let tcTokenizerResults: Dict<Tokenizer.TokenizerResults> = {}
    let tcFileContents: Dict<string> = {}

    //tokenize and preprocess .tc scripts
    await Promise.all(scriptFiles.map(async (file) => {
        try {
            // read file
            let fileContents: string
            try { fileContents = (await fs.readFile(file)).toString() } 
            catch (e) { process.stderr.write(`Error while reading file '${file}': ${e} (this file will be skipped)\n`); return }
            tcFileContents[file] = fileContents
            
            //tokenize
            let tokenResults: Tokenizer.TokenizerResults
            try {
                tokenResults = Tokenizer.Tokenize(fileContents, { "mode": "getTokens" }) as Tokenizer.TokenizerResults
            } catch (e: any) {
                if (failed) {process.stderr.write("\n\n")}
                ErrorHandler.PrintError(e,fileContents,file.slice(path.length))
                failed = true
                return
            }
            tcTokenizerResults[file] = tokenResults

            // preprocess
            try {
                LineCompiler.PreProcess(tokenResults.Lines,environment)
            } catch (e: any) {
                if (failed) {process.stderr.write("\n\n")}
                ErrorHandler.PrintError(e,fileContents,file.slice(path.length))
                failed = true
                return
            }
        } catch (e) {
            process.stderr.write(`\n${COLOR.White}${"#".repeat(50)}\n${COLOR.Red}There was an internal error while compiling ${file}.\nPlease file a bug report containing the the below output and, if possible, the script that caused this error.\n${COLOR.White}${"#".repeat(50)}${COLOR.Reset}\n`)
            console.error(e)
            process.exit(1)
        }
    }));

    //compile .tc scripts
    if (!failed) {
        await Promise.all(scriptFiles.map(async (file) => {
            try {
                if (!tcFileContents[file]) { return }
                if (!tcTokenizerResults[file]) { return }
                let compileResults = CompileFile(tcTokenizerResults[file],data.maxCodeLineSize,"gzip",environment)
                //if this tc script has an error, print it and move on
                if (compileResults.error) {
                    if (failed) {process.stderr.write("\n\n")}
                    ErrorHandler.PrintError(compileResults.error,tcFileContents[file],file.slice(path.length))
                    failed = true
                    return
                }
    
                //add all templates produced by the file to final result
                for (const result of compileResults.templates!) {
                    if (results[categoryMap[result.type]][result.name] !== undefined) {
                        failAndPrintError(`Error: Duplicate ${result.type} '${result.name}'\n`)
                        return
                    }
        
                    results[categoryMap[result.type]][result.name] = result.template
                }
            } catch (e) {
                process.stderr.write(`\n${COLOR.White}${"#".repeat(50)}\n${COLOR.Red}There was an internal error while compiling ${file}.\nPlease file a bug report containing the the below output and, if possible, the script that caused this error.\n${COLOR.White}${"#".repeat(50)}${COLOR.Reset}\n`)
                console.error(e)
                process.exit(1)
            }
        }));
    }

    if (failed) {
        process.exit(1)
    }

    return results
}