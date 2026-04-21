import { ASTNode } from "../ast/astNode.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, BracketedAccessExpression, CallExpression, ChunkExpression, Expression, ListExpression, TypecastExpression, TypeExpression, UnaryPrefixExpression, VariableExpression } from "../ast/expression.ts";
import { ExpressionStatement, Statement } from "../ast/statement.ts";
import { Token, TokenType } from "../ast/token.ts";
import { ErrorType, TCError, TCNodeError } from "../error/error.ts";
import { Operations } from "../compiler/operations.ts";
import { FuncTypeData, NamespaceTypeData, Type, TypeConstructor } from "./type.ts";
import { Namespace } from "../compiler/namespace/namespace.ts";
import { ps } from "../util/utils.ts";

export enum VariableScope {
    SAVED,
    GLOBAL,
    LOCAL,
    LINE,
};
/** earlier in the array means higher priority */
const SCOPE_PRIORITY = [VariableScope.LINE, VariableScope.LOCAL, VariableScope.GLOBAL, VariableScope.SAVED]

type Requirement = {item: VariableId | string, atPos: number};

type VariableEntry = {
    id: VariableId,
    solved: boolean,
    type: Type | null,
    requirements: Requirement[], 
    valueExpression: Expression | null,
    effectiveBeyondPosition: number
}

export class EnvironmentFrame {
    /** An empty environment frame with no variables for evaluating expressions in a vacuum */
    static readonly DUMMY = new EnvironmentFrame(null, null)

    // public knownTypes: Map<VariableId, Type[]> = new Map();
    // public unsolvedTypes: Map<VariableId, {requirements: Requirement[], expression: Expression}> = new Map();
    variables: Map<string, Map<VariableScope, VariableEntry[]>> = new Map();
    children: Map<ChunkExpression, EnvironmentFrame> = new Map();
    
    constructor(
        public astNode: ChunkExpression | null,
        public parent: EnvironmentFrame | null,
    ) {}

    registerVariable(
        id: VariableId, 
        type: Type | null = null, 
        effectiveBeyondPosition: number,
        requirements: Requirement[] = [], 
        valueExpression: Expression | null = null,
    ) {
        let entry: VariableEntry = {
            id: id,
            solved: type != null,
            type: type,
            requirements: requirements,
            valueExpression: valueExpression,
            effectiveBeyondPosition: effectiveBeyondPosition,
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
    getVariableEntry(variable: VariableId | string, atPos: number): VariableEntry | null {
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

                    if (i != -1) {
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

    collectionStage(statements: Statement[], frame: EnvironmentFrame = this.globalFrame) {
        for (const statement of statements) {
            // variable assignments
            if (statement instanceof ExpressionStatement 
                && statement.expression instanceof BinaryExpression 
                && statement.expression.left instanceof VariableExpression
                && statement.expression.operator.type == TokenType.EQUALS
            ) {
                // TODO: handle functions with multiple return values
                let variableExpr = statement.expression.left
                let varId = VariableId.fromExpression(variableExpr);
                if (variableExpr.assignedType) {
                    frame.registerVariable(varId, this.evaluateExplicitType(variableExpr.assignedType.type), statement.endPos);
                } else {
                    let value = statement.expression.right;
                    frame.registerVariable(varId, null, statement.endPos, this.getRequirements(value, frame), value);
                }
            }
            else if (statement instanceof ExpressionStatement
                && statement.expression instanceof VariableExpression
            ) {
                let variableExpr = statement.expression;
                frame.registerVariable(
                    VariableId.fromExpression(variableExpr),
                    variableExpr.assignedType ? this.evaluateExplicitType(variableExpr.assignedType.type) : null,
                    statement.endPos
                );
            }


            //=- stuff below here is for entering child frames -=\\
            else {
                for (const c of statement.children){ 
                    if (c instanceof ChunkExpression) {
                        let newFrame = frame.addChild(c);
                        this.framesByASTNode.set(statement, newFrame);
                        this.collectionStage(c.statements, newFrame);
                    }
                }
            }
        }
    }

    // TODO: idk if it should happen here, but at some point we gotta throw error
    // for declaring the same variable in multiple different places within a scope
    evaluationStage(frame: EnvironmentFrame = this.globalFrame) {
        let newSolves = -1;
        // keep going until no more progress is being made
        while (newSolves != 0) {
            newSolves = 0;
            for (const [id, allEntries] of frame.entryLists()) {
                for (const entry of allEntries) {
                    if (entry.solved) continue;
    
                    // check if all requirements have been solved
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
                    if (!entry.valueExpression) continue;
    
                    entry.type = this.evaluateExpression(entry.valueExpression, frame);
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
                    if (token.value in Namespace.registry) {
                        return Type.namespace(Namespace.registry[token.value]);
                    }
                    return frame.getVariableType(token.value,token.startPos)
                };
                case TokenType.NUMERIC_LITERAL: return Type.num;
                case TokenType.STRING_LITERAL: return Type.str;
                case TokenType.STYLED_LITERAL: return Type.txt;
                default: return Type.unknown;
            }
        }
        else if (expression instanceof ListExpression) {
            return Type.list(Type.any, expression.elements.map(elm => this.evaluateExpression(elm, frame)));
        }
        else if (expression instanceof VariableExpression) {
            return frame.getVariableType(VariableId.fromExpression(expression), expression.startPos);
        }
        else if (expression instanceof TypecastExpression) {
            return this.evaluateExplicitType(expression.type);
        }
        else if (expression instanceof AccessExpression) {
            return this.evaluateExpression(expression.accessee, frame).getMemberType(expression.propertyName.value);
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
            if (calleeType.name == 'func') {
                let data = calleeType.data as FuncTypeData
                return data.definition.returnType ?? Type.unknown;
            }
            else if (calleeType.name == 'namespace') {
                let data = calleeType.data as NamespaceTypeData;
                return data.namespace.nameFunction?.returnType ?? Type.unknown;
            }
            return Type.unknown;
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

            return Type.list(genericType ?? Type.any,elementTypes);
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
        } else if (Type[name].constructsType) {
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