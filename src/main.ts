import { parseArgs } from "node:util";
import { CodeCompiler } from "./compiler/codeCompiler.ts";
import { registerBuiltinNamespaces } from "./compiler/namespace/builtins.ts";
import { Lexer } from "./parser/lexer.ts";
import { Parser } from "./parser/parser.ts";
import { TypeProcessor } from "./typeProcessor/typeProcessor.ts";
import { dirWithoutRelations, visualizeStatements } from "./util/debug.ts";
import * as ncp from "copy-paste"
import * as fs from "node:fs/promises"
import { compileProject } from "./compiler/projectCompiler.ts";
import { printError } from "./error/errorHandler.ts";
import { LanguageServer } from "./languageServer/languageServer.ts";
import { DFRank } from "./df/constants.ts";
import { PCodeParser } from "./pcode/pcodeParser.ts";

registerBuiltinNamespaces()

// todo: figure out why this needs to be here and fix it
// probably by doing a custom loading order
new Lexer();
new Parser([]);
new CodeCompiler([],{types: new TypeProcessor(), rank: DFRank.OVERLORD, getItemLibraries: () => ({}), optimizationsEnabled: false});

let test = `
playerevent join {
    default.sendMessage(s"dingus" as str + "dongus");
    line zero = defaultEntity.getTag("jklasfgd") as str;
    default.sendMessage("one: " + (zero + 1));
}
`

async function Main() {
    const options = {
        //if true, copy the result to the clipboard (only works with file mode)
        copy: { type: "boolean" },
        //how long the codespace is in minecraft blocks (used for auto-slicing codelines)
        //default is 99999, basically disabling slicing
        plotsize: { type: "string" },
        //what rank to check actions against
        //default is overlord
        rank: { type: "string" },
        
        //the file to take in (does not do anything in server mode)
        file: { type: "string" },
        //if true, compile inputted script or project
        /* only works for --file mode: */
        //"gzip": output gzipped df template json
        //"json": output stringified df template json
        //"none": dont output any templates (can be used for validation or debugging)
        //default is "gzip"
        outmode: { type: "string" },
        

        //the project to take in (does not do anything in server mode) (incompatible with --file)
        project: { type: "string" },
        //if true, output sorted by codeline type
        //if false, output every template seperated by newline with
        includemeta: { type: "boolean" },

        debugprint: {type: "boolean"},
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
            process.exit(1)
        }

        let rank: DFRank = DFRank.OVERLORD
        if (values.rank) {
            if (!(rank.toUpperCase() in DFRank)) {
                process.stderr.write(`\nError: ${values.rank} is not a valid rank. Acceptable values are: unranked, noble, emperor, mythic, overlord`)
                process.exit(1)
            }
            rank = DFRank[values.rank.toUpperCase()]
        }

        let output: string = ""

        if (values.file) {
            let fileContents = (await fs.readFile(values.file)).toString();

            const lexer = new Lexer();
            lexer.tokenize(fileContents, values.file)
            
            const parser = new Parser(lexer.tokens);
            let root = parser.parse();
            root.scriptContents = fileContents;
            root.filePath = values.file;
            
            if (values.debugprint) {
                dirWithoutRelations(root.statements);
                // console.log("Errors: ", parser.errors);
                console.log("RECONSTRUCTION FROM AST --------------------")
                console.log(visualizeStatements(root.statements).join("\n"));
                console.log("--------------------------------------------")
            }

            const typeChecker = new TypeProcessor();
            typeChecker.collectionStage([root]);
            typeChecker.evaluationStage()

            if (values.debugprint) {
                console.log("type checker output-----")
                console.log(`${typeChecker.globalFrame}`);
            }

            const compiler = new CodeCompiler(root.statements, {types: typeChecker, rank, getItemLibraries: () => ({}), optimizationsEnabled: true});
            let results = compiler.compile({outputFormat: values.outmode?.toUpperCase() as any ?? "GZIP", splitToLength: parseInt(values.plotsize ?? "-1") ?? -1});

            let errors = [...lexer.errors, ...parser.errors, ...typeChecker.errors, ...compiler.errors];

            if (errors.length == 0) {
                if (values.includemeta) {
                    output = JSON.stringify(Object.fromEntries(results.entries()));
                } else {
                    output = [...results.values().map(v => Object.values(v).join('\n'))].join("\n");
                }
            } else {
                process.stderr.write("\n\n")
                for (const e of errors) {
                    printError(e, e.getFilePath());
                }
                process.exit(1);
            }
        }
        else if (values.project) {
            let results = await compileProject(values.project, parseInt(values.plotsize ?? "-1") ?? -1, rank);

            if (results.errors.length == 0) {
                if (values.includemeta) {
                    output = JSON.stringify(results)
                } else {
                    output = ""
                    for (const category of ["playerEvents","entityEvents","gameEvents","functions","processes"]) {
                        for (const template of Object.values(results[category])) {
                            output += template + "\n"
                        }
                    }
                    //chop off ending newline
                    output = output.substring(0,output.length - 1)
                }
            } else {
                process.stderr.write("\n")
                for (const e of results.errors) {
                    let fileName = e.getFilePath();
                    if (fileName.startsWith(values.project)) {
                        fileName = fileName.substring(values.project.length+1);
                    }
                    printError(e, fileName);
                }
                process.exit(1);
            }
        } else {
            process.stderr.write("\nError: --compile must be provided with either a file or a project\n")
        }

        if (values.outmode != "none") {
            //copy to clipboard if you're into that
            if (values.copy) {
                ncp.copy(output)
                process.stdout.write("Copied output to clipboard\n")
            } else {
                process.stdout.write(output)
            }
        }
    } 
    else if (command == "server") {
        new LanguageServer()
    }
}

await Main()