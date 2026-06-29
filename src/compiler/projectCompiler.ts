import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Lexer } from "../parser/lexer.ts";
import { Statement } from "../ast/statement.ts";
import { Parser } from "../parser/parser.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { ErrorType, TCError, TCManualError } from "../error/error.ts";
import { CodeCompiler } from "./codeCompiler.ts";
import { DFCodeblockName, DFRank } from "../df/constants.ts";
import { ItemLibrary } from "./itemLibrary.ts";

export type CompiledTemplate = string

// TODO: update this
export interface CompiledProjectTemplates {
    errors: TCError[];
    /** Key: event df name */
    playerEvents: {[key: string]: CompiledTemplate}
    /** Key: event df name */
    entityEvents: {[key: string]: CompiledTemplate}
    /** Key: event df name */
    gameEvents: {[key: string]: CompiledTemplate}
    /** Key: function name */
    functions: {[key: string]: CompiledTemplate}
    /** Key: function name */
    processes: {[key: string]: CompiledTemplate}
}

export async function compileProject(projectPath: string, plotSize: number, rank: DFRank): Promise<CompiledProjectTemplates> {
    let statements: Statement[] = [];
    let itemLibraries: {[id: string]: ItemLibrary} = {};

    let errors: TCError[] = [];

    let files = await fs.readdir(projectPath, {recursive: true, withFileTypes: true})
    let lexer = new Lexer();
    let parser = new Parser([]);
        
    for (const file of files) {
        if (!file.isFile()) continue;
        if (!(file.name.endsWith(".tc") || file.name.endsWith(".tcil"))) continue;
        let fullPath = path.join(file.parentPath, file.name);
        let fileContents = (await fs.readFile(fullPath)).toString();

        if (file.name.endsWith(".tc")) {
            lexer.tokenize(fileContents, fullPath);
            errors.push(...lexer.errors);
    
            
            parser.tokens = lexer.tokens;
            let root = parser.parse();
            root.scriptContents = fileContents;
            root.filePath = fullPath;
            errors.push(...parser.errors);
            statements.push(...root.statements);
        }
        else if (file.name.endsWith(".tcil")) {
            try {
                // TODO: find an nbt library that works and do validation here
                // TODO: also validate the json
                let lib: ItemLibrary = JSON.parse(fileContents);
                if (lib.id in itemLibraries) {
                    errors.push(new TCManualError(0, 0, fileContents, fullPath, ErrorType.ITEM_LIBRARY, `Multiple item libraries with id '${lib.id}'`))
                } else {
                    itemLibraries[lib.id] = lib;
                }
            } catch (ignored) {}
        }
    }

    let typeProcessor = new TypeProcessor();
    typeProcessor.collectionStage(statements);
    typeProcessor.evaluationStage()
    errors.push(...typeProcessor.errors);

    let codeCompiler = new CodeCompiler(statements, {
        types: typeProcessor, 
        rank: rank,
        getItemLibraries: () => itemLibraries,
        optimizationsEnabled: true
    });
    for (const lib of Object.values(itemLibraries)) codeCompiler.compileItemLibrary(lib);
    let templates = codeCompiler.compile({outputFormat: "GZIP", splitToLength: plotSize});
    errors.push(...codeCompiler.errors);

    return {
        errors: errors,
        playerEvents: templates.get(DFCodeblockName.PLAYER_EVENT)!,
        entityEvents: templates.get(DFCodeblockName.ENTITY_EVENT)!,
        gameEvents: templates.get(DFCodeblockName.GAME_EVENT)!,
        functions: templates.get(DFCodeblockName.FUNCTION)!,
        processes: templates.get(DFCodeblockName.PROCESS)!,
    }
}