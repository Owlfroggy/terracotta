import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, ChunkExpression, DictionaryEntryExpression, DictionaryExpression, DictionaryTypeExpression, Expression, GroupExpression, ListExpression, SelectionExpression, TypecastExpression, TypeExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { AssignmentStatement, ExpressionStatement, ForStatement, FunctionStatement, RepeatStatement, PerSelectedStatement, Statement, IfStatement, WhileStatement } from "../ast/statement.ts";
import { Token, TokenType } from "../ast/token.ts";
import { ErrorType, TCError, TCNodeError } from "../error/error.ts";
import { Operations } from "../compiler/operations.ts";
import { DictTypeData, FuncTypeData, ListTypeData, MultiValueTypeData, NamespaceTypeData, Type, TypeConstructor, VarTypeData } from "./type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { getTagsAndArgTypes, ps } from "../util/utils.ts";
import { FILTER_ACTIONS, REPEAT_ACTIONS, SELECT_ACTIONS } from "../compiler/namespace/builtins.ts";
import { isForLoopActionCall } from "../util/astUtils.ts";
import { Definition, DefinitionType, FunctionDefinition, isFunctionDefinition, ParameterSignature, ParameterSignatureEntry, USE_DEFAULT_RETURN_TYPE } from "../compiler/namespace/definition.ts";
import { GLOBAL_SCOPE_INJECTIONS } from "../compiler/namespace/globalScopeInjections.ts";
import { COMPILE_START_PROCESS, COMPILE_CALL_FUNCTION } from "../compiler/namespace/compileCallFunction.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { BooleanOperation } from "../compiler/booleanOperation.ts";
import { actions } from "../df/actiondump.ts";

export enum VariableScope {
    SAVED,
    GLOBAL,
    LOCAL,
    LINE,
};
/** earlier in the array means higher priority */
const SCOPE_PRIORITY = [VariableScope.LINE, VariableScope.LOCAL, VariableScope.GLOBAL, VariableScope.SAVED]

type Requirement = {item: VariableId | string, atPos: number};

export interface VariableEntry {
    id: VariableId,
    solved: boolean,
    type: Type | null,
    requirements: Requirement[], 
    valueExpression: Expression | null,
    forLoopVarPos?: number, 
    assignmentVarPos?: number,
    effectiveBeyondPosition: number
    astNode?: ASTNode,
}

// this function is bad but i dont care
export function isVariableEntry(obj): obj is VariableEntry {
    return (
        obj instanceof Object
        && 'id' in obj
        && 'solved' in obj
        && 'type' in obj
        && 'requirements' in obj
        && 'valueExpression' in obj
        && 'effectiveBeyondPosition' in obj
    )
}

export class EnvironmentFrame {
    /** An empty environment frame with no variables for evaluating expressions in a vacuum */
    static readonly DUMMY = new EnvironmentFrame(null, null)

    // public knownTypes: Map<VariableId, Type[]> = new Map();
    // public unsolvedTypes: Map<VariableId, {requirements: Requirement[], expression: Expression}> = new Map();
    variables: Map<string, Map<VariableScope, VariableEntry[]>> = new Map();

    /** Currently, only the global frame will have this filled out */
    functions: Map<string, FunctionDefinition[]> = new Map();
    /** Currently, only the global frame will have this filled out */
    processes: Map<string, FunctionDefinition[]> = new Map();

    children: Map<ChunkExpression, EnvironmentFrame> = new Map();
    
    constructor(
        public astNode: ChunkExpression | null,
        public parent: EnvironmentFrame | null,
    ) {}

    registerVariable({
        id,
        type = null,
        effectiveBeyondPosition,
        requirements = [],
        valueExpression = null,
        forLoopVarPos,
        assignmentVarPos,
        astNode,
    }: {
        id: VariableId;
        type?: Type | null;
        effectiveBeyondPosition: number;
        requirements?: Requirement[];
        valueExpression?: Expression | null;
        forLoopVarPos?: number;
        assignmentVarPos?: number;
        astNode?: ASTNode;
    }) {
        let entry: VariableEntry = {
            id: id,
            solved: type != null,
            type: type,
            requirements: requirements,
            valueExpression: valueExpression,
            forLoopVarPos: forLoopVarPos,
            assignmentVarPos: assignmentVarPos,
            effectiveBeyondPosition: effectiveBeyondPosition,
            astNode: astNode,
        }
        // TODO: update all these to use the new util function (im too lazy rn)
        if (!this.variables.has(id.name)) this.variables.set(id.name, new Map());
        let nameLayer = this.variables.get(id.name)!;
        if (!nameLayer.has(id.scope)) nameLayer.set(id.scope, []);
        let scopeLayer = nameLayer.get(id.scope)!;
        scopeLayer.push(entry);
    }

    /**
     * @param variable If a VariableID is passed in, only that scope will be considered. 
     * If a string is passed in, all variables with that name and any scope will be considered
     * @returns VariableEntry if this variable is present and unconflicted on any scope at or above this frame
     */
    getVariableEntry(variable: VariableId | string, atPos: number, requireASTNode: boolean = false): VariableEntry | null {
        let frame = this;
        let name: string;
        let scope: VariableScope | null;
        if (variable instanceof VariableId) {
            name = variable.name;
            scope = variable.scope;
        } else {
            name = variable;
            scope = null;
        }

        if (this.variables.has(name)) {
            let varLayer = this.variables.get(name)!;

            let tryEntries = (scope: VariableScope) => {
                let entries = varLayer.get(scope)!;
                if (!entries || entries.length == 0) return null; 

                if (this.parent == null) {
                    // if in the global context, consider all variables with multiple definitions unknown
                    // and also don't take positions into account
                    if (varLayer.get(scope)?.length == 1)
                        return varLayer.get(scope)![0];
                } else {
                    // otherwise, go through all definitions to get the latest one that fulfills atPos
                    let i;
                    for (i = entries.length-1; i >= 0; i--) {
                        if (entries[i].effectiveBeyondPosition < atPos) break;
                    }

                    if (i != -1 && !(requireASTNode && entries[i].astNode == undefined)) {
                        return entries[i];
                    } else {
                        return null;
                    }
                }
                return null;
            }

            if (scope == null) {
                for (const scope of SCOPE_PRIORITY) {
                    let entry = tryEntries(scope);
                    if (entry) return entry;
                }
            } else {
                // let allEntries = varLayer.get(scope);
                // let i = 0;
                // while (allEntries[i].effectiveBeyondPosition < )
                let entry = tryEntries(scope);
                if (entry) return entry;
            }
        }
        // if this scope couldn't decide on a type, try the next scope up
        if (this.parent == null) {
            // if this is the global scope that means this
            // variable could not be evaluated on any level
            return null;
        } else {
            return this.parent.getVariableEntry(variable, atPos);
        }
    }

    /**
     * @param variable If a VariableID is passed in, only that scope will be considered. 
     * If a string is passed in, all variables with that name and any scope will be considered
     * @returns Type.unknown unless this variable is present and unconflicted on any scope at or above this frame
     */
    getVariableType(variable: VariableId | string, atPos: number): Type {
        let entry = this.getVariableEntry(variable, atPos);
        if (entry == null) return Type.unknown;
        return entry.type ?? Type.unknown;
    }

    /** Will return the entry list for every scope,name combination that exists WITHIN THIS FRAME!! 
     * 
     * This will NOT look in child or parent frames.
     */
    *entryLists(): IterableIterator<[VariableId, VariableEntry[]]> {
        for (const [name, scopeLayer] of this.variables.entries()) {
            for (const [scope, allEntries] of scopeLayer.entries()) {
                yield [VariableId.get(scope, name), allEntries];
            }
        }
    }

    addChild(astNode: ChunkExpression): EnvironmentFrame {
        let child = new EnvironmentFrame(astNode, this);
        this.children.set(astNode, child);
        return child;
    }

    toString(): string {
        let vars: string[] = [];
        for (const [id, entries] of this.entryLists()) {
            let strEntries: string[] = entries.map(e => {
                let requirements = e.requirements.map(r => `${r.atPos}>${r.item}`).join(", ");
                return `[${e.solved ? "√" : "X"} ${e.type?.toString() ?? 'unknown'} @${e.effectiveBeyondPosition} req:(${requirements}) exp:${e.valueExpression ? e.valueExpression.constructor.name : ''}]`
            });
            vars.push(`${id} -> ${strEntries.join(",  ")}`)
        }

        let childrenString = "[]";
        if (this.children.size > 0) {
            let children: string[] = [];
            for (const [node, child] of this.children.entries()) {
                children.push(child.toString().split("\n").join("\n    "));
            }
            childrenString = "[\n    "+children.join("\n    ")+"\n  ]";
        }

        return `FRAME FOR ${this.astNode?.parent ?? "GLOBAL"} {\n  variables: {\n    ${vars.join("\n    ")}\n  }\n  children: ${childrenString}\n}`;
    }
}

export class VariableId {
    // TODO: when everything goes incremental, make sure this doesn't leak memory
    private static cache: Map<VariableScope, {[key: string]: VariableId}> = new Map();

    constructor(
        public scope: VariableScope,
        public name: string,
    ) {}

    public static get(scope: VariableScope, name: string): VariableId {
        let existingId = this.cache.get(scope)?.[name];
        if (existingId) return existingId;
        let newId = new VariableId(scope, name);
        if (!this.cache.has(scope)) this.cache.set(scope, {});
        this.cache.get(scope)![name] = newId;
        return newId;
    }

    public static fromExpression(expression: VariableExpression): VariableId {
        return this.get(VariableScope[TokenType[expression.scope.type]], expression.name.value);
    }

    toString(): string {
        return `${VariableScope[this.scope]}'${this.name}'`
    }
}

export class TypeProcessor {
    errors: TCError[] = [];
    globalFrame: EnvironmentFrame = new EnvironmentFrame(null,null);
    framesByASTNode: Map<ASTNode, EnvironmentFrame> = new Map();

    reportError(node: ASTNode, error: string) {
       this.errors.push(new TCNodeError(
            node,
            ErrorType.TYPE_PROCESSOR,
            error
        ));
    }

    genericizeType(type: Type): Type {
        if (type.matches(Type.dict)) {
            return Type.dict(Type.any);
        } else if (type.matches(Type.list)) {
            return Type.list(Type.any);
        }
        return type;
    }

    public resolveIdentifier(identifier: Token): Namespace | VariableEntry | Definition | null {
        let value: string = identifier.value;
        let frame: EnvironmentFrame = this.getNodeFrame(identifier);

        let varEntry = frame.getVariableEntry(value, identifier.startPos);
        if (varEntry != undefined) return varEntry;

        if (this.globalFrame.functions.has(value)) return this.globalFrame.functions.get(value)![0];

        let namespace = Namespace.registry[value];
        if (namespace != undefined) return namespace;

        if (value in GLOBAL_SCOPE_INJECTIONS) return GLOBAL_SCOPE_INJECTIONS[value];

        return null;
    }

    getRequirements(expression: ASTNode, frame: EnvironmentFrame): Requirement[] {
        if (expression instanceof Expression) expression = expression.getRealExpression();
        if (expression instanceof TypecastExpression) {
            // if an expression is being recast by the AS operator,
            // nothing inside it is needed to evaluated higher up types
            return []
        }
        else if (expression instanceof BinaryExpression) {
            let leftConstType = this.evaluateExpression(expression.left, EnvironmentFrame.DUMMY);
            let rightConstType = this.evaluateExpression(expression.right, EnvironmentFrame.DUMMY);

            // if the type of this operation can be evaluated without any context 
            // (e.g. (s"styled text" + dingus) will always be type txt no matter what 'dingus' is)
            // then none of the variables inside of it matter so they can be ignored
            if (Operations.evaluateBinaryType(leftConstType, expression.operator.type, rightConstType) != Type.unknown) {
                return [];
            } else {
                return [...this.getRequirements(expression.left, frame), ...this.getRequirements(expression.right, frame)];
            }
        }
        else if (expression instanceof VariableExpression) {
            return [{item: VariableId.fromExpression(expression), atPos: expression.startPos}];
        }
        else if (expression instanceof AccessExpression) {
            return this.getRequirements(expression.accessee, frame);
        }
        else if (expression instanceof CallExpression) {
            // the return type of a function doesn't depend on its args so the args don't need to be known
            // some shenanigans are gonna need to be done for functions that depend on tags but
            // i wont worry about that rn
            return []
        }
        else if (expression instanceof AtomicExpression) {
            if (expression.token.type == TokenType.IDENTIFIER && expression.token.value in Namespace.registry) {
                // dont count namespace identifiers as variable requirements
                return []
            } else {
                return this.getRequirements(expression.token, frame);
            }
        }
        else if (expression instanceof DictionaryEntryExpression) {
            return this.getRequirements(expression.value, frame);
        }
        else if (expression instanceof Token && expression.type == TokenType.IDENTIFIER) {
            return [{item: expression.value, atPos: expression.startPos}];
        }
        else {
            let requirements: Requirement[] = [];
            for (const child of expression.children) {
                requirements.push(...this.getRequirements(child, frame))
            }
            return requirements;
        }
    }
    
    // TODO: get inferences from ORs, find overlap, and apply the overlap
    // TODO: apply inferences after the if block if it always returns
    // TODO: apply inverse of inferences in else blocks
    // TODO: apply inference within the condition itself
    applyConditionInferenceVariables(opr: BooleanOperation | Expression, frame: EnvironmentFrame) {
        const getVarIdOfExpr = (expr?: Expression): VariableId | null => {
            if (!expr) return null;
            if (expr instanceof AtomicExpression && expr.token.type == TokenType.IDENTIFIER) {
                let resolved = this.resolveIdentifier(expr.token);
                if (isVariableEntry(resolved)) return resolved.id;
            } else if (expr instanceof VariableExpression) {
                return expr.getVarId();
            }
            return null;
        }

        // console.log(opr.constructor.name);
        if (opr instanceof BooleanOperation && opr.operation == TokenType.BOOL_AND) {
            this.applyConditionInferenceVariables(opr.a, frame);
            this.applyConditionInferenceVariables(opr.b!, frame);
        }
        // == comparison
        else if (
            (opr instanceof BinaryExpression && opr.operator.type == TokenType.DOUBLE_EQUALS)
            || (opr instanceof BooleanOperation && opr.operation == TokenType.BANG && opr.a instanceof BinaryExpression && opr.a.operator.type == TokenType.BANG_EQUALS)
        ) {
            let binary = opr instanceof BinaryExpression ? opr : opr.a as BinaryExpression;

            let varId = getVarIdOfExpr(binary.left);
            if (!varId) return;

            frame.registerVariable({
                id: varId,
                effectiveBeyondPosition: binary.endPos,
                requirements: this.getRequirements(binary.right, frame),
                valueExpression: binary.right
            });
        }
        else if (opr instanceof CallExpression) {
            // it's okay that expressions are being evaluated before types have been analyzed since var
            // namespace methods have no requirements to call so it will always return the right definition
            let calleeType = this.evaluateExpression(opr.callee);
            if (!calleeType.matches(Type.func)) return;
            let def = (calleeType.data as FuncTypeData).definition;

            // var.isType();
            if (def.action == actions.get(DFCodeblockName.IF_VARIABLE)!["VarIsType"]) {
                let [_, tags] = getTagsAndArgTypes(opr.args.elements, this);
                if (!tags.type) return;
                
                let varId = getVarIdOfExpr(opr.args.elements[0]);
                if (!varId) return;

                let type = (
                    tags.type == "Number" ? Type.num :
                    tags.type == "String" ? Type.str :
                    tags.type == "Styled Text" ? Type.txt :
                    tags.type == "Location" ? Type.loc :
                    tags.type == "Item" ? Type.item :
                    tags.type == "List" ? Type.list(Type.any) :
                    tags.type == "Potion effect" ? Type.pot :
                    tags.type == "Particle" ? Type.par : 
                    tags.type == "Vector" ? Type.vec :
                    tags.type == "Dictionary" ? Type.dict(Type.any)
                    : null
                )
                if (type == null) return;

                frame.registerVariable({
                    id: varId,
                    effectiveBeyondPosition: opr.endPos,
                    requirements: [],
                    type
                });
            }
        }
        // TODO: handle var.equals() block
    }

    applyStatementVariables(statement: Statement, frame: EnvironmentFrame) { 
        // function/process parameters
        if (statement instanceof FunctionStatement) {
            let signatureParams: ParameterSignatureEntry[] = [];

            if (statement.params) {
                let seenNames: Set<string> = new Set();
                for (const param of statement.params.elements) {
                    if (seenNames.has(param.name.value)) continue;
                    seenNames.add(param.name.value);
    
                    let type: Type;
                    let varType: Type;
                    if (param.assignedType) {
                        type = this.evaluateExplicitType(param.assignedType.type);
                        if (param.ellipses) {
                            varType = Type.list(type);
                        } else if (type.matches(Type.var)) {
                            varType = (type.data as VarTypeData).varType;
                        } else {
                            varType = type;
                        }
                    } else {
                        type = Type.any;
                        varType = Type.any;
                    }
                    frame.registerVariable({
                        id: VariableId.get(VariableScope.LINE,param.name.value),
                        type: varType,
                        effectiveBeyondPosition: statement.chunk.startPos,
                        astNode: param
                    })
                    signatureParams.push({
                        name: param.name.value, 
                        type: type,
                        optional: param.star != null, 
                        plural: param.ellipses != null,
                        description: param.attachedComments.length > 0 ? param.attachedComments.map(t => t.value).join("\n") : undefined
                    })
                }
            }

            let returnType: Type = Type.void;
            if (statement.returnType != null) {
                if (statement.returnType.types.length == 1) {
                    returnType = this.evaluateExplicitType(statement.returnType.types[0]);
                } else {
                    returnType = Type.multivalue(statement.returnType.types.map(t => this.evaluateExplicitType(t)));
                }
            }

            // frame here will be the function's chunk's frame so the parent needs to be accessed 
            if (frame.parent == this.globalFrame) {
                let isProcess = statement.headerType == DFCodeblockName.PROCESS;
                let map = frame.parent[isProcess ? "processes" : "functions"];
                map.getOrInsert(statement.name.value, []).push({
                    definitionType: DefinitionType.FUNCTION,
                    name: statement.name.value,
                    signatures: [{params: signatureParams}],
                    defaultReturnType: returnType,
                    getReturnType: USE_DEFAULT_RETURN_TYPE,
                    compile: isProcess ? COMPILE_START_PROCESS : COMPILE_CALL_FUNCTION,
                    astNode: statement,
                })
            }
        }
        // repeat counter var
        else if (statement instanceof RepeatStatement && statement.countExpression && statement.chunk) {
            let countExpression = statement.countExpression.getRealExpression();
            if (
                countExpression instanceof BinaryExpression 
                && countExpression.operator.type == TokenType.TO
            ) {
                let varExpr = countExpression.left;
                if (varExpr instanceof VariableExpression) {
                    frame.registerVariable({
                        id: varExpr.getVarId(), 
                        type: Type.num, 
                        effectiveBeyondPosition: statement.chunk.startPos,
                        astNode: countExpression,
                    });
                }
            }
        }
        // for loop vars
        else if (statement instanceof ForStatement && statement.iteratorExpression && statement.chunk) {
            let varTypes: Type[] = [];
            let requirements: Requirement[];

            let varExprs = statement.variableList.elements;
            let iteratorExpr = statement.iteratorExpression?.getRealExpression();
            if (isForLoopActionCall(iteratorExpr)) {
                varTypes.push(REPEAT_ACTIONS[iteratorExpr.callee.token.value].returnType);
                requirements = [];
            }
            else {
                requirements = this.getRequirements(statement.iteratorExpression, frame);
            }

            for (let i = 0; i < varExprs.length; i++) {
                let varExpr = varExprs[i];
                let varId: VariableId | undefined;
                if (varExpr instanceof VariableExpression) {
                    varId = varExpr.getVarId();
                } else if (varExpr instanceof AtomicExpression && varExpr.token.type == TokenType.IDENTIFIER) {
                    let varEntry = frame.getVariableEntry(varExpr.token.value, varExpr.startPos);
                    if (varEntry) varId = varEntry.id;
                }
                if (!varId) continue;

                frame.registerVariable({
                    id: varId, 
                    type: varTypes[i] ?? null, 
                    effectiveBeyondPosition: statement.chunk.startPos, 
                    requirements, 
                    valueExpression: statement.iteratorExpression, 
                    forLoopVarPos: i,
                    astNode: varExpr,
                });
            }
        }
        // if statement type inference
        else if (statement instanceof IfStatement || statement instanceof WhileStatement) {
            let booleanOpr = BooleanOperation.generateIfPossible(statement.condition.getRealExpression());
            if (booleanOpr instanceof BooleanOperation) booleanOpr = BooleanOperation.simplify(booleanOpr);
            this.applyConditionInferenceVariables(booleanOpr, frame)
        }
    }

    collectionStage(statements: Statement[], frame: EnvironmentFrame = this.globalFrame) {
        for (const statement of statements) {
            // variable assignments
            if (statement instanceof AssignmentStatement
                && statement.isErrorFree()
                && statement.operator.type == TokenType.EQUALS
            ) {
                for (let i = 0; i < statement.leftValues.length; i++) {
                    let variableExpr = statement.leftValues[i];
                    if (!(variableExpr instanceof VariableExpression)) continue;

                    // if this variable has already been declared and there's no explicit type
                    // being specified, don't override the var's type with the inferred value type
                    if (!variableExpr.assignedType) {
                        let existingEntry = frame.getVariableEntry(variableExpr.getVarId(), variableExpr.startPos);
                        if (existingEntry) continue;
                    }

                    let varId = VariableId.fromExpression(variableExpr);
                    if (variableExpr.assignedType) {
                        frame.registerVariable({
                            id: varId, 
                            type: 
                            this.evaluateExplicitType(variableExpr.assignedType.type), 
                            effectiveBeyondPosition: statement.endPos,
                            astNode: statement,
                        });
                    } else {
                        let value = statement.rightValue;
                        frame.registerVariable({
                            id: varId, 
                            type: null, 
                            effectiveBeyondPosition: statement.endPos, 
                            requirements: this.getRequirements(value, frame), 
                            valueExpression: value, 
                            assignmentVarPos: i,
                            astNode: statement,
                        });
                    }
                }
            }
            else if (statement instanceof ExpressionStatement
                && statement.expression instanceof VariableExpression
            ) {
                let variableExpr = statement.expression;
                let varId = VariableId.fromExpression(variableExpr);
                let existingDeclaration = frame.getVariableEntry(varId, variableExpr.startPos);

                if (existingDeclaration && !variableExpr.assignedType) continue;

                frame.registerVariable({
                    id: varId,
                    type: variableExpr.assignedType ? this.evaluateExplicitType(variableExpr.assignedType.type) : null,
                    effectiveBeyondPosition: statement.endPos,
                    astNode: variableExpr
                });
            }
            //=- stuff below here is for entering child frames -=\\
            else {
                for (let c of statement.children) { 
                    // fix else ifs not getting their own frames
                    if (c instanceof IfStatement && c.chunk) {
                        this.collectionStage([c], frame)
                    }

                    if (c instanceof ChunkExpression) {
                        // console.log(c.parent.constructor.name)
                        let subFrame: EnvironmentFrame;
                        // consider contents of perselected statements to be on the same level as the statement's parent
                        if (statement instanceof PerSelectedStatement) { 
                            subFrame = frame;
                        } else {
                            subFrame = frame.addChild(c);
                            this.framesByASTNode.set(c, subFrame);
                        }
                        this.collectionStage(c.statements, subFrame);
                        this.applyStatementVariables(statement, subFrame);
                    }
                }
            }
        }
    }

    // TODO: idk if it should happen here, but at some point we gotta throw error
    // for declaring the same variable in multiple different places within a scope
    evaluationStage(frame: EnvironmentFrame = this.globalFrame) {
        let newSolves = -1;
        let hitWall = false;
        // keep going until no more progress is being made, then solve everything in one final pass using available information
        // this allows dicts/lists with unknown fields to sub in 'any' for those fields and still type everything else
        while (!hitWall) {
            if (newSolves == 0) {
                hitWall = true;
            }
            newSolves = 0;


            for (const [id, allEntries] of frame.entryLists()) {
                for (const entry of allEntries) {
                    if (entry.solved) continue;
    
                    // check if all requirements have been solved
                    // unless we're in the final pass
                    if (!hitWall) {
                        let allRequirementsSolved = true;
                        for (const requirement of entry.requirements) {
                            let rEntry = frame.getVariableEntry(requirement.item, requirement.atPos);
                            // TODO: probably the null case should be handled in a special way
                            if (rEntry == null || rEntry.solved == false) {
                                allRequirementsSolved = false;
                                break;
                            }
                        }
                        if (!allRequirementsSolved) continue;
                    }


                    if (!entry.valueExpression) continue;
    
                    let exprType = this.evaluateExpression(entry.valueExpression, frame);
                    if (entry.forLoopVarPos != undefined) {
                        if (exprType.matches(Type.list) && entry.forLoopVarPos == 0) {
                            entry.type = exprType.getMemberType();
                        } else if (exprType.matches(Type.dict)) {
                            entry.type = (
                                entry.forLoopVarPos == 0 ? Type.str
                                : exprType.getMemberType()
                            );
                        } else {
                            entry.type = Type.unknown;
                        }
                    } else if (entry.assignmentVarPos != undefined) {
                        if (exprType.matches(Type.multivalue)) {
                            let valueTypes = (exprType.data as MultiValueTypeData).types;
                            if (entry.assignmentVarPos < valueTypes.length) {
                                entry.type = valueTypes[entry.assignmentVarPos];
                            } else {
                                entry.type = Type.unknown;
                            }
                        }
                        else if (entry.assignmentVarPos == 0) {
                            // genericize dict and list type inference
                            if (
                                entry.valueExpression instanceof DictionaryExpression
                                || entry.valueExpression instanceof ListExpression
                            ) {
                                entry.type = this.genericizeType(exprType)
                            } else {
                                entry.type = exprType;
                            }
                        } else {
                            entry.type = Type.unknown;
                        }
                    } else {
                        entry.type = exprType;
                    }

                    entry.solved = true;
                    newSolves++;
                }
            }
        }

        // once this frame's been solved as far as it can go, process child frames
        for (const [astNode, child] of frame.children.entries()) {
            this.evaluationStage(child);
        }
    }

    evaluateExpression(expression: Expression, frame: EnvironmentFrame = this.globalFrame): Type {
        expression = expression.getRealExpression();
        if (expression instanceof AtomicExpression) {
            let token = expression.token;
            switch (token.type) {
                case TokenType.IDENTIFIER: {
                    let resolved = this.resolveIdentifier(token);
                    if (resolved instanceof Namespace) {
                        return Type.namespace(resolved);
                    }
                    else if (isFunctionDefinition(resolved)) {
                        return Type.func(resolved);
                    }
                    else if (isVariableEntry(resolved) && resolved.type != null) {
                        return resolved.type;
                    }
                    return Type.unknown;
                };
                case TokenType.NUMERIC_LITERAL: return Type.num;
                case TokenType.STRING_LITERAL: return Type.str;
                case TokenType.STYLED_LITERAL: return Type.txt;
                default: return Type.unknown;
            }
        }
        else if (expression instanceof ListExpression) {
            let indexTypes = expression.elements.map(elm => this.evaluateExpression(elm, frame));
            return Type.list(Type.void, indexTypes);
        }
        else if (expression instanceof DictionaryExpression) {
            let keyTypes: {[key: string]: Type} = {};
            for (const entry of expression.entries) {
                if (!(entry.key instanceof Token)) continue;
                keyTypes[entry.key.value] = this.evaluateExpression(entry.value);
            }
            return Type.dict(Type.void, keyTypes);
        }
        else if (expression instanceof VariableExpression) {
            return frame.getVariableType(VariableId.fromExpression(expression), expression.startPos);
        }
        else if (expression instanceof TypecastExpression) {
            return this.evaluateExplicitType(expression.type);
        }
        else if (expression instanceof AccessExpression) {
            return this.evaluateExpression(expression.accessee, frame).getPropertyType(expression.propertyName.value);
        }
        else if (expression instanceof BracketedAccessExpression) {
            let propNameExpr = expression.propertyName.getRealExpression();
            let propName: number | string | undefined = undefined;
            if (propNameExpr instanceof AtomicExpression) {
                if (propNameExpr.token.type == TokenType.NUMERIC_LITERAL) {
                    // TODO: make this actually handle all tc numbers
                    let parsed = parseInt(propNameExpr.token.value);
                    if (!isNaN(parsed)) {
                        propName = parsed;
                    }
                }
                else {
                    propName = propNameExpr.token.value;
                }
            }
            return this.evaluateExpression(expression.accessee, frame).getMemberType(propName);
        }
        else if (expression instanceof CallExpression) {
            let calleeType = this.evaluateExpression(expression.callee);
            let def: FunctionDefinition | null;
            if (calleeType.name == 'func') {
                def = (calleeType.data as FuncTypeData).definition;
            }
            else if (calleeType.name == 'namespace') {
                def = (calleeType.data as NamespaceTypeData).namespace.nameFunction!;
            } else {
                return Type.unknown;
            }
            let methodCallOf: Expression | undefined;
            if (expression.callee instanceof AccessExpression) {
                methodCallOf = expression.callee.accessee;
            }
            return def.getReturnType(expression.args.elements, this, methodCallOf) ?? Type.unknown;
        }
        else if (expression instanceof BinaryExpression) {
            return Operations.evaluateBinaryType(
                this.evaluateExpression(expression.left, frame),
                expression.operator.type,
                this.evaluateExpression(expression.right, frame),
            )
        }
        else if (expression instanceof UnaryPrefixExpression) {
            return Operations.evaluateUnaryType(
                expression.operator.type,
                this.evaluateExpression(expression.right, frame),
            )
        } 
        else if (expression instanceof SelectionExpression) {
            let definitionBank = expression.keyword.type == TokenType.SELECT ? SELECT_ACTIONS : FILTER_ACTIONS
            if (expression.name.value in definitionBank) {
                return Type.func(definitionBank[expression.name.value])
            } else {
                return Type.unknown;
            }
        } else {
            return Type.unknown;
        }
    }

    evaluateExplicitType(expression: TypeExpression, allowEllipses: boolean = false): Type {
        if (!allowEllipses && expression.ellipses){ 
            this.reportError(expression.ellipses, `Ellipses are not allowed here`);
        }

        // special syntax handling
        if (expression.type instanceof ListExpression) {
            let elementTypes: Type[] = [];
            let genericType: Type | undefined;

            let nonEllipsesTypeFound = false;
            // iterate in reverse so ellipses error handling can be done in the same loop as type evaluation
            for (let i = expression.type.elements.length-1; i >= 0; i--) {
                let element = expression.type.elements[i];
                if (element.ellipses) {
                    if (nonEllipsesTypeFound) {
                        this.reportError(
                            element,
                            `Overflow type must come at the end of the list, after all positional types`
                        );
                    }
                    if (genericType == undefined) {
                        genericType = this.evaluateExplicitType(element, true);
                    } else {
                        this.reportError(
                            element,
                            `Lists may only specify one overflow type`
                        );
                    }
                } else {
                    elementTypes.unshift(this.evaluateExplicitType(element))
                    nonEllipsesTypeFound = true;
                }
            }

            return Type.list(genericType ?? Type.void,elementTypes);
        }
        else if (expression.type instanceof DictionaryTypeExpression) {
            let elementTypes: {[key: string]: Type} = {};
            let genericType: Type | undefined;

            // overflow type
            for (let i = expression.type.overflowTypes.length-1; i >= 0; i--) {
                let type = expression.type.overflowTypes[i];
                if (!type.ellipses) {
                    this.reportError(type, "Expected key name before this type or ellipses after this type");
                    continue;
                }

                if (genericType == undefined) {
                    genericType = this.evaluateExplicitType(type, true);
                } else {
                    this.reportError(type, "Dictionaries may only specify one overflow type");
                }
            }

            // key types
            for (let entry of expression.type.entries) {
               elementTypes[entry.key.value] = this.evaluateExplicitType(entry.value);
            }


            return Type.dict(genericType ?? Type.void,elementTypes);
        }

        let name = expression.type.value;
        if (Type[name] && Type[name] instanceof Type) {
            if (expression.subType) {
                this.reportError(
                    expression.subType,
                    `Type '${name}' is not generic and does not support subtypes`
                );
            }
            return Type[name];
        } else if (Type[name] && Type[name].constructsType) {
            let constructor = Type[name] as TypeConstructor<(...args: any[]) => Type>;
            if (constructor.subTypeCount == 0) {
                this.reportError(
                    expression,
                    `Type '${name}' cannot be directly assigned`
                )
                return Type.unknown;
            }
            let argTypes: Type[] = [];
            if (expression.subType != undefined) {
                argTypes = expression.subType.elements.map(elm => {
                    return this.evaluateExplicitType(elm);
                })
                if (argTypes.length > constructor.subTypeCount) {
                    this.reportError(
                        expression.subType,
                        `Type '${name}' expects ${constructor.subTypeCount} argument${ps(constructor.subTypeCount)}, ${argTypes.length} were provided.`
                    );
                    // strip off extra types before passing into constructor
                    argTypes.length = constructor.subTypeCount;
                }
            }
            // fill in 'any' for non-specified types
            for (let i = argTypes.length; i < constructor.subTypeCount; i++) {
                argTypes.push(Type.any);
            }
            return constructor(...argTypes);
        } else {
            this.reportError(
                expression,
                `Invalid type '${name}'`
            );
            return Type.unknown;
        }
    }

    getNodeFrame(node: ASTNode): EnvironmentFrame {
        let frame = this.framesByASTNode.get(node);
        if (frame) {
            return frame;
        } else if (node.parent == null) {
            return this.globalFrame;
        } else {
            return this.getNodeFrame(node.parent);
        }
    }
}