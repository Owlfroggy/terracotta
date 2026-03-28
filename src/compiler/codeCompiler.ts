import { ASTNode } from "../ast/astNode.ts";
import { EventStatement, FunctionStatement, ProcessStatement, Statement } from "../ast/statement.ts";
import { TokenType } from "../ast/token.ts";
import { DFCodeblockName } from "../df/actiondump.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { getOrCreateDictLayer, getOrCreateMapLayer, upperFirst } from "../util/utils.ts";
import { CodeBlock, EntityEventBlock, GameEventBlock, PlayerEventBlock } from "./codeBlock.ts";
import * as fflate from "fflate";
import * as AD from "../df/actiondump.ts";
import { ErrorType, TCError } from "../error/error.ts";

export type EventType = DFCodeblockName.PLAYER_EVENT | DFCodeblockName.ENTITY_EVENT | DFCodeblockName.GAME_EVENT;
export type UserMethodType = DFCodeblockName.FUNCTION | DFCodeblockName.PROCESS; 

export type HeaderType = EventType | UserMethodType;


function jsonize(line: CodeBlock[]): string {
    return JSON.stringify({blocks: line.map(b => b.templateForm())});
}

//stolen from the old version of terracotta which stole it from a previous project of mine which probably stole it from somewhere else
function gzipize(json: string): string {
    const uint8ToBase64 = (arr) => btoa(
        Array(arr.length)
            .fill('')
            .map((_, i) => String.fromCharCode(arr[i]))
            .join('')
    );

    var enc = new TextEncoder()
    const output = fflate.gzipSync(enc.encode(json), { level: 9, mtime: 0});

    return uint8ToBase64(output)
}

const tcEventToDf: Map<DFCodeblockName, {[tcName: string]: string}> = new Map();
for (const eventType of [DFCodeblockName.PLAYER_EVENT, DFCodeblockName.ENTITY_EVENT, DFCodeblockName.GAME_EVENT]) {
    let entries = {};
    tcEventToDf.set(eventType,entries);
    for (const action of Object.values(AD.actions.get(eventType)!)) {
        if (action.isLegacy) continue;
        entries[AD.getTCActionName(eventType, action.name)] = action.name;
    }
}

/**
 * =- TODO -=
 * initialize variables declared in the global scope
 * throw error for random crap being placed in the global scope
 * support multiple files 💀
 * functions and process statements (with parameters)
 */

export type CodeLineEntry = {
    headerBlock: CodeBlock | null,
    code: CodeBlock[][]
}

export class CodeCompiler {
    codeLines: Map<HeaderType, {[name: string]: CodeLineEntry}> = new Map();
    errors: TCError[] = [];

    constructor(
        public ast: Statement[],
        public environment: {types: TypeProcessor},
    ) {}

    reportError(startPos: number, endPos: number, message: string) {
        this.errors.push(new TCError(
            startPos, endPos,
            ErrorType.COMPILER,
            message
        ));
    }

    /**
     * Returns the codeline entry for given header type and name
     * Will create the entry if it doesn't exist
     */
    getLineEntry(headerType: HeaderType, name: string): CodeLineEntry {
        let entries = getOrCreateMapLayer(this.codeLines, headerType, {});
        return getOrCreateDictLayer<CodeLineEntry>(entries, name, {
            headerBlock: null,
            code: []
        })
    }

    /** Returns an array of statements which need to be compiled */
    processLineDeclarations(statements: Statement[]): Statement[] {
        let statementsToCompile: Statement[] = [];
        for (const s of statements) {
            if (s.headerType == null) continue; // maybe throw error here for the time being

            statementsToCompile.push(s);

            if (s instanceof EventStatement) {
                let headerType: HeaderType = DFCodeblockName[TokenType[s.type.type]];
                let tcEvent = s.eventName.value;

                let dfEvent = tcEventToDf.get(headerType)?.[tcEvent];
                if (dfEvent == undefined) {
                    this.reportError(
                        s.eventName.startPos, s.eventName.endPos, 
                        `Invalid ${headerType.toLowerCase()} '${tcEvent}'`
                    );
                    dfEvent = `$ERROR$ ${tcEvent}`;
                }

                let adAction = AD.actions.get(headerType)?.[dfEvent];

                let entry = this.getLineEntry(headerType, dfEvent);

                let blockConstructor = (
                    headerType == DFCodeblockName.PLAYER_EVENT ? PlayerEventBlock
                    : headerType == DFCodeblockName.ENTITY_EVENT ? EntityEventBlock 
                    : GameEventBlock
                );

                let lsCancel = false;
                for (const m of s.modifiers) {
                    if (m.type == TokenType.LAGSLAYER_CANCEL) {
                        if (adAction && !adAction.cancellable) {
                            this.reportError(
                                m.startPos, m.endPos, 
                                `${upperFirst(headerType.toLowerCase())} '${tcEvent}' cannot be cancelled automatically`
                            );
                        }
                        lsCancel = true;
                    }
                }

                entry.headerBlock = new blockConstructor({event: dfEvent, lsCancel: lsCancel, astNode: s});
            }
        }

        return statementsToCompile;
    }

    compile({outputFormat}: {outputFormat: "JSON" | "GZIP" | "DFONLINE"}) {
        this.processLineDeclarations(this.ast);
        
        let finalCodeLines: CodeBlock[][] = [];
        for (let [headerType, lineList] of this.codeLines.entries()) {
            for (let [name, line] of Object.entries(lineList)) {
                // TODO: handle line.headerBlock being null by subbing in a default value
                finalCodeLines.push(
                    [line.headerBlock!, ...line.code.flat()]
                );
            }
        }

        switch (outputFormat) {
            case "JSON":    return finalCodeLines.map(l => jsonize(l));
            case "GZIP":    return finalCodeLines.map(l => gzipize(jsonize(l)));
            case "DFONLINE":return finalCodeLines.map(l => `https://dfonline.dev/edit/?template=${gzipize(jsonize(l))}`);
        }
    }
}