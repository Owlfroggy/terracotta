import { ASTNode, RootNode } from "../ast/astNode.ts";
import { AssignmentStatement, DoStatement, EventStatement, ExpressionStatement, ForStatement, FunctionStatement, IfStatement, RepeatStatement, ReturnStatement, PerSelectedStatement, SingleKeywordStatement, Statement, WhileStatement, DeclareStatement } from "../ast/statement.ts";
import { Token, TokenType } from "../ast/token.ts";
import { isVariableEntry, TypeProcessor, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { getOrCreateDictLayer, getOrCreateMapLayer, ps, tcParseNumber, toNameCase, upperFirst } from "../util/utils.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock, ElseBlock, EventBlock, SubActionBlock } from "./codeBlock.ts";
import * as fflate from "fflate";
import * as AD from "../df/actiondump.ts";
import { ErrorType, TCError, TCNodeError, TCStandaloneError } from "../error/error.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, CallOrStartExpression, ChunkExpression, DictionaryExpression, Expression, GroupExpression, ListExpression, MissingExpression, PerSelectedExpression, SelectionExpression, TypecastExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { CodeValue, EmptyValue, FunctionValue, ItemValue, MissingValue, MultiValue, NamespaceValue, NumberValue, ParameterValue, LibraryItemValue, StringValue, StyledTextValue, TangibleValue, VariableValue } from "./codeValue.ts";
import { Namespace } from "./namespace/namespace.ts";
import { TempVarProvider } from "./tempVarProvider.ts";
import { Operations } from "./operations.ts";
import { DefinitionType, FunctionCallExtraInfo, FunctionDefinition, isFunctionDefinition } from "./namespace/definition.ts";
import { Type } from "../typeProcessor/type.ts";
import { DFCodeblockName, DFRank, dfTypeToTC, DFValueType, TC_HEADER, tcTypeToDFParamType } from "../df/constants.ts";
import { CodeOptimizer } from "./optimizer/optimizer.ts";
import { count } from "node:console";
import { FILTER_ACTIONS, REPEAT_ACTIONS, SELECT_ACTIONS } from "./namespace/builtins.ts";
import { isForLoopActionCall } from "../util/astUtils.ts";
import { PCodeParser } from "../pcode/pcodeParser.ts";
import { SegmentPCode } from "../pcode/pcode.ts";
import { BooleanOperation } from "./booleanOperation.ts";
import { GLOBAL_SCOPE_INJECTIONS } from "./namespace/globalScopeInjections.ts";
import { MAX_FUNCTION_PARAMS, SliceCodeLine, SPLIT_FAILED_ERROR_MESSAGE } from "./lineSplitter.ts";
import { ItemLibrary } from "./itemLibrary.ts";

export type EventType = DFCodeblockName.PLAYER_EVENT | DFCodeblockName.ENTITY_EVENT | DFCodeblockName.GAME_EVENT;
export type UserMethodType = DFCodeblockName.FUNCTION | DFCodeblockName.PROCESS; 

export type HeaderType = EventType | UserMethodType;

export type CompliationEnvironment = {
    types: TypeProcessor, 
    rank: DFRank,
    getItemLibraries: () => {[id: string]: ItemLibrary},
    optimizationsEnabled: boolean,
};
export type EvaluationContext = {
    tvp: TempVarProvider,
    types: TypeProcessor,
    rank: DFRank,
    getItemLibraries: () => {[id: string]: ItemLibrary},
    reportError: (node: ASTNode, message: string) => void,
}

type StatementContext = {
    lineStatement: FunctionStatement | EventStatement;
    lineEntry: CodeLineEntry;
    perSelectedMode?: boolean;
}
type ExpressionContext = {
    /** If present, compile temp vars with %uuid on the end */
    perSelectedMode?: boolean
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
    headerType: HeaderType,
    name: string,
    headerBlock: CodeBlock | null,
    /** Will be `null` for codelines that don't support return types (anything other than FUNCTION) */
    returnTypes: Type[] | null,
    code: CodeBlock[][]
}

export class CodeCompiler {
    codeLines: Map<HeaderType, {[name: string]: CodeLineEntry}> = new Map();
    errors: TCError[] = [];

    readonly tempVarProvider = new TempVarProvider();
    readonly perSelectedTempVarProvider = new TempVarProvider("%uuid");
    private pcodeParser = new PCodeParser();

    constructor(
        public ast: Statement[],
        public env: CompliationEnvironment,
    ) {}

    getEvaluationContext(perSelectedMode?: boolean): EvaluationContext {
        return {
            tvp: perSelectedMode ? this.perSelectedTempVarProvider : this.tempVarProvider,
            types: this.env.types,
            rank: this.env.rank,
            getItemLibraries: this.env.getItemLibraries,
            reportError: this.reportError,
        }
    }

    /** @param gateValue If gateValue is a MissingValue, this error will not be reported */
    reportError = (node: ASTNode, message: string, gateValue?: CodeValue) => {
        if (gateValue && gateValue instanceof MissingValue) return;
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
        let headerBlockConstructor = (headerType == DFCodeblockName.PROCESS || headerType == DFCodeblockName.FUNCTION ? ActionBlock : EventBlock);
        return getOrCreateDictLayer<CodeLineEntry>(entries, name, {
            headerType,
            name,
            headerBlock: new headerBlockConstructor(headerType, {action: name}),
            returnTypes: null,
            code: []
        })
    }

    /** Returns an array of statements which need to be compiled */
    processLineDeclarations(statements: Statement[]): [lineEntry: CodeLineEntry, statement: Statement][] {
        let declarationsToCompile: [CodeLineEntry, Statement][] = [];

        // used for throwing errors when having duplicate declarations
        let statementMap: Map<HeaderType, Map<string, Statement[]>> = new Map();

        for (const s of statements) {
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

                let adAction = AD.actions.get(headerType)?.[dfEvent]!;

                // rank check
                if (!AD.rankCheck(this.env.rank, adAction?.requiresRank)) {
                    this.reportError(
                        s.eventName, 
                        `${toNameCase(headerType)} '${tcEvent}' requires ${toNameCase(adAction.requiresRank)} rank, compiler is set to ${toNameCase(this.env.rank || "unranked")}`
                    );
                }

                lineEntry = this.getLineEntry(headerType, dfEvent);

                let lsCancel = false;
                for (const m of s.modifiers) {
                    if (m.type == TokenType.LAGSLAYER_CANCEL) {
                        lsCancel = true;
                    
                        if (adAction && !adAction.cancellable) {
                            this.reportError(
                                m,
                                `${toNameCase(headerType)} '${tcEvent}' cannot be cancelled automatically`
                            );
                        }
                    }
                }

                statementMap.getOrInsert(s.headerType,new Map()).getOrInsert(tcEvent,[]).push(s);
                lineEntry.headerBlock = new EventBlock(headerType, {action: dfEvent, lsCancel: lsCancel, astNode: s});
            }
            else if (s instanceof FunctionStatement) {
                let headerType: HeaderType = DFCodeblockName[TokenType[s.keyword.type]];
                // TODO: warning for trying to include pcodes in name
                
                let parameters: ParameterValue[] = [];
                if (s.params) {
                    let seenNames: Set<string> = new Set();
                    for (const param of s.params.elements) {
                        if (seenNames.has(param.name.value)) {
                            this.reportError(
                                param,
                                `Duplicate parameter '${param.name.value}'`
                            );
                            continue;
                        }
                        seenNames.add(param.name.value);

                        let dfType: string = "any";
                        let tcType: Type | null = null;
                        if (param.assignedType) {
                            tcType = this.env.types.evaluateExplicitType(param.assignedType.type);
                            if (tcType.name in tcTypeToDFParamType) {
                                dfType = tcTypeToDFParamType[tcType.name];
                            } else {
                                this.reportError(
                                    param.assignedType.type,
                                    `Type '${tcType.name}' cannot be passed to functions`
                                );
                            }
                        }

                        let plural = param.ellipses != null;
                        let optional = param.star != null;
                        let defaultValue: TangibleValue | null = null;

                        if (param.defaultValue) {
                            // TODO: maybe allow default values which produce codeblocks by initializing them in the func body
                            // this is tricky since you need a default which represents "undefined" and you can't just use 0
                            // since what if the user passes that in
                            let [item, code] = this.compileExpression(param.defaultValue, {});
                            if (item instanceof TangibleValue) {
                                defaultValue = item;
                            }
                            
                            if (plural) {
                                this.reportError(param.defaultValue, `Plural parameters cannot specify default values`);
                            }
                            if (!optional) {
                                this.reportError(param.defaultValue, `Default value can only be specified for optional parameters. Try adding a star '*' after this parameter's name.`);
                            }
                            if (tcType && (tcType.matches(Type.list) || tcType.matches(Type.dict) || tcType.matches(Type.var))) {
                                this.reportError(param.defaultValue, `Parameters of type '${tcType?.name}' cannot be assigned default values`);
                            } else if (tcType && !tcType.matches(Type.any) && !(item.getType(this.env.types).strictlyMatches(tcType))) {
                                this.reportError(param.defaultValue, `Default value type does not match stated parameter type`)
                            } else if (code.length != 0) {
                                this.reportError(param.defaultValue, `Parameter default value cannot produce codeblocks`);
                            }
                        }

                        if (tcType && tcType.matches(Type.var)) {
                            if (optional) this.reportError(param, `Variable parameters cannot be optional`);
                            if (plural) this.reportError(param, `Variable parameters cannot be plural`);
                        }

                        parameters.push(new ParameterValue(
                            param.name.value,
                            dfType,
                            plural,
                            optional,
                            defaultValue,
                            param
                        ))
                    }
                }

                let tcReturnTypes: Type[] = [];
                if (s.returnType) {
                    if (s.keyword.type == TokenType.FUNCTION) {
                        // handle all other return types
                        for (let i = 0; i < s.returnType.types.length; i++) {
                            let typeExpr = s.returnType.types[i];
                            let type = this.env.types.evaluateExplicitType(typeExpr);

                            if (type.matches(Type.void)) {
                                if (s.returnType.types.length > 1) {
                                    this.reportError(
                                        typeExpr,
                                        `Functions returning multiple values cannot return 'void'`
                                    );
                                }
                                continue;
                            }

                            tcReturnTypes.push(type);
                            if (type.name in tcTypeToDFParamType) {
                                parameters.splice(i, 0, new ParameterValue(
                                    `@__TC_RET_${i}`, 
                                    "var", 
                                    false, false, 
                                    null, 
                                    typeExpr
                                ));
                            } else {
                                this.reportError(
                                    typeExpr,
                                    `Type '${type.name}' cannot be returned from functions`
                                );
                            }
                        }
                    } else {
                        this.reportError(s.returnType, "Processes cannot return values");
                    }
                }

                if (parameters.length > MAX_FUNCTION_PARAMS) {
                    this.reportError(s.name,
                        s.returnType 
                        ? `Total number of parameters + total number of return values cannot exceed ${MAX_FUNCTION_PARAMS}.`
                        : `Total number of parameters cannot exceed ${MAX_FUNCTION_PARAMS}`
                    );
                }
                
                lineEntry = this.getLineEntry(headerType, s.name.value);
                if (headerType == DFCodeblockName.FUNCTION) lineEntry.returnTypes = tcReturnTypes;
                statementMap.getOrInsert(s.headerType, new Map()).getOrInsert(s.name.value,[]).push(s);
                lineEntry.headerBlock = new ActionBlock(s.headerType, {
                    action: s.name.value,
                    args: parameters
                })
            }
            else if (s instanceof DeclareStatement) {
                this.validateDeclareStatement(s, false);
                continue;
            }
            else if (s instanceof ExpressionStatement && s.expression instanceof VariableExpression) {
                continue;
            }
            else {
                this.reportError(s, "This kind of statement can only be placed in an event, function, or process");
                continue;
            }

            declarationsToCompile.push([lineEntry, s]);
        }

        // errors for duplicate definitions
        for (const [headerType, declarations] of statementMap.entries()) {
            for (const [name, statements] of declarations.entries()) {
                if (statements.length <= 1) continue;
                for (const statement of statements) {
                    this.reportError(
                        statement instanceof EventStatement ? statement.eventName 
                        : statement instanceof FunctionStatement ? statement.name
                        : statement,
                        `${toNameCase(headerType)} '${name}' declared in multiple places`
                    );
                }
            } 
        }

        return declarationsToCompile;
    }

    compileArgsList(argsList: ListExpression, context: ExpressionContext): [args: CodeValue[], namedArgs: Map<AtomicExpression, CodeValue>, argCode: CodeBlock[]] {
        let args: CodeValue[] = [];
        let namedArgs: Map<AtomicExpression, CodeValue> = new Map();
        let argCode: CodeBlock[] = [];
        let seenNames: {[name: string]: true} = {};
        for (const argNode of argsList.elements) {
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

                let [value, code] = this.compileExpression(argNode.right, context);
                namedArgs.set(name, value);
                argCode.push(...code);
            } 
            //normal arg
            else {
                let [value, code] = this.compileExpression(argNode, context);
                args.push(value)
                argCode.push(...code);
            }
            
        }
        return [args, namedArgs, argCode];
    }

    compileListContents(tempVar: VariableValue, contents: TangibleValue[]): CodeBlock[] {
        let code: CodeBlock[] = [];
        let currentChest: TangibleValue[] = [tempVar];
        let createBlockAdded = false;

        function pushCurrentChest() {
            if (currentChest.length <= 1 && code.length > 1) return;
            code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: !createBlockAdded ? "CreateList" : "AppendValue",
                args: [...currentChest]
            }));
            if (!createBlockAdded) createBlockAdded = true;
            currentChest = [tempVar]; 
        }

        for (const element of contents) {
            currentChest.push(element);
            if (currentChest.length >= 27) {
                pushCurrentChest();
            }
        }
        pushCurrentChest();
        return code;
    }

    compileCallExpression(e: CallExpression | CallOrStartExpression, definition: FunctionDefinition, context: ExpressionContext, extraInfo: FunctionCallExtraInfo = {}): [CodeValue, CodeBlock[]] {
        let [args, namedArgs, argCode] = this.compileArgsList(e.args, context);
        let [value, code] = definition.compile(args,namedArgs, this.getEvaluationContext(context.perSelectedMode), e, extraInfo);
        value.astNode = e;
        return [value, [...argCode, ...code]];
    }

    /** 
     * ASSUMES A SIMPLIFIED `BooleanOperation` IS BEING PASSED IN!!
     *  
     * PASSING IN A BOOLEAN OPERATION TREE WITH STACKED NEGATIONS WILL BREAK THINGS!
     * */
    compileBooleanOperation(e: BooleanOperation | Expression, body: CodeBlock[], context: ExpressionContext): CodeBlock[] {
        let invert = false;
        if (e instanceof BooleanOperation) {
            switch (e.operation) {
                case TokenType.BOOL_AND: {
                    return this.compileBooleanOperation(e.a, this.compileBooleanOperation(e.b!, body, context), context);
                }
                // TODO: optimize cases where you don't need an actual structural or (like val == 1 || val == 2)
                case TokenType.BOOL_OR: {
                    // BOOLEAN EXPRESSION CASE:
                    // if a IS a boolean expression, we can't rely on built-in if-else since
                    // a cannot be put into that if.
                    // therefore we need to keep track of whether or not a is true after it's
                    // evaluated so we can simulate an else block
                    if (e.a instanceof BooleanOperation) {
                        /* 
                        (default.isSneaking() && default.isSprinting())
                            || default.heldSlot == 5
                            || default.heldSlot == 4
                        */
                        // TODO: investigate whether or not run markers can be shared in cases like the above example
                        let runMarker = this.tempVarProvider.newTempVar(Type.num);
                        let runMarkerInitBlock = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                            action: "=",
                            args: [runMarker, new NumberValue("0")]
                        });
                        let runMarkerSetterBlock = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                            action: "=",
                            args: [runMarker, new NumberValue("1")]
                        });
                        return [
                            runMarkerInitBlock,
                            ...this.compileBooleanOperation(e.a, [runMarkerSetterBlock, ...body], context),
                            new ActionBlock(DFCodeblockName.IF_VARIABLE, {
                                action: "=",
                                args: [runMarker, new NumberValue("0")]
                            }),
                            new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
                                ...this.compileBooleanOperation(e.b!, [...body], context),
                            new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
                        ];
                    }
                    // BOOLEAN ATOM CASE: 
                    // if a isn't itself a boolean expression, we can use an if-else structure
                    // since a can be placed directly in the condition of that if.
                    // this avoids setting the temp var thats required in the run marker case
                    else {
                        return [
                            ...this.compileBooleanOperation(e.a, [...body], context),
                            new ElseBlock({}),
                            new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
                                ...this.compileBooleanOperation(e.b!, [...body], context),
                            new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
                        ];
                    }
                }
                case TokenType.BANG: {
                    if (e.a instanceof BooleanOperation)
                        throw new Error(`Non-atomic NOT operation supplied to compileBooleanOperation (${e})`);
                    invert = true;
                    e = e.a;
                    break;
                }
            }
        }

        let [val, valCode] = this.compileExpression(e, context);

        if (!(val instanceof TangibleValue)) {
            this.reportError(e, `Cannot check truthiness of '${val.constructor.name}'`, val);
            return [];
        }

        return [
            ...valCode,
            new ActionBlock(DFCodeblockName.IF_VARIABLE, {
                action: "!=",
                args: [val, new NumberValue("0")],
                not: invert,
            }),
            new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
                ...body,
            new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
        ]
    }

    compileExpression(e: Expression | Token, context: ExpressionContext): [CodeValue, CodeBlock[]] {
        // TODO: structure this and the compileStatement thing more like how the parser does stuff
        if (e instanceof Expression && BooleanOperation.exprIsBooleanExpression(e)) {
            // convert expression into BooleanOperation classes to make it easier to work with
            let operationTree = BooleanOperation.generateFromExpression(e);
            let simplified = BooleanOperation.simplify(operationTree);
            let output = this.tempVarProvider.newTempVar(Type.num);
            let code = [
                new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                    action: "=",
                    args: [output, new NumberValue("0")]
                }),
                ...this.compileBooleanOperation(simplified, [
                    new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                        action: "=",
                        args: [output, new NumberValue("1")]
                    })
                ], context)
            ];
            return [output, code];
        }
        else if (e instanceof BinaryExpression) {
            let [left, lCode] = this.compileExpression(e.left, context);
            let [right, rCode] = this.compileExpression(e.right, context);
            let [result, oprCode] = Operations.evaluateBinaryValue(
                left, e.operator, right, 
                this.getEvaluationContext(context.perSelectedMode)
            )
            return [result, [...lCode, ...rCode, ...oprCode]];
        }
        else if (e instanceof UnaryPrefixExpression) {
            let [right, rCode] = this.compileExpression(e.right, context);
            let [result, oprCode] = Operations.evaluateUnaryValue(
                e.operator, right, 
                this.getEvaluationContext(context.perSelectedMode)
            )
            return [result, [...rCode, ...oprCode]];
        }
        else if (e instanceof CallExpression) {
            let [callee, preCode] = this.compileExpression(e.callee, context);

            let definition: FunctionDefinition | null = null;
            let methodCallOf: TangibleValue | undefined;
            if (callee instanceof FunctionValue) {
                definition = callee.definition;
                methodCallOf = callee.methodCallOf;
            } else if (callee instanceof NamespaceValue) {
                if (callee.namespace.nameFunction) {
                    definition = callee.namespace.nameFunction;
                } else {
                    this.reportError(e.callee, `'${callee.namespace.identifier}' cannot be called as a function`, callee);
                }
            } 
            // error case; no definition could be found
            else {
                this.reportError(e.callee, `Type '${callee.getType(this.env.types).name}' cannot be called as a function`, callee);
            }

            if (definition) {
                let [value, code] = this.compileCallExpression(e, definition, context, {methodCallOf});
                return [value, [...preCode, ...code]];
            }
            else {
                return [new MissingValue(e), [...preCode]];
            }
        }
        else if (e instanceof CallOrStartExpression) {
            let [pcErrors, pcode] = this.pcodeParser.parse(e.callee.value);
            let isProcess = e.keyword.type == TokenType.START;

            // TODO: if all functions matching the provided pcode have the same signature, use that
            
            let definition = this.env.types.globalFrame![isProcess ? "processes" : "functions"].get(e.callee.value)?.[0];
            let isConstant = pcode.length == 1 && pcode[0] instanceof SegmentPCode;
            if (definition) {
                return this.compileCallExpression(e, definition, context);
            } else {
                if (isConstant) {
                    this.reportError(
                        e.callee,
                        `Invalid ${isProcess ? "process" : "function"} name '${e.callee.value}'`
                    );
                    return [new MissingValue(e), []];
                } else {
                    let [args, namedArgs, argCode] = this.compileArgsList(e.args, context);
                    let blockType = isProcess ? DFCodeblockName.START_PROCESS : DFCodeblockName.CALL_FUNCTION;
                    return [new EmptyValue(e), [...argCode, new ActionBlock(blockType, {
                        action: e.callee.value,
                    })]]
                }
            }
        }
        else if (e instanceof BracketedAccessExpression) {
            let [accessee, preCode] = this.compileExpression(e.accessee, context);

            let [accessor, accessorCode] = this.compileExpression(e.propertyName, context);
            preCode.push(...accessorCode);

            if (!(accessor instanceof TangibleValue)) {
                this.reportError(
                    e.propertyName,
                    `Type '${accessor.getType(this.env.types)}' cannot be used as an indexer`
                );
                return [new MissingValue(e), preCode];
            }

            let accesseeType = accessee.getType(this.env.types);
            let accessorType = accessor.getType(this.env.types);
            let accessorValue: number | string | undefined = undefined;
            if (accessor.isCompileTimeConstant()) {
                if (accessor instanceof NumberValue) {
                    let v = tcParseNumber(accessor.value as string);
                    if (!isNaN(v)) {
                        accessorValue = v;
                    }
                }
                else if (accessor instanceof StringValue) {
                    accessorValue = accessor.value;
                }
            }

            // list accessing
            if (accesseeType.matches(Type.list)) {
                if (!accessorType.matches(Type.num)) {
                    this.reportError(
                        e.propertyName,
                        `Type '${accessorType.name}' cannot be used to index into lists`
                    );
                    return [new MissingValue(e), preCode];
                }
                if (typeof accessorValue == "number") {
                    if (parseFloat((accessor as NumberValue).value as string) != accessorValue) {
                        this.reportError(
                            e.propertyName,
                            `List index must be a whole number`
                        );
                        return [new MissingValue(e), preCode];
                    }
                    if (accessorValue <= 0) {
                        this.reportError(
                            e.propertyName,
                            `List index must be >= 1${accessorValue == 0 ? " (lists start at index 1 in DiamondFire)" : ""}`
                        )
                        return [new MissingValue(e), preCode];
                    }
                }

                let tempVar = this.tempVarProvider.newTempVar(accesseeType.getMemberType(accessorValue));

                let codeBlock = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "GetListValue",
                    args: [tempVar, accessee as TangibleValue, accessor]
                })

                return [tempVar, [...preCode, codeBlock]];
            }
            // dict accessing
            else if (accesseeType.matches(Type.dict)) {
                if (!accessorType.matches(Type.str)) {
                    this.reportError(
                        e.propertyName,
                        `Type '${accessorType.name}' cannot be used to index into dictionaries, only strings are allowed as keys`
                    );
                    return [new MissingValue(e), preCode];
                }
                let tempVar = this.tempVarProvider.newTempVar(accesseeType.getMemberType(accessorValue));

                let codeBlock = new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "GetDictValue",
                    args: [tempVar, accessee as TangibleValue, accessor]
                })

                return [tempVar, [...preCode, codeBlock]];
            }
            // error
            else {
                this.reportError(
                    e.propertyName,
                    `Member access not allowed on type '${accessee.getType(this.env.types).name}'`,
                    accessee
                );
                return [new MissingValue(e), preCode];
            }
        }
        else if (e instanceof AccessExpression) {
            let [accessee, preCode] = this.compileExpression(e.accessee, context);
            let accesseeType = accessee.getType(this.env.types);

            let propertyName = e.propertyName.value;

            let definition = accesseeType.getPropertyDefinition(propertyName);
            if (definition == undefined) {
                // todo: special error messages for if the namespace is a player action or game action or whatever
                let name: string
                if (accessee instanceof NamespaceValue) {
                    name = `'${accessee.namespace.identifier}'`;
                } else {
                    name = accesseeType.name
                }
                this.reportError(
                    e.propertyName,
                    `'${propertyName}' is not a property of ${name}`,
                    accessee
                )
                return [new MissingValue(e), preCode];
            }
            else if (definition.definitionType == DefinitionType.FUNCTION) {
                return [new FunctionValue(definition, accessee instanceof TangibleValue ? accessee : undefined, e), preCode];
            }
            else if (definition.definitionType == DefinitionType.VALUE) {
                return definition.compile(this.getEvaluationContext(context.perSelectedMode));
            }
            else {
                return [new MissingValue(e), preCode];
            }

        }
        else if (e instanceof VariableExpression) {
            // throw error for type annotation in bad place
            if (
                e.assignedType &&
                !(
                    // in here go cases where type annotation **is** allowed
                    (e.parent && e.parent instanceof AssignmentStatement && e.keyInParent == 'leftValues')
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
        else if (e instanceof ListExpression) {
            let code: CodeBlock[] = [];
            let tempVar = this.tempVarProvider.newTempVar(this.env.types.evaluateExpression(e));
            
            let contents: TangibleValue[] = [];
            for (const element of e.elements) {
                let [value, valueCode] = this.compileExpression(element, context);
                code.push(...valueCode);
                if (!(value instanceof TangibleValue)) {
                    this.reportError(element, `${value.constructor.name} cannot be stored in lists`, value);
                    continue;
                }
                contents.push(value);
            }

            return [tempVar, [...code, ...this.compileListContents(tempVar, contents)]];
        }
        else if (e instanceof DictionaryExpression) {
            let code: CodeBlock[] = []
            let tempVar = this.tempVarProvider.newTempVar(this.env.types.evaluateExpression(e));
            let keysTempVar = this.tempVarProvider.newTempVar(Type.list(Type.str));
            let valuesTempVar = this.tempVarProvider.newTempVar(Type.list(Type.any));
            let keysContents: TangibleValue[] = [];
            let valuesContents: TangibleValue[] = [];

            let contents: TangibleValue[] = [];
            for (const entry of e.entries) {
                // variable key
                if (entry.key instanceof GroupExpression) {
                    let [key, keyCode] = this.compileExpression(entry.key, context);
                    let keyType = key.getType(this.env.types);
                    if (keyType.matches(Type.str) && key instanceof TangibleValue) {
                        code.push(...keyCode);
                        keysContents.push(key);
                    } else {
                        this.reportError(entry.key,`Expected type 'str' for dictionary key (got '${keyType.name}')`);
                        continue;
                    }
                } 
                // constant key
                else {
                    keysContents.push(new StringValue(entry.key.value, entry.key));
                }

                // value
                let [value, valueCode] = this.compileExpression(entry.value, context);
                if (!(value instanceof TangibleValue)) {
                    this.reportError(entry, `${value.constructor.name} cannot be stored in lists`, value);
                    continue;
                }
                code.push(...valueCode);
                valuesContents.push(value);
            }

            let keysCode = this.compileListContents(keysTempVar, keysContents);
            let valuesCode = this.compileListContents(valuesTempVar, valuesContents);

            return [tempVar, [...code, ...keysCode, ...valuesCode, new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: "CreateDict",
                args: [tempVar, keysTempVar, valuesTempVar]
            })]];
        }
        else if (e instanceof AtomicExpression) {
            return this.compileExpression(e.token, context);
        } 
        else if (e instanceof Token) {
            switch (e.type) {
                // identifier resolution all happens here
                case TokenType.IDENTIFIER: {
                    let resolved = this.env.types.resolveIdentifier(e);
                    if (resolved instanceof Namespace) {
                        return [new NamespaceValue(resolved, e), []];
                    } else if (isFunctionDefinition(resolved)) {
                        return [new FunctionValue(resolved, undefined, e), []];
                    } else if (isVariableEntry(resolved)) {
                        return [new VariableValue(resolved.id.name, resolved.id.scope, resolved.type ?? undefined, e), []];
                    }
                    this.reportError(
                        e,
                        `Could not resolve identifier '${e.value}'`
                    );
                    return [new MissingValue(e), []];
                }
                case TokenType.NUMERIC_LITERAL: {
                    return [new NumberValue(tcParseNumber(e.value).toString(),e), []];
                }
                case TokenType.STRING_LITERAL: {
                    return [new StringValue(e.value,e), []];
                }
                case TokenType.STYLED_LITERAL: {
                    return [new StyledTextValue(e.value,e), []];
                }
                default: {
                    return [new MissingValue(e), []];
                }
            }
        }
        else if (e instanceof TypecastExpression) {
            let [value, valueCode] = this.compileExpression(e.left, context);
            let type = this.env.types.evaluateExplicitType(e.type, {reportErrors: true});
            // this is definitely in the runnings for "most sinful code i've ever written"
            value.getType = () => type;
            return [value, valueCode];
        }
        else if (e instanceof GroupExpression) {
            return this.compileExpression(e.expression, context);
        }
        else if (e instanceof PerSelectedExpression) {
            return this.compileExpression(e.expression, {...context, perSelectedMode: true});
        }
        // compileStatement() handles the actual compilation of selection statements
        else if (e instanceof SelectionExpression) {
            if (!(e.parent instanceof CallExpression)) {
                this.reportError(e, `Expected argument list following action name`);
                return [new MissingValue(), []];
            }
            this.reportError(e.parent, `'${e.keyword.value}' must be a standalone statement`);
            return [new MissingValue(), []];
        }
        else if (e instanceof MissingExpression) {
            return [new MissingValue(e), []];
        }
        throw new Error(`no idea how to compile this: ${e.constructor.name}`);
    }

    compileIfStatement(condition: Expression, innerCode: CodeBlock[], invertEntireCondition: boolean, exprContext: ExpressionContext): CodeBlock[] {
        let operationTree: BooleanOperation | undefined;
        let realCondition = condition.getRealExpression();
        if (BooleanOperation.exprIsBooleanExpression(realCondition)) {
            operationTree = BooleanOperation.generateFromExpression(realCondition);
        }
        if (invertEntireCondition) {
            operationTree = new BooleanOperation(TokenType.BANG, operationTree ?? condition);
        }

        let directInsertBoolOpMode = false;
        let simplifiedBooleanExpression: BooleanOperation | Expression;
        if (operationTree) {
            simplifiedBooleanExpression = BooleanOperation.simplify(operationTree);
            if (simplifiedBooleanExpression instanceof BooleanOperation && BooleanOperation.isSinglePath(simplifiedBooleanExpression)) {
                directInsertBoolOpMode = true;
            }
        } else {
            simplifiedBooleanExpression = condition;
            directInsertBoolOpMode = true;
        }

        if (directInsertBoolOpMode) {
            return this.compileBooleanOperation(simplifiedBooleanExpression, innerCode, exprContext);
        } else {
            let value = this.tempVarProvider.newTempVar(Type.num);
            let valueCode = [
                new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                    action: "=",
                    args: [value, new NumberValue("0")]
                }),
                ...this.compileBooleanOperation(simplifiedBooleanExpression, [
                    new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                        action: "=",
                        args: [value, new NumberValue("1")]
                    })
                ], exprContext)
            ];

            return [
                ...valueCode,
                new ActionBlock(DFCodeblockName.IF_VARIABLE,{
                    action: "!=",
                    args: [value, new NumberValue("0")],
                }),
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.OPEN}),
                    ...innerCode,
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.CLOSE}),
            ];
        }
    }

    validateDeclareStatement(declareStatement: DeclareStatement, allowInitialization: boolean) {
        let keyword = declareStatement.keyword;
        let s = declareStatement.subStatement;
        let varExpressions: Expression[] = [];
            
        // error for applying 'declare' to invalid places
        if (s instanceof ExpressionStatement && s.expression instanceof VariableExpression) {
            varExpressions.push(s.expression);
        } else if (s instanceof AssignmentStatement) {
            varExpressions = s.leftValues;
            if (!allowInitialization && s.rightValue) {
                this.reportError(s.rightValue, "Variables cannot be assigned values here. Move this declaration into an event, function, or process.");
            }
        } else {
            this.reportError(keyword,"'declare' keyword cannot be used here");
        }

        for (let v of varExpressions) {
            if (v instanceof VariableExpression) {
                if (v.scope.type == TokenType.LINE) {
                    this.reportError(v, "Line variables cannot be globally declared");
                }
                let varId = v.getVarId();
                let varEntries = this.env.types.globalFrame.variables.get(varId.name)?.get(varId.scope);
                if (varEntries && varEntries.length > 1) {
                    this.reportError(v, `${toNameCase(v.scope.value)} variable '${varId.name}' declared in multiple places`);
                }
            }
            else if (v instanceof AtomicExpression && v.token.type == TokenType.IDENTIFIER) {
                this.reportError(v, "Variables must specify their scope to be globally declared");
            }
            else {
                this.reportError(v, "'declare' keyword cannot be applied to this value");
            }
        }
    }

    compileStatement = (s: Statement, context: StatementContext): CodeBlock[] => {
        if (s instanceof DeclareStatement) {
            this.validateDeclareStatement(s, true);
            s = s.subStatement;
        }

        let exprContext: ExpressionContext = {perSelectedMode: context.perSelectedMode};
        if (s instanceof ExpressionStatement) {
            let e = s.expression;

            // syntactic sugar for argless control functions
            if (e instanceof AtomicExpression && e.token.type == TokenType.IDENTIFIER) {
                let resolved = this.env.types.resolveIdentifier(e.token);
                let blockName: string | undefined;
                if (resolved == GLOBAL_SCOPE_INJECTIONS.wait) {
                    blockName = "Wait";
                } else if (resolved == GLOBAL_SCOPE_INJECTIONS.endthread) {
                    blockName = "End";
                } else if (resolved == GLOBAL_SCOPE_INJECTIONS.endallthreads) {
                    blockName = "EndAllThreads";
                }
                if (blockName) {
                    return [new ActionBlock(DFCodeblockName.CONTROL,{
                        action: blockName
                    })];
                }
            }
            
            // other argless control blocks
            // selection statements
            if (e instanceof CallExpression && e.callee instanceof SelectionExpression) {
                let selExpr = e.callee;
                let definitionBank = selExpr.keyword.type == TokenType.SELECT ? SELECT_ACTIONS : FILTER_ACTIONS
                if (!(selExpr.name.value in definitionBank)) {
                    this.reportError(selExpr.name, `Invalid ${selExpr.keyword.value} action '${selExpr.name.value}'`);
                    return [];
                }
                let definition = definitionBank[selExpr.name.value];

                // condition actions
                if (definition.action?.hasSubActions) {
                    let selAction = definition.action!;
                    if (e.args.elements.length > 1 || e.args.hasTrailingDelimiter) {
                        this.reportError(e.args, `Select action condition cannot have multiple arguments`);
                        return [];
                    } else if (e.args.elements.length == 0) {
                        this.reportError(e.args, `Expected condition inside parentheses`);
                        return [];
                    }
                    let conditionExpr = e.args.elements[0];
                    let oprTree = BooleanOperation.generateIfPossible(conditionExpr);
                    if (e.callee.inverterToken) oprTree = new BooleanOperation(TokenType.BANG, oprTree);
                    if (oprTree instanceof BooleanOperation) oprTree = BooleanOperation.simplify(oprTree);
                    
                    let code: CodeBlock[] = [];

                    // create new selection if the action says to do that
                    // if this select action ends up being one where you can use a direct
                    // PlayersCond/EntitiesCond block, the optimizer will handle actually doing that
                    if (selAction.name == "PlayersCond" || selAction.name == "EntitiesCond") {
                        code.push(new SubActionBlock(DFCodeblockName.SELECT_OBJECT, {
                            action: selAction.name == "PlayersCond" ? "AllPlayers" : "AllEntities",
                        }))
                    }

                    const recurse = (opr: BooleanOperation | Expression, invertAtomic?: boolean) => {
                        if (opr instanceof BooleanOperation && opr.operation != TokenType.BOOL_OR) {
                            if (opr.operation == TokenType.BOOL_AND) {
                                recurse(opr.a);
                                recurse(opr.b!);
                            }
                            else if (opr.operation == TokenType.BANG) {
                                recurse(opr.a, true);
                            }
                        } else {
                            let value: CodeValue;
                            let valueCode: CodeBlock[];
                            let errorNode: ASTNode;

                            if (opr instanceof Expression) {
                                // if the condition could be inlined in the filter block, the optimizer will handle that
                                [value, valueCode] = this.compileExpression(opr, {...exprContext, perSelectedMode: true});
                                errorNode = opr;
                                if (!(value instanceof TangibleValue)) {
                                    this.reportError(opr, `Cannot check truthiness of '${value.constructor.name}'`, value);
                                    return;
                                }
                            } else {
                                value = this.perSelectedTempVarProvider.newTempVar(Type.num);
                                valueCode = [
                                    new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                                        action: "=",
                                        args: [value as VariableValue, new NumberValue("0")]
                                    }),
                                    ...this.compileBooleanOperation(opr, [
                                        new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                                            action: "=",
                                            args: [value as VariableValue, new NumberValue("1")]
                                        })
                                    ], {...exprContext, perSelectedMode: true})
                                ]
                            }

                            code.push(
                                ...valueCode,
                                new SubActionBlock(DFCodeblockName.SELECT_OBJECT, {
                                    action: "FilterCondition",
                                    subAction: "!=",
                                    args: [value as TangibleValue, new NumberValue("0")],
                                    not: invertAtomic,
                                })
                            );
                        }
                    }
                    recurse(oprTree);
                    return code;
                } 
                // normal actions
                else {
                    let [_, code] = this.compileCallExpression(e, definition, exprContext);
                    return code;
                }
            // syntactic sugar for argless selection expresions
            } else if (e instanceof SelectionExpression) {
                let selExpr = e;
                let definitionBank = selExpr.keyword.type == TokenType.SELECT ? SELECT_ACTIONS : FILTER_ACTIONS
                if (!(selExpr.name.value in definitionBank)) {
                    this.reportError(selExpr.name, `Invalid ${selExpr.keyword.value} action '${selExpr.name.value}'`);
                    return [];
                }
                let definition = definitionBank[selExpr.name.value];

                if (
                    definition.signatures[0]?.params.length > 0 
                    || Object.keys(definition.action!.tags).length > 0
                    || definition.action?.hasSubActions
                ) {
                    let reqStr = definition.action?.hasSubActions ? "a condition wrapped in parentheses" : "arguments";
                    this.reportError(selExpr.name, `${upperFirst(selExpr.keyword.value)} action '${selExpr.name.value}' requires ${reqStr}`);
                    return [];
                }

                return [
                    new ActionBlock(DFCodeblockName.SELECT_OBJECT,{
                        action: definition.action?.name!,
                    })
                ]
            } else {
                // all other expressions
                let [_, code] = this.compileExpression(e, exprContext);
                return code;
            }
        }
        else if (s instanceof AssignmentStatement && s.isErrorFree()) {
            let values: CodeValue[];

            let [rawValue, valueCode] = this.compileExpression(s.rightValue, exprContext);
            if (rawValue instanceof MultiValue) {
                values = rawValue.values;
            } else {                
                values = [rawValue];
            }
            for (let v of values) {
                let vType = v.getType(this.env.types);
                if (!Type.assignableTypes.has(vType.name)){
                    this.reportError(
                        s.rightValue,
                        `Type '${vType.name}' cannot be stored in variables`
                    );
                    return [];
                }
    
                if (!(v instanceof TangibleValue)) {
                    this.reportError(
                        v.astNode ?? s.rightValue,
                        `${v.constructor.name} cannot be stored in variables`,
                        v
                    );
                    
                    return [];
                }
            }


            let code: CodeBlock[] = [...valueCode];

            // TODO: support property access
            for (let i = 0; i < s.leftValues.length; i++) {
                let assigneeExpr = s.leftValues[i];
                if (i >= values.length) {
                    this.reportError(assigneeExpr, `Tried to set ${i+1} or more variables, but only ${values.length} value(s) were provided.`);
                    continue;
                }

                // compile variable
                assigneeExpr = assigneeExpr.getRealExpression();
                let [variable, _] = this.compileExpression(assigneeExpr, exprContext)

                // incrementor operators
                if (s.operator.type != TokenType.EQUALS) {
                    let [newValue, newCode] = Operations.evaluateBinaryValue(variable, s.operator, values[i], this.getEvaluationContext())
                    values[i] = newValue;
                    code.push(...newCode);
                }

                // type validation
                let expectedType: Type = Type.any;
                if (assigneeExpr instanceof VariableExpression && assigneeExpr.assignedType) {
                    expectedType = this.env.types.evaluateExplicitType(assigneeExpr.assignedType.type)
                } else {
                    expectedType = variable.getType(this.env.types);
                }
                let resultType = values[i].getType(this.env.types);
                if (!resultType.isAssignableTo(expectedType)) {
                    this.reportError(values[i].astNode ?? assigneeExpr, `Type '${resultType}' is not assignable to variable of type '${expectedType}'`);
                }
    
                if (!(
                    (assigneeExpr instanceof VariableExpression)
                    || (assigneeExpr instanceof AtomicExpression && variable instanceof VariableValue)
                )) {
                    this.reportError(assigneeExpr, `Left-hand side of an assignment statement must be a variable`, variable)
                    continue;
                }

                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: "=",
                    args: [variable as VariableValue,values[i] as TangibleValue]
                }));
            }
            return code;
        }
        else if (s instanceof SingleKeywordStatement) {
            let action: string | null = null;
            switch (s.keyword.type) {
                case TokenType.BREAK: {action = "StopRepeat"; break;}
                case TokenType.CONTINUE: {action = "Skip"; break;}
            }
            if (action) {
                return [new ActionBlock(DFCodeblockName.CONTROL,{action})];
            }
        }
        else if (s instanceof ReturnStatement) {
            let code: CodeBlock[] = [];
            if (s.values.length > 0) {
                let expectedValueAmount = context.lineEntry.returnTypes?.length ?? 0
                let actualValueAmount = s.values.length;
                if (context.lineEntry.returnTypes == null) {
                    this.reportError(s.values[0], `Values cannot be returned from a ${context.lineEntry.headerType.toLowerCase()}`);
                    return [];
                }
                else if (actualValueAmount != expectedValueAmount) {
                    this.reportError(s.keyword, `Expected ${expectedValueAmount} return value${ps(expectedValueAmount)}, got ${actualValueAmount}`);
                }

                let values: TangibleValue[] = [];
                for (let i = 0; i < s.values.length && i < context.lineEntry.returnTypes.length; i++) {
                    let valueExpr = s.values[i];
                    let [value, valueCode] = this.compileExpression(valueExpr, exprContext);
                    if (!(value instanceof TangibleValue)) {
                        this.reportError(valueExpr, `${value.constructor.name} cannot be returned from functions`);
                        continue;
                    }
                    let valType = value.getType(this.env.types);
                    let expectedType = context.lineEntry.returnTypes[i];
                    if (!valType.strictlyMatches(expectedType)) {
                        this.reportError(valueExpr, `Expected type ${expectedType} for this return value, got ${valType}`);
                    }
                    values.push(value);
                    code.push(
                        ...valueCode,
                        new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                            action: "=",
                            args: [
                                new VariableValue(`@__TC_RET_${i}`, VariableScope.LINE),
                                value
                            ]
                        })
                    );
                }
            }
            code.push(new ActionBlock(DFCodeblockName.CONTROL,{
                action: "Return"
            }));
            return code;
        }
        else if (s instanceof IfStatement) {
            // compile condition anyway so errors are still reported
            if (!s.chunk) {
                this.compileExpression(s.condition, exprContext);
                return [];
            };

            let innerIfCode = s.chunk.statements.map(child => this.compileStatement(child,context)).flat()
            let code: CodeBlock[] = this.compileIfStatement(s.condition, innerIfCode, s.inverterToken != null, exprContext);

            if (s.elseContents) {
                let elseContentsCode: CodeBlock[] = [];

                if (s.elseContents instanceof IfStatement) {
                    elseContentsCode = this.compileStatement(s.elseContents, context);
                } else {
                    elseContentsCode = s.elseContents.statements.map(child => this.compileStatement(child,context)).flat();
                }
                
                code.push(
                    new ElseBlock({}),
                    new BracketBlock({type: BracketType.IF, direction: BracketDirection.OPEN}),
                        ...elseContentsCode,
                    new BracketBlock({type: BracketType.IF, direction: BracketDirection.CLOSE}),
                )
            }

            return code;
        }
        else if (s instanceof DoStatement) {
            let innerStatements = s.chunk.statements.map(child => this.compileStatement(child,context)).flat();
            if (s.whileKeyword && s.whileCondition) {
                // TODO: compile condition in a way that takes advantage of break's control flow properties
                let breakerCode = this.compileIfStatement(s.whileCondition, [
                    new ActionBlock(DFCodeblockName.CONTROL,{
                        action: "StopRepeat"
                    })
                ], s.whileInverterToken == null, exprContext);
                
                let firstRunTempVar = this.tempVarProvider.newTempVar(Type.num);

                return [
                    new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                        action: "=",
                        args: [firstRunTempVar, new NumberValue("0")],
                    }),
                    new SubActionBlock(DFCodeblockName.REPEAT, {
                        action: "Forever",
                    }),
                    new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                        // wrap breaker code in this if statement so it doesnt run on the first iteration
                        new ActionBlock(DFCodeblockName.IF_VARIABLE, {
                            action: "=",
                            args: [firstRunTempVar, new NumberValue("1")],
                        }),
                        new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
                            ...breakerCode,
                        new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
                        new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                            action: "=",
                            args: [firstRunTempVar, new NumberValue("1")]
                        }),

                        ...innerStatements,

                    new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
                ];
            } else {
                return innerStatements;
            }
        }
        else if (s instanceof RepeatStatement) {
            let countExpression = s.countExpression?.getRealExpression();
            if (countExpression) {
                let code: CodeBlock[] = [];
                let counterVar: VariableValue | undefined;
                let amountExpr: Expression;

                // with count
                if (countExpression instanceof BinaryExpression && countExpression.operator.type == TokenType.TO) {
                    let [cVar, cVarCode] = this.compileExpression(countExpression.left, exprContext);
                    code.push(...cVarCode);
                    if (cVar instanceof VariableValue && !cVar.isTempVar) {
                        counterVar = cVar;
                    } else {
                        this.reportError(countExpression.left, `Repeat counter must be a variable`, cVar);
                    }

                    amountExpr = countExpression.right;
                } else {
                    amountExpr = countExpression;
                }

                let [amount, amountCode] = this.compileExpression(amountExpr, exprContext);
                code.push(...amountCode);

                let failed = false;
                if (!(amount instanceof TangibleValue)) {
                    this.reportError(
                        amountExpr,
                        `${amount.constructor.name} is not allowed here`,
                        amount
                    );
                    return [];
                }
                let amountType = amount.getType(this.env.types);
                if (!amountType.matches(Type.num)) {
                    this.reportError(
                        amountExpr,
                        `Expected type 'num' for repeat amount, got '${amountType}'`
                    );
                    return [];
                }
                if (!s.chunk) return [];
                code.push(
                    new SubActionBlock(DFCodeblockName.REPEAT,{
                        action: "Multiple",
                        args: counterVar ? [counterVar, amount] : [amount],
                    }),
                    new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                        ...s.chunk.statements.map(child => this.compileStatement(child,context)).flat(),
                    new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
                )
                return code;
            } 
            // repeat forever
            else {
                if (!s.chunk) return [];
                return [
                    new SubActionBlock(DFCodeblockName.REPEAT,{
                        action: "Forever",
                    }),
                    new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                        ...s.chunk.statements.map(child => this.compileStatement(child,context)).flat(),
                    new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
                ]
            }
        }
        else if (s instanceof WhileStatement) {
            // compile condition anyway so errors are still reported
            if (!s.chunk) {
                this.compileExpression(s.condition, exprContext);
                return [];
            };
            
            let innerStatements = s.chunk?.statements.map(child => this.compileStatement(child,context)).flat();

            // TODO: compile condition in a way that takes advantage of break's control flow properties
            let breakerCode = this.compileIfStatement(s.condition, [
                new ActionBlock(DFCodeblockName.CONTROL,{
                    action: "StopRepeat"
                })
            ], s.inverterToken == null, exprContext);

            return [
                new SubActionBlock(DFCodeblockName.REPEAT, {
                    action: "Forever",
                }),
                new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                    ...breakerCode,
                    ...innerStatements,
                new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
            ];
        }
        else if (s instanceof ForStatement) {
            let code: CodeBlock[] = []
            let innerStatements = s.chunk?.statements.map(child => this.compileStatement(child,context)).flat();

            let varValues: VariableValue[] = [];

            // validate variables
            if (s.variableList.elements.length == 0) {
                this.reportError(
                    s.keyword,
                    'For loops must specify at least one variable'
                );
            } else {
                for (const expr of s.variableList.elements) {
                    let [val, valCode] = this.compileExpression(expr, exprContext);
                    code.push(...valCode);
                    if (val instanceof VariableValue && !val.isTempVar) {
                        varValues.push(val);
                    } else {
                        this.reportError(
                            expr,
                            `Values on the left side of a for loop must be variables`
                        );
                    }
                }
            }

            if (s.iteratorExpression == null) return [];

            let expectedVars: number = 1;
            let iteratorExpr = s.iteratorExpression.getRealExpression();
            // built-in actions
            if (isForLoopActionCall(iteratorExpr)) {
                let definition = REPEAT_ACTIONS[iteratorExpr.callee.token.value].def;
                let [_, headerCode] = this.compileCallExpression(iteratorExpr, definition, exprContext);
                (headerCode[headerCode.length-1] as ActionBlock).args.unshift(...varValues) // add vars
                code.push(...headerCode)
            }
            else {
                let [iteratorValue, iteratorValueCode] = this.compileExpression(iteratorExpr, exprContext);
                code.push(...iteratorValueCode);
                
                // iterate over lists
                if (iteratorValue.getType(this.env.types).matches(Type.list) && iteratorValue instanceof TangibleValue) { 
                    code.push(new ActionBlock(DFCodeblockName.REPEAT, {
                        action: "ForEach",
                        args: [...varValues, iteratorValue]
                    }));
                }
                // iterate over dicts
                else if (iteratorValue.getType(this.env.types).matches(Type.dict) && iteratorValue instanceof TangibleValue) {
                    expectedVars = 2;
                    code.push(new ActionBlock(DFCodeblockName.REPEAT, {
                        action: "ForEachEntry",
                        args: [...varValues, iteratorValue]
                    }));
                }
                // error for uniterable type     (is uniterable a word?? probably moreso than initerable)
                else {
                    this.reportError(
                        iteratorExpr,
                        `Cannot iterate over type '${iteratorValue.getType(this.env.types).name}'`,
                        iteratorValue
                    );
                    return [];
                }
            }

            if (s.variableList.elements.length != 0 && s.variableList.elements.length != expectedVars) {
                this.reportError(
                    s.keyword,
                    `Expected ${expectedVars} variable${ps(expectedVars)}, got ${s.variableList.elements.length}`
                )
            }

            if (innerStatements == undefined) return [];
            code.push(
                new BracketBlock({type: BracketType.REPEAT, direction: BracketDirection.OPEN}),
                    ...innerStatements,
                new BracketBlock({type: BracketType.REPEAT, direction: BracketDirection.CLOSE}),
            );
            return code;
        }
        else if (s instanceof PerSelectedStatement) {
            return s.chunk.statements.map(s => this.compileStatement(s, {...context, perSelectedMode: true})).flat();
        }
        else if (s instanceof EventStatement || s instanceof FunctionStatement) {
            this.reportError(s,`${toNameCase(s.headerType ?? 'this')} declarations can only appear at the top level of a file`);
        }
        return [];
    }

    /** 
     * Generated code will be added to the internal templates and will be outputted
     * along with the rest of the project's generated code when compile() is called
     * */
    compileItemLibrary(library: ItemLibrary) {
        let setupFuncName = `${TC_HEADER}IL_${library.id}`;
        
        let functionLineEntry = this.getLineEntry(DFCodeblockName.FUNCTION, setupFuncName);
        functionLineEntry.code.push(Object.entries(library.items).map(
            ([id, item]) => new ActionBlock(DFCodeblockName.SET_VARIABLE, {
                action: "=",
                args: [
                    new VariableValue(`${TC_HEADER}LI_${library.id}\uFFFF${id}`, VariableScope.GLOBAL),
                    new LibraryItemValue(item.data,item.version,library.id,id),
                ]
            })
        ));

        let gameStartupEntry = this.getLineEntry(DFCodeblockName.GAME_EVENT, "PlotStartup")
        gameStartupEntry.code.push([new ActionBlock(DFCodeblockName.CALL_FUNCTION, {
            action: setupFuncName
        })]);
    }

    compile({outputFormat, splitToLength = -1}: {outputFormat: "GZIP" | "DFONLINE", splitToLength?: number}) {
        this.errors.length = 0;
        
        let declarationsToCompile = this.processLineDeclarations(this.ast);

        for (const [lineEntry, declaration] of declarationsToCompile) {
            this.tempVarProvider.resetCount();
            if (declaration instanceof EventStatement || declaration instanceof FunctionStatement) {
                if (!(declaration.chunk instanceof ChunkExpression)) continue;
                lineEntry.code.push(...declaration.chunk.statements.map(
                    s => this.compileStatement(s, {
                        lineStatement: declaration,
                        lineEntry: lineEntry,
                    })
                ));
            }
        }

        //=- join code lines together and optimize them -=\\

        const optimizer = new CodeOptimizer(this.env.types);
        
        let output: Map<HeaderType, {[name: string]: string}> = new Map([
            [DFCodeblockName.PLAYER_EVENT, {}],
            [DFCodeblockName.ENTITY_EVENT, {}],
            [DFCodeblockName.GAME_EVENT, {}],
            [DFCodeblockName.FUNCTION, {}],
            [DFCodeblockName.PROCESS, {}],
        ]);
        for (let [headerType, lineList] of this.codeLines.entries()) {
            for (let [name, line] of Object.entries(lineList)) {
                try {
                    let joinedCode = [line.headerBlock!, ...line.code.flat()];
    
                    if (this.env.optimizationsEnabled) {
                        optimizer.optimize(joinedCode);
                    }
    
                    let outputLines: CodeBlock[][];
    
                    if (splitToLength != -1) {
                        outputLines = SliceCodeLine(joinedCode, splitToLength);
                    } else {
                        outputLines = [joinedCode];
                    }
    
                    for (let outLine of outputLines) {
                        let firstBlock = outLine[0] as ActionBlock;
    
                        let serialized: string = "error :(";
                        if (outputFormat == "DFONLINE") {
                            serialized = `https://dfonline.dev/edit/?template=${gzipize(jsonize(outLine))}`;
                        } else {
                            serialized = gzipize(jsonize(outLine));
                        }
        
                        output.get(firstBlock.block as HeaderType)![firstBlock.action] = serialized;
                    }
                } catch (e) {
                    if (e instanceof Error && e.message == SPLIT_FAILED_ERROR_MESSAGE) {
                        let errorMessage = (
                            `Could not automatically split code line ${headerType} '${name}'.\n`+
                            `This is often caused by using percent codes inside line variables or using percent codes inside %var().\n`+
                            `Try manually splitting this code line into separate functions.`
                        );
                        let astNode = line.headerBlock?.astNode;
                        if (astNode && (astNode instanceof EventStatement || astNode instanceof FunctionStatement)) {
                            this.errors.push(new TCNodeError((astNode.chunk as ChunkExpression).opener ?? astNode.chunk, ErrorType.COMPILER, errorMessage));
                        } else {
                            this.errors.push(new TCStandaloneError(ErrorType.COMPILER, errorMessage));
                        }
                    }
                }
            }
        }

        return output;
    }
}