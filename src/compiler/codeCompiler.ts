import { ASTNode } from "../ast/astNode.ts";
import { DoStatement, EventStatement, ExpressionStatement, ForStatement, IfStatement, RepeatStatement, Statement } from "../ast/statement.ts";
import { Token, TokenType } from "../ast/token.ts";
import { isVariableEntry, TypeProcessor, VariableScope } from "../typeProcessor/typeProcessor.ts";
import { getOrCreateDictLayer, getOrCreateMapLayer, ps, upperFirst } from "../util/utils.ts";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock, ElseBlock, EventBlock, IfBlock, SubActionBlock } from "./codeBlock.ts";
import * as fflate from "fflate";
import * as AD from "../df/actiondump.ts";
import { ErrorType, TCError, TCNodeError } from "../error/error.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, ChunkExpression, Expression, GroupExpression, ListExpression, MissingExpression, TypecastExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { CodeValue, EmptyValue, FunctionValue, MissingValue, NamespaceValue, NumberValue, StringValue, StyledTextValue, TangibleValue, VariableValue } from "./codeValue.ts";
import { Namespace } from "./namespace/namespace.ts";
import { TempVarProvider } from "./tempVarProvider.ts";
import { Operations } from "./operations.ts";
import { DefinitionType, FunctionDefinition, isFunctionDefinition } from "./namespace/definition.ts";
import { Type } from "../typeProcessor/type.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { CodeOptimizer } from "./optimizer/optimizer.ts";
import { count } from "node:console";
import { REPEAT_ACTIONS } from "./namespace/builtins.ts";
import { isForLoopActionCall } from "../util/astUtils.ts";

export type EventType = DFCodeblockName.PLAYER_EVENT | DFCodeblockName.ENTITY_EVENT | DFCodeblockName.GAME_EVENT;
export type UserMethodType = DFCodeblockName.FUNCTION | DFCodeblockName.PROCESS; 

export type HeaderType = EventType | UserMethodType;

export type CompliationEnvironment = {types: TypeProcessor, optimizationsEnabled: boolean};
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
                throw new Error(`no idea how to compile this: ${s.constructor.name}`);
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

    compileCallExpression(e: CallExpression, definition: FunctionDefinition): [CodeValue, CodeBlock[]] {
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
        let [value, code] = definition.compile(args,namedArgs, this.getEvaluationContext(), e);
        value.astNode = e;
        return [value, [...argCode, ...code]];
    }

    compileExpression(e: Expression | Token): [CodeValue, CodeBlock[]] {
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

            let definition: FunctionDefinition | null = null;
            if (callee instanceof FunctionValue) {
                definition = callee.definition;
            } else if (callee instanceof NamespaceValue) {
                if (callee.namespace.nameFunction) {
                    definition = callee.namespace.nameFunction;
                } else {
                    this.reportError(e.callee, `'${callee.namespace.identifier}' cannot be called as a function`);
                }
            } 
            // error case; no definition could be found
            else {
                this.reportError(e.callee, `Type '${callee.getType(this.env.types).name}' cannot be called as a function`);
            }

            if (definition) {
                let [value, code] = this.compileCallExpression(e, definition);
                return [value, [...preCode, ...code]];
            }
            else {
                return [new MissingValue(e), [...preCode]];
            }
        }
        else if (e instanceof AccessExpression || e instanceof BracketedAccessExpression) {
            let [accessee, preCode] = this.compileExpression(e.accessee);

            let accessor: CodeValue;
            if (e instanceof AccessExpression) {
                accessor = new StringValue(e.propertyName.value);
            } else {
                let [a, aCode] = this.compileExpression(e.propertyName);
                accessor = a;
                preCode.push(...aCode);
            }

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
                    // todo: actually handle all terracotta numbers
                    let v = parseInt(accessor.value as string);
                    if (!isNaN(v)) {
                        accessorValue = v;
                    }
                }
                else if (accessor instanceof StringValue) {
                    accessorValue = accessor.value;
                }
            }


            // namespace accessing
            if (accessee instanceof NamespaceValue) {
                if (accessorValue == undefined) {
                    this.reportError(
                        e.propertyName,
                        `Namespace properties cannot be accessed dynamically`
                    );
                    return [new MissingValue(e), preCode];
                }
                let definition = accessee.namespace.members[accessorValue];
                if (definition == undefined) {
                    // todo: special error messages for if the namespace is a player action or game action or whatever
                    this.reportError(
                        e.propertyName,
                        `'${accessorValue}' is not a property of '${accessee.namespace.identifier}'`
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
            } 
            // list accessing
            else if (accesseeType.matches(Type.list)) {
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
            // error
            else {
                if (!(accessee instanceof MissingValue)) {
                    this.reportError(
                        e.propertyName,
                        `Property access not allowed on type '${accessee.getType(this.env.types).name}'` // TODO: better error message
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
        else if (e instanceof ListExpression) {
            let code: CodeBlock[] = [];
            let tempVar = this.tempVarProvider.newTempVar(Type.list(Type.any));
            let currentChest: TangibleValue[] = [tempVar];
            let createBlockAdded = false;

            function pushCurrentChest() {
                if (currentChest.length <= 1) return;
                code.push(new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                    action: !createBlockAdded ? "CreateList" : "AppendValue",
                    args: [...currentChest]
                }));
                if (!createBlockAdded) createBlockAdded = true;
                currentChest = [tempVar]; 
            }

            for (const element of e.elements) {
                let [value, valueCode] = this.compileExpression(element);
                if (!(value instanceof TangibleValue)) {
                    if (!(value instanceof MissingValue)) {
                        this.reportError(element, `${value.constructor.name} cannot be stored in lists`);
                    }
                    continue;
                }
                code.push(...valueCode)
                currentChest.push(value);
                if (currentChest.length == 27) {
                    pushCurrentChest();
                }
            }
            pushCurrentChest();
            return [tempVar, code];
        }
        else if (e instanceof AtomicExpression) {
            return this.compileExpression(e.token);
        } 
        else if (e instanceof Token) {
            switch (e.type) {
                // identifier resolution all happens here
                case TokenType.IDENTIFIER: {
                    let resolved = this.env.types.resolveIdentifier(e);
                    if (resolved instanceof Namespace) {
                        return [new NamespaceValue(resolved, e), []];
                    } else if (isFunctionDefinition(resolved)) {
                        return [new FunctionValue(resolved, e), []];
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
                    return [new NumberValue(e.value,e), []];
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
            let [value, valueCode] = this.compileExpression(e.left);
            let type = this.env.types.evaluateExplicitType(e.type);
            // this is definitely in the runnings for "most sinful code i've ever written"
            value.getType = () => type;
            return [value, valueCode];
        }
        else if (e instanceof GroupExpression) {
            return this.compileExpression(e.expression);
        }
        else if (e instanceof MissingExpression) {
            return [new MissingValue(e), []];
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

                let valueType = value.getType(this.env.types);
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
            let [value, valueCode] = this.compileExpression(s.condition);
            if (value instanceof MissingValue) return [] // error handled by parser
            if (!(value instanceof TangibleValue)) {
                this.reportError(s.condition.getRealExpression(), `Cannot check truthiness of '${value.constructor.name}'`);
                return [];
            }

            if (!s.chunk) return [];
            
            let code = [
                ...valueCode,
                new IfBlock(DFCodeblockName.IF_VARIABLE,{
                    action: "!=",
                    args: [value, new NumberValue("0")],
                }),
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.OPEN}),
                    ...s.chunk.statements.map(this.compileStatement).flat(),
                new BracketBlock({type: BracketType.IF, direction: BracketDirection.CLOSE}),
            ];

            if (s.elseContents) {
                let elseContentsCode: CodeBlock[] = [];

                if (s.elseContents instanceof IfStatement) {
                    elseContentsCode = this.compileStatement(s.elseContents);
                } else {
                    elseContentsCode = s.elseContents.statements.map(this.compileStatement).flat();
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
            if (s.whileKeyword && s.whileCondition) {
                // TODO: while stuff
            } else {
                return s.chunk.statements.map(this.compileStatement).flat();
            }
        }
        else if (s instanceof RepeatStatement) {
            let innerStatements = s.chunk.statements.map(this.compileStatement).flat();

            let countExpression = s.countExpression?.getRealExpression();
            // TODO: repeat (line i to x)
            if (countExpression) {
                let code: CodeBlock[] = [];
                let counterVar: VariableValue | undefined;
                let amountExpr: Expression;

                // with count
                if (countExpression instanceof BinaryExpression && countExpression.operator.type == TokenType.TO) {
                    let [cVar, cVarCode] = this.compileExpression(countExpression.left);
                    code.push(...cVarCode);
                    if (cVar instanceof VariableValue && !cVar.isTempVar) {
                        counterVar = cVar;
                    } else {
                        this.reportError(
                            countExpression.left,
                            `Repeat counter must be a variable`
                        );
                    }

                    amountExpr = countExpression.right;
                } else {
                    amountExpr = countExpression;
                }

                let [amount, amountCode] = this.compileExpression(amountExpr);
                code.push(...amountCode);

                let failed = false;
                if (!(amount instanceof TangibleValue)) {
                    if (!(amount instanceof MissingValue)) {
                        this.reportError(
                            amountExpr,
                            `${amount.constructor.name} is not allowed here`
                        );
                    }
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
                code.push(
                    new SubActionBlock(DFCodeblockName.REPEAT,{
                        action: "Multiple",
                        args: counterVar ? [counterVar, amount] : [amount],
                    }),
                    new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                        ...innerStatements,
                    new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
                )
                return code;
            } 
            // repeat forever
            else {
                return [
                    new SubActionBlock(DFCodeblockName.REPEAT,{
                        action: "Forever",
                    }),
                    new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.REPEAT}),
                        ...innerStatements,
                    new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.REPEAT}),
                ]
            }
        }
        else if (s instanceof ForStatement) {
            let code: CodeBlock[] = []
            let innerStatements = s.chunk?.statements.map(this.compileStatement).flat();

            let varValues: VariableValue[] = [];

            // validate variables
            if (s.variableList.elements.length == 0) {
                this.reportError(
                    s.keyword,
                    'For loops must specify at least one variable'
                );
            } else {
                for (const expr of s.variableList.elements) {
                    let [val, valCode] = this.compileExpression(expr);
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
                let [_, headerCode] = this.compileCallExpression(iteratorExpr, definition);
                // TODO: error for incorrect # of vars
                (headerCode[headerCode.length-1] as ActionBlock).args.unshift(...varValues) // add vars
                code.push(...headerCode)
            }
            else {
                let [iteratorValue, iteratorValueCode] = this.compileExpression(iteratorExpr);
                code.push(...iteratorValueCode);
                
                // iterate over lists & dicts
                if (iteratorValue.getType(this.env.types).matches(Type.list) && iteratorValue instanceof TangibleValue) { 
                    code.push(new ActionBlock(DFCodeblockName.REPEAT, {
                        action: "ForEach",
                        args: [...varValues, iteratorValue]
                    }));
                }
                // error for uniterable type     (is uniterable a word?? probably moreso than initerable)
                else {
                    if (!(iteratorValue instanceof MissingValue)) {
                        this.reportError(
                            iteratorExpr,
                            `Cannot iterate over type '${iteratorValue.getType(this.env.types).name}'`
                        );
                    }
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
                let joinedCode = [line.headerBlock!, ...line.code.flat()];

                if (this.env.optimizationsEnabled) {
                    optimizer.optimize(joinedCode);
                }

                let serialized: string = "error :(";
                if (outputFormat == "DFONLINE") {
                    serialized = `https://dfonline.dev/edit/?template=${gzipize(jsonize(joinedCode))}`;
                } else {
                    serialized = gzipize(jsonize(joinedCode));
                }

                output.get(headerType)![name] = serialized;
            }
        }

        return output;
    }
}