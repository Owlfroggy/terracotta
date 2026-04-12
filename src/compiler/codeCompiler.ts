import { ASTNode } from "../ast/astNode.ts";
import { DoStatement, EventStatement, ExpressionStatement, IfStatement, Statement } from "../ast/statement.ts";
import { TokenType } from "../ast/token.ts";
import { TypeProcessor, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { getOrCreateDictLayer, getOrCreateMapLayer, upperFirst } from "../util/utils.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock, EventBlock, IfBlock } from "./codeBlock.ts";
import * as fflate from "fflate";
import * as AD from "../df/actiondump.ts";
import { ErrorType, TCError, TCNodeError } from "../error/error.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, CallExpression, ChunkExpression, Expression, GroupExpression, TypecastExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { CodeValue, EmptyValue, FunctionValue, MissingValue, NamespaceValue, NumberValue, StringValue, StyledTextValue, TangibleValue, VariableValue } from "./codeValue.ts";
import { Namespace } from "./namespace/namespace.ts";
import { TempVarProvider } from "./tempVarProvider.ts";
import { Operations } from "./operations.ts";
import { DefinitionType } from "./namespace/definition.ts";
import { Type } from "../typeProcessor/type.ts";
import { DFCodeblockName } from "../df/constants.ts";

export type EventType = DFCodeblockName.PLAYER_EVENT | DFCodeblockName.ENTITY_EVENT | DFCodeblockName.GAME_EVENT;
export type UserMethodType = DFCodeblockName.FUNCTION | DFCodeblockName.PROCESS; 

export type HeaderType = EventType | UserMethodType;

export type CompliationEnvironment = {types: TypeProcessor};
export type EvaluationContext = {
    tvp: TempVarProvider,
    types: TypeProcessor,
    reportError: (node: ASTNode, message: string) => void,
}

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

export const tcEventToDf: Map<DFCodeblockName, {[tcName: string]: string}> = new Map();
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
 * better error for trying to use an operator with no definitions
 * throw an error for this kinda thing: line value: str; >> global value: num << ; value = 5;
 */

export type CodeLineEntry = {
    headerBlock: CodeBlock | null,
    code: CodeBlock[][]
}

export class CodeCompiler {
    codeLines: Map<HeaderType, {[name: string]: CodeLineEntry}> = new Map();
    errors: TCError[] = [];

    readonly tempVarProvider = new TempVarProvider();

    constructor(
        public ast: Statement[],
        public env: CompliationEnvironment,
    ) {}

    getEvaluationContext(): EvaluationContext {
        return {
            tvp: this.tempVarProvider,
            types: this.env.types,
            reportError: this.reportError,
        }
    }

    reportError = (node: ASTNode, message: string) => {
        this.errors.push(new TCNodeError(
            node,
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

        // used for throwing errors when having duplicate declarations
        let statementMap: Map<HeaderType, Map<string, Statement[]>> = new Map();

        for (const s of statements) {
            if (s.headerType == null) continue; // maybe throw error here for the time being

            let lineEntry: CodeLineEntry;

            if (s instanceof EventStatement) {
                let headerType: HeaderType = DFCodeblockName[TokenType[s.type.type]];
                let tcEvent = s.eventName.value;

                let dfEvent = tcEventToDf.get(headerType)?.[tcEvent];
                if (dfEvent == undefined) {
                    this.reportError(
                        s.eventName,
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
                                m,
                                `${upperFirst(headerType.toLowerCase())} '${tcEvent}' cannot be cancelled automatically`
                            );
                        }
                    }
                }

                statementMap.getOrInsert(s.headerType,new Map()).getOrInsert(tcEvent,[]).push(s);
                lineEntry.headerBlock = new EventBlock(headerType, {action: dfEvent, lsCancel: lsCancel, astNode: s});
            }
            else {
                //TODO: this is very temporary
                throw new Error(`no idea how to compile this: ${JSON.stringify(s)}`);
            }

            declarationsToCompile.push([lineEntry, s]);
        }

        // errors for duplicate definitions
        for (const [headerType, declarations] of statementMap.entries()) {
            for (const [name, statements] of declarations.entries()) {
                if (statements.length <= 1) continue;
                for (const statement of statements) {
                    this.reportError(
                        statement instanceof EventStatement ? statement.eventName : statement,
                        `${upperFirst(headerType.toLowerCase())} '${name}' declared in multiple places`
                    );
                }
            } 
        }

        return declarationsToCompile;
    }

    compileExpression(e: Expression): [CodeValue, CodeBlock[]] {
        // TODO: structure this and the compileStatement thing more like how the parser does stuff
        if (e instanceof BinaryExpression) {
            let [left, lCode] = this.compileExpression(e.left);
            let [right, rCode] = this.compileExpression(e.right);
            let [result, oprCode] = Operations.evaluateBinaryValue(
                left, e.operator, right, 
                this.getEvaluationContext()
            )
            return [result, [...lCode, ...rCode, ...oprCode]];
        }
        if (e instanceof UnaryPrefixExpression) {
            let [right, rCode] = this.compileExpression(e.right);
            let [result, oprCode] = Operations.evaluateUnaryValue(
                e.operator, right, 
                this.getEvaluationContext()
            )
            return [result, [...rCode, ...oprCode]];
        }
        else if (e instanceof CallExpression) {
            let [callee, preCode] = this.compileExpression(e.callee);
            if (callee instanceof FunctionValue) {
                // parse args
                let args: CodeValue[] = [];
                let namedArgs: Map<AtomicExpression, CodeValue> = new Map();
                let seenNames: {[name: string]: true} = {};
                let argCode: CodeBlock[] = [];
                for (const argNode of e.args.elements) {
                    //named arg
                    if (argNode instanceof BinaryExpression && argNode.operator.type == TokenType.EQUALS) {
                        let name = argNode.left;
                        if (!(name instanceof AtomicExpression && (name.token.type == TokenType.IDENTIFIER || name.token.type == TokenType.STRING_LITERAL))) {
                            this.reportError(
                                name,
                                `Argument name must be an identifier or string literal`
                            );
                            continue;
                        }
                        if (name.token.value in seenNames) {
                            this.reportError(
                                argNode,
                                `Argument '${name.token.value}' provided in multiple places`
                            );
                            continue;
                        }

                        seenNames[name.token.value] = true;

                        let [value, code] = this.compileExpression(argNode.right);
                        namedArgs.set(name, value);
                        argCode.push(...code);
                    } 
                    //normal arg
                    else {
                        let [value, code] = this.compileExpression(argNode);
                        args.push(value)
                        argCode.push(...code);
                    }
                   
                }
                // TODO: args
                // TODO: handle return types
                let [value, code] = callee.definition.compile(args,namedArgs, this.getEvaluationContext());
                value.astNode = e;
                return [value, [...preCode, ...argCode, ...code]];
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
                        e.propertyName,
                        `'${e.propertyName.value}' is not a property of '${accessee.namespace.identifier}''`
                    )
                    return [new MissingValue(e), preCode];
                }
                else if (definition.definitionType == DefinitionType.FUNCTION) {
                    return [new FunctionValue(definition, e), preCode];
                }
                else if (definition.definitionType == DefinitionType.VALUE) {
                    return definition.compile(this.getEvaluationContext());
                }
                else {
                    return [new MissingValue(e), preCode];
                }
            } else {
                if (!(accessee instanceof MissingValue)) {
                    this.reportError(
                        e.propertyName,
                        `Property access not allowed on type '${accessee.getType(this.getEvaluationContext()).name}'` // TODO: better error message
                    );
                }
                return [new MissingValue(e), preCode];
            }
        }
        else if (e instanceof VariableExpression) {
            // throw error for type annotation in bad place
            if (
                e.assignedType &&
                !(
                    // in here go cases where type annotation **is** allowed
                    (e.parent && e.parent instanceof BinaryExpression && Operations.isAssignmentOperator(e.parent.operator.type) && e.parent.parent instanceof ExpressionStatement)
                    || (e.parent && e.parent instanceof ExpressionStatement)
                )
            ) {
                this.reportError(
                    e.assignedType,
                    `Variable type annotation is not allowed here`
                );
            }

            // 
            return [new VariableValue(e.name.value, VariableScope[TokenType[e.scope.type]], undefined, e), []];
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
                    let frame = this.env.types.getNodeFrame(e);
                    let varEntry = frame.getVariableEntry(e.token.value, e.token.startPos);
                    if (varEntry) {
                        return [new VariableValue(varEntry.id.name, varEntry.id.scope, varEntry.type ?? undefined, e), []];
                    }
                    this.reportError(
                        e,
                        `Could not resolve identifier '${e.token.value}'`
                    );
                    return [new MissingValue(e), []];
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
        else if (e instanceof TypecastExpression) {
            let [value, valueCode] = this.compileExpression(e.left);
            let type = this.env.types.evaluateExplicitType(e.type);
            // this is definitely in the runnings for "most sinful code i've ever written"
            value.getType = () => type;
            return [value, valueCode];
        }
        else if (e instanceof GroupExpression) {
            return this.compileExpression(e.expression);
        }
        throw new Error(`no idea how to compile this: ${e.constructor.name}`);
    }

    compileStatement = (s: Statement): CodeBlock[] => {
        if (s instanceof ExpressionStatement) {
            let e = s.expression;
            // variable assignment
            if (e instanceof BinaryExpression && Operations.isAssignmentOperator(e.operator.type)) {
                let [variable, _] = this.compileExpression(e.left);
                let [value, valueCode] = this.compileExpression(e.right);
                
                // incrementor operators
                if (e.operator.type != TokenType.EQUALS) {
                    let [newValue, newCode] = Operations.evaluateBinaryValue(variable, e.operator, value, this.getEvaluationContext())
                    value = newValue;
                    valueCode = [...valueCode, ...newCode];
                }

                if (!(
                    (e.left.getRealExpression() instanceof VariableExpression)
                    || (e.left.getRealExpression() instanceof AtomicExpression && variable instanceof VariableValue)
                )) {
                    this.reportError(
                        e.left,
                        `Left-hand side of an assignment statement must be a variable`
                    )
                    return [];
                }

                let valueType = value.getType(this.getEvaluationContext());
                if (!Type.assignableTypes.has(valueType.name)){
                    this.reportError(
                        e.right,
                        `Type '${valueType.name}' cannot be stored in variables`
                    );
                    return [];
                }

                if (!(value instanceof TangibleValue)) {
                    if (!(value instanceof MissingValue)) {
                        this.reportError(
                            value.astNode ?? e,
                            `${value.constructor.name} cannot be stored in variables`
                        );
                    }
                    
                    return [];
                }


                return [...valueCode, new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "=",
                    args: [variable as VariableValue,value]
                })]
            } 

            // all other expressions
            else {
                let [_, code] = this.compileExpression(e);
                return code;
            }
        }
        else if (s instanceof IfStatement) {
            let [value, code] = this.compileExpression(s.condition);
            if (!(value instanceof TangibleValue))
                throw new Error(`got ${value.constructor.name} as if statement value :(`);
            
            return [
                ...code,
                new IfBlock(DFCodeblockName.IF_VARIABLE,{
                    action: "!=",
                    args: [value, new NumberValue("0")],
                }),
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.OPEN}),
                    ...s.chunk.statements.map(this.compileStatement).flat(),
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.CLOSE}),
            ];
        }
        else if (s instanceof DoStatement) {
            if (s.whileKeyword && s.whileCondition) {
                // TODO: while stuff
            } else {
                return s.chunk.statements.map(this.compileStatement).flat();
            }
        }
        return [];
    }

    compile({outputFormat}: {outputFormat: "GZIP" | "DFONLINE"}) {
        this.errors.length = 0;
        
        let declarationsToCompile = this.processLineDeclarations(this.ast);

        for (const [lineEntry, declaration] of declarationsToCompile) {
            if (declaration instanceof EventStatement) {
                if (!(declaration.chunk instanceof ChunkExpression)) continue;
                lineEntry.code.push(...declaration.chunk.statements.map(this.compileStatement));
            }
        }

        //=- join code lines together and export them -=\\
        
        let output: Map<HeaderType, {[name: string]: string}> = new Map([
            [DFCodeblockName.PLAYER_EVENT, {}],
            [DFCodeblockName.ENTITY_EVENT, {}],
            [DFCodeblockName.GAME_EVENT, {}],
            [DFCodeblockName.FUNCTION, {}],
            [DFCodeblockName.PROCESS, {}],
        ]);
        for (let [headerType, lineList] of this.codeLines.entries()) {
            for (let [name, line] of Object.entries(lineList)) {
                let allCode = [line.headerBlock!, ...line.code.flat()];
                let serialized: string = "error :(";
                if (outputFormat == "DFONLINE") {
                    serialized = `https://dfonline.dev/edit/?template=${gzipize(jsonize(allCode))}`;
                } else {
                    serialized = gzipize(jsonize(allCode));
                }

                output.get(headerType)![name] = serialized;
            }
        }

        return output;
    }
}