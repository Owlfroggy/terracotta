import { ASTNode } from "../ast/astNode.ts";
import { EventStatement, ExpressionStatement, FunctionStatement, ProcessStatement, Statement } from "../ast/statement.ts";
import { TokenType } from "../ast/token.ts";
import { DFCodeblockName } from "../df/actiondump.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import { getOrCreateDictLayer, getOrCreateMapLayer, upperFirst } from "../util/utils.ts";
import { CodeBlock, EventBlock } from "./codeBlock.ts";
import * as fflate from "fflate";
import * as AD from "../df/actiondump.ts";
import { ErrorType, TCError } from "../error/error.ts";
import { AccessExpression, AtomicExpression, CallExpression, Expression } from "../ast/expression.ts";
import { callbackify } from "node:util";
import { CodeValue, EmptyValue, FunctionValue, MissingValue, NamespaceValue, NumberValue, StringValue, StyledTextValue } from "./codeValue.ts";
import { Namespace } from "./namespace/namespace.ts";
import { access } from "node:fs";
import { DefinitionType } from "./namespace/functionDefinition.ts";

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
    ) {

    }

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
    processLineDeclarations(statements: Statement[]): [lineEntry: CodeLineEntry, statement: Statement][] {
        let declarationsToCompile: [CodeLineEntry, Statement][] = [];
        for (const s of statements) {
            if (s.headerType == null) continue; // maybe throw error here for the time being

            let lineEntry: CodeLineEntry;

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

                lineEntry = this.getLineEntry(headerType, dfEvent);

                let lsCancel = false;
                for (const m of s.modifiers) {
                    if (m.type == TokenType.LAGSLAYER_CANCEL) {
                        lsCancel = true;
                    
                        if (adAction && !adAction.cancellable) {
                            this.reportError(
                                m.startPos, m.endPos, 
                                `${upperFirst(headerType.toLowerCase())} '${tcEvent}' cannot be cancelled automatically`
                            );
                        }
                    }
                }

                lineEntry.headerBlock = new EventBlock(headerType, {action: dfEvent, lsCancel: lsCancel, astNode: s});
            }
            else {
                //TODO: this is very temporary
                throw new Error(`no idea how to compile this: ${JSON.stringify(s)}`);
            }

            declarationsToCompile.push([lineEntry, s]);
        }

        return declarationsToCompile;
    }

    compileExpression(e: Expression): [CodeValue, CodeBlock[]] {
        // TODO: structure this and the compileStatement thing more like how the parser does stuff
        if (e instanceof CallExpression) {
            let [callee, preCode] = this.compileExpression(e.callee);
            if (callee instanceof FunctionValue) {
                // parse args
                let args: CodeValue[] = [];
                let argCode: CodeBlock[] = [];
                for (const argNode of e.args.elements) {
                    let [value, code] = this.compileExpression(argNode);
                    args.push(value)
                    argCode.push(...code);
                }
                // TODO: args
                // TODO: handle return types
                let [value, code] = callee.definition.compile(args,{});
                return [new EmptyValue(e), [...preCode, ...argCode, ...code]];
            }
            else {
                return [new MissingValue(e), [...preCode]];
            }
        }
        else if (e instanceof AccessExpression) {
            let [accessee, preCode] = this.compileExpression(e.accessee);
            // TODO: handle accessee being missing value
            if (accessee instanceof NamespaceValue) {
                let definition = accessee.namespace.members[e.propertyName.value];
                if (definition == undefined) {
                    // todo: special error messages for if the namespace is a player action or game action or whatever
                    this.reportError(
                        e.propertyName.startPos, e.propertyName.endPos,
                        `'${e.propertyName.value}' is not a property of '${accessee.namespace.identifier}''`
                    )
                    return [new MissingValue(e), preCode];
                }
                else if (definition.definitionType == DefinitionType.FUNCTION) {
                    return [new FunctionValue(definition, e), preCode];
                }
                else {
                    return [new MissingValue(e), preCode];
                }
            } else {
                if (!(accessee instanceof MissingValue)) {
                    this.reportError(
                        e.propertyName.startPos, e.propertyName.endPos,
                        `Property access not allowed on this value` // TODO: better error message
                    );
                }
                return [new MissingValue(e), preCode];
            }
        }
        else if (e instanceof AtomicExpression) {
            switch (e.token.type) {
                // identifier resolution all happens here
                case TokenType.IDENTIFIER: {
                    let value = e.token.value;
                    if (value in Namespace.registry) {
                        let namespace = Namespace.registry[value];
                        return [new NamespaceValue(namespace, e), []];
                    }
                    this.reportError(
                        e.startPos, e.endPos,
                        `Could not resolve identifier '${e.token.value}'`
                    );
                }
                case TokenType.NUMERIC_LITERAL: {
                    return [new NumberValue(e.token.value,e), []];
                }
                case TokenType.STRING_LITERAL: {
                    return [new StringValue(e.token.value,e), []];
                }
                case TokenType.STYLED_LITERAL: {
                    return [new StyledTextValue(e.token.value,e), []];
                }
                default: {
                    return [new MissingValue(e), []];
                }
            }
        }
        throw new Error(`no idea how to compile this: ${e.constructor.name}`);
    }

    compileStatement = (s: Statement): CodeBlock[] => {
        if (s instanceof ExpressionStatement) {
            // TODO: variable assignment
            let [_, code] = this.compileExpression(s.expression);
            return code;
        }
    }

    compile({outputFormat}: {outputFormat: "JSON" | "GZIP" | "DFONLINE"}) {
        let declarationsToCompile = this.processLineDeclarations(this.ast);

        for (const [lineEntry, declaration] of declarationsToCompile) {
            if (declaration instanceof EventStatement) {
                lineEntry.code.push(...declaration.chunk.statements.map(this.compileStatement));
            }
        }

        //=- join code lines together and export them -=\\
        
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