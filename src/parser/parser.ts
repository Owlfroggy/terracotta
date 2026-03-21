import { BinaryExpression, Expression, AtomicExpression, GroupExpression, MissingExpression, ListExpression, CallExpression, AccessExpression, ChunkExpression, VariableExpression, CallOrStartExpression, TypeExpression, TypeAssignmentExpression, ParameterExpression, MultiTypeAssignmentExpression, DictionaryEntryExpression, DictionaryExpression } from "../ast/expression.ts";
import { EventStatement, ExpressionStatement, RepeatStatement, ReturnStatement, SingleKeywordStatement, Statement, VariableStatement, FunctionStatement, ProcessStatement, IfStatement } from "../ast/statement.ts";
import { Token, TokenType, BindingPower } from "../ast/token.ts";
import { ErrorType, TCError } from "../error/error.ts";

export const VARIABLE_SCOPE_KEYWORDS = [TokenType.GLOBAL,TokenType.SAVED,TokenType.LOCAL,TokenType.LOCAL];
export const ASSIGNMENT_OPERATORS = [TokenType.EQUALS, TokenType.PLUS_EQUALS, TokenType.MINUS_EQUALS, TokenType.STAR_EQUALS, TokenType.SLASH_EQUALS];
export const TYPE_KEYWORDS = [TokenType.STR,TokenType.NUM,TokenType.VEC,TokenType.LOC,TokenType.POT,TokenType.VAR,TokenType.SND,TokenType.TXT,TokenType.ITEM,TokenType.LIST,TokenType.DICT,TokenType.PAR,TokenType.ANY];

export type NUDProcessingProperties = {
    /** binding power */
    bp: number,
    processor: (bp: number) => Expression;
}

export type LEDProcessingProperties = {
    /** binding power */
    bp: number,
    processor: (left: Expression, bp: number) => Expression;
}

export class Parser {
    statements: Statement[] = [];
    errors: TCError[] = [];
    tokenNUDProperties: Map<TokenType, NUDProcessingProperties>;
    tokenLEDProperties: Map<TokenType, LEDProcessingProperties>;
    tokenStatementProcessors: Map<TokenType, (() => Statement | null)>;
    position: number = 0;

    constructor(
        public tokens: Token[]
    ) {
        this.tokenNUDProperties = new Map<TokenType, NUDProcessingProperties>([
            [TokenType.IDENTIFIER,      {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.STRING_LITERAL,  {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.STYLED_LITERAL,  {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {bp: BindingPower.GROUP, processor: this.parseGroupExpression}],
            [TokenType.OPEN_BRACKET,    {bp: BindingPower.ATOM,  processor: () => this.parseListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA)}],
            [TokenType.OPEN_CURLY,      {bp: BindingPower.ATOM,  processor: this.parseDictionaryExpression}],

            [TokenType.GLOBAL,          {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.SAVED,           {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.LOCAL,           {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.LINE,            {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],

            [TokenType.CALL,            {bp: BindingPower.ATOM,  processor: this.parseCallOrStartExpression}],
            [TokenType.START,           {bp: BindingPower.ATOM,  processor: this.parseCallOrStartExpression}],

            ...TYPE_KEYWORDS.map(i => [i, {bp: BindingPower.ATOM, processor: this.parseAtomicExpression}] as const),
        ]);
        this.tokenLEDProperties = new Map<TokenType, LEDProcessingProperties>([
            [TokenType.EQUALS,          {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.PLUS_EQUALS,     {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS_EQUALS,    {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.STAR_EQUALS,     {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.SLASH_EQUALS,    {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],

            [TokenType.DOUBLE_EQUALS,   {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],
            [TokenType.NOT_EQUALS,      {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],
            [TokenType.LESS_EQUALS,     {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],
            [TokenType.LESS,            {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],
            [TokenType.GREATER_EQUALS,  {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],
            [TokenType.GREATER,         {bp: BindingPower.COMPARE,  processor: this.parseBinaryExpression}],

            [TokenType.PLUS,            {bp: BindingPower.ADD,      processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {bp: BindingPower.ADD,      processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {bp: BindingPower.MULT,     processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {bp: BindingPower.MULT,     processor: this.parseBinaryExpression}],

            [TokenType.TO,              {bp: BindingPower.LOOP_KW,  processor: this.parseBinaryExpression}],

            [TokenType.OPEN_PAREN,      {bp: BindingPower.CALL,     processor: this.parseCallExpression}],
            [TokenType.DOT,             {bp: BindingPower.ACCESS,   processor: this.parseAccessExpression}],
            // [TokenType.EOF,     {bp: 0  , processType: TokenPType.NONE}]
        ]);
        this.tokenStatementProcessors = new Map<TokenType, () => Statement | null>([
            [TokenType.LAGSLAYER_CANCEL,    this.parseEventStatement],
            [TokenType.PLAYER_EVENT,        this.parseEventStatement],
            [TokenType.ENTITY_EVENT,        this.parseEventStatement],
            [TokenType.GAME_EVENT,          this.parseEventStatement],
            [TokenType.FUNCTION,            this.parseFunctionStatement],
            [TokenType.PROCESS,             this.parseProcessStatement],

            [TokenType.REPEAT,              this.parseRepeatStatement],
            [TokenType.IF,                  this.parseIfStatement],
            
            [TokenType.RETURN,              this.parseReturnStatement],
            [TokenType.BREAK,               this.parseSingleKeywordStatement],
            [TokenType.CONTINUE,            this.parseSingleKeywordStatement],
            [TokenType.ENDTHREAD,           this.parseSingleKeywordStatement],
            [TokenType.ENDALLTHREADS,       this.parseSingleKeywordStatement],
            [TokenType.WAIT,                this.parseSingleKeywordStatement],

            [TokenType.GLOBAL,              this.parseVariableStatement],
            [TokenType.SAVED,               this.parseVariableStatement],
            [TokenType.LOCAL,               this.parseVariableStatement],
            [TokenType.LINE,                this.parseVariableStatement],
        ]);
    }


    reportError(startPos: number, endPos: number, message: string) {
        this.errors.push(new TCError(
            startPos, endPos,
            ErrorType.PARSER,
            message
        ));
    }

    /** Reports an error that should not be displayed to the user since
     *  a later compilation sstep will provide a more detailed breakdown */
    reportUndisplayedError(startPos: number, endPos: number, message: string) {
        let e = new TCError(
            startPos, endPos,
            ErrorType.PARSER,
            message
        );
        e.shouldDisplay = false;
        this.errors.push(e);
    }

    expect(type: TokenType | TokenType[], advance: boolean = true): [Token, boolean] {
        this.consumeComments();
        let currentToken = this.currentToken();
        if (
            Array.isArray(type) ? (type.includes(currentToken.type)) : (currentToken.type == type)
        ) {
            if (advance) this.consume();
            return [currentToken, true];
        } else {
            this.reportError(
                currentToken.startPos, currentToken.endPos,
                `expected ${Array.isArray(type) ? ("one of "+type.map(t => TokenType[t]).join(", ")) : TokenType[type]} got ${currentToken}`
            );
            return [currentToken, false];
        }
    }
    expectOrMissing(type: TokenType | TokenType[]): [Token, boolean] {
        let result = this.expect(type);
        if (!result[1]) {
            result[0] = Token.missing(result[0].startPos);
        }
        return result;
    }

    // NOTE: these methods have to take arrow form (=>) or else everything breaks horrendously. you have been warned...

    /** returns the token at index `position` */
    currentToken = (): Token => {
        return this.tokens[this.position];
    }

    /** returns the processing properties of the token at index `position` */
    currrentTokenNUDProps = (): NUDProcessingProperties | null => {
        let token = this.currentToken();
        if (!this.tokenNUDProperties.has(token.type)) return null;
        return this.tokenNUDProperties.get(token.type)!;
    }
    currentTokenLEDProps = (): LEDProcessingProperties | null => {
        let token = this.currentToken();
        if (!this.tokenLEDProperties.has(token.type)) return null;
        return this.tokenLEDProperties.get(token.type)!;
    }

    isLineDelimiter = (t: Token = this.currentToken()): boolean => {
        return (
            this.currentToken().type == TokenType.EOF 
            || this.currentToken().type == TokenType.SEMICOLON
        )
    }

    /** returns the current token and advances position by 1 */
    consume = (): Token => {
        let t = this.currentToken();
        if (t.type != TokenType.EOF) this.position++;
        return t;
    }

    consumeComments = (): Token[] => {
        let comments: Token[] = [];
        while (this.currentToken().type == TokenType.MULTILINE_COMMENT){ 
            comments.push(this.consume());
        }
        return comments;
    }

    parseAtomicExpression = (): AtomicExpression | MissingExpression => {
        let token = this.currentToken();
        let type = token.type;

        // error handling for a non-atomic token
        if (
            type != TokenType.NUMERIC_LITERAL
            && type != TokenType.STRING_LITERAL
            && type != TokenType.STYLED_LITERAL
            && type != TokenType.IDENTIFIER
            && !(TYPE_KEYWORDS.includes(type))
        ) {
            this.reportUndisplayedError(
                token.startPos, token. endPos,
                `Expected atomic expression, got ${token}`
            );
            return new MissingExpression(token.startPos);
        }

        this.consume();
        return new AtomicExpression(token);
    }

    parseVariableExpression = (): VariableExpression => {
        let scope = this.consume();
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL]);
        return new VariableExpression(scope, name);
    }

    parseTypeExpression = (): TypeExpression => {
        let [type, typeFound] = this.expectOrMissing(TYPE_KEYWORDS);
        return new TypeExpression(type);
    }

    parseTypeAssignmentExpression = (optional: boolean = false): TypeAssignmentExpression | null => {
        if (optional && this.currentToken().type != TokenType.COLON)
            return null;
        let [colon, colonFound] = this.expect(TokenType.COLON);
        let type = this.parseTypeExpression();
        return new TypeAssignmentExpression(colon, type);
    }

    parseMultiTypeAssignmentExpression = (optional: boolean = false): MultiTypeAssignmentExpression | null => {
        if (optional && this.currentToken().type != TokenType.COLON)
            return null;
        let [colon, colonFound] = this.expect(TokenType.COLON);
        let types: TypeExpression[] = [];
        do {
            if (this.currentToken().type == TokenType.COMMA)
                this.consume();
            types.push(this.parseTypeExpression());
        } while (this.currentToken().type == TokenType.COMMA);
        return new MultiTypeAssignmentExpression(colon, types);
    }

    parseBinaryExpression = (left: Expression, bp: number): BinaryExpression => {
        return new BinaryExpression(
            left,
            this.consume(),
            this.parseExpression(bp)
        );
    }

    parseCallExpression = (left: Expression, bp: number) => {
        return new CallExpression(
            left,
            this.parseListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA)
        );
    }

    parseCallOrStartExpression = () => {
        let keyword = this.consume();
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL])
        let args: ListExpression | null = null;
        if (this.currentToken().type == TokenType.OPEN_PAREN) {
            args = this.parseListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA);
        }
        return new CallOrStartExpression(keyword, name, args);
    }

    parseAccessExpression = (left: Expression, bp: number): AccessExpression => {
        let accessorToken = this.consume();

        let [propertyName, propertyNameFound] = this.expectOrMissing(TokenType.IDENTIFIER);
        
        return new AccessExpression(
            left,
            accessorToken,
            propertyName
        );
    }

    parseGroupExpression = (bp: number): GroupExpression => {
        let [opener, openerFound] = this.expect(TokenType.OPEN_PAREN);
        let expr = this.parseExpression(BindingPower.DEFAULT);
        let [closer, closerFound] = this.expect(TokenType.CLOSE_PAREN);
        return new GroupExpression(
            opener,
            expr,
            closer,
        );
    }

    parseListExpression = (openerType: TokenType, closerType: TokenType, delimiter: TokenType): ListExpression => {
        let [opener, openerFound] = this.expect(openerType);
        let elements: Expression[] = [];
        while (
            this.currentToken().type != closerType 
            && !this.isLineDelimiter(this.currentToken())
        ) {
            let comments = this.consumeComments();
            let expr: Expression = this.parseExpression(BindingPower.DEFAULT, true);
            expr.attachedComments.push(...comments);
            elements.push(expr);
            if (this.currentToken().type != closerType) {
                this.expect(delimiter);
            }
        }
        let [closer, closerFound] = this.expect(closerType);
        return new ListExpression(opener, elements, closer);
    }
    
    parseParamListExpression = (openerType: TokenType, closerType: TokenType, delimiter: TokenType, optional: boolean = false): ListExpression<ParameterExpression> | null => {
        if (optional && this.currentToken().type != openerType) return null;
        let [opener, openerFound] = this.expect(openerType);
        if (!openerFound) return null;

        let elements: ParameterExpression[] = [];
        while (
            this.currentToken().type != closerType 
            && !this.isLineDelimiter()
        ) {
            let comments = this.consumeComments();
            let expr = this.parseParameterExpression();
            if (expr == null) {
                this.consume();
            } else {
                expr.attachedComments.push(...comments);
                elements.push(expr);
            }
            if (this.currentToken().type != closerType) {
                this.expect(delimiter);
            }
        }
        let [closer, closerFound] = this.expect(closerType);
        return new ListExpression(opener, elements, closer);
    }

    parseParameterExpression = (): ParameterExpression | null => {
        let [name, nameFound] = this.expect([TokenType.IDENTIFIER, TokenType.STRING_LITERAL]);
        if (!nameFound) return null;

        let type = this.parseTypeAssignmentExpression(true);
        let plural: Token | null = null;
        let equals: Token | null = null;
        let defaultValue: Expression | null = null;
        if (type != null) {
            if (this.currentToken().type == TokenType.ELLIPSES) {
                plural = this.consume();
            }
            if (this.currentToken().type == TokenType.EQUALS) {
                equals = this.consume();
                defaultValue = this.parseExpression(BindingPower.DEFAULT);
            }
        }
        return new ParameterExpression(name, type, plural, equals, defaultValue);
    }


    parseDictionaryExpression = (): DictionaryExpression => {
        let [opener, openerFound] = this.expect(TokenType.OPEN_CURLY);
        let entries: DictionaryEntryExpression[] = [];
        while (
            this.currentToken().type != TokenType.CLOSE_CURLY
            && !this.isLineDelimiter(this.currentToken())
        ) {
            let comments = this.consumeComments();

            let key: Token | GroupExpression; let keyFound;
            [key, keyFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL, TokenType.OPEN_PAREN]);
            if (key.type == TokenType.OPEN_PAREN) {
                this.position--;
                key = this.parseGroupExpression(BindingPower.DEFAULT);
            }
            
            let [colon, colonFound] = this.expectOrMissing(TokenType.COLON);
            
            let value = this.parseExpression(BindingPower.DEFAULT, true);

            let expr = new DictionaryEntryExpression(key, colon, value);
            expr.attachedComments.push(...comments);
            entries.push(expr);
            if (this.currentToken().type != TokenType.CLOSE_CURLY) {
                this.expect(TokenType.COMMA);
            }
        }
        let [closer, closerFound] = this.expect(TokenType.CLOSE_CURLY);
        return new DictionaryExpression(opener, entries, closer);
    }

    parseChunkExpression = (openerType: TokenType, closerType: TokenType): ChunkExpression | null => {
        let opener: Token;
        let openerFound = false;
        if (openerType == TokenType.MISSING) {
            opener = Token.missing(this.currentToken().startPos);
        } else {
            [opener, openerFound] = this.expect(openerType);
            if (!openerFound) return null;
        }

        let statements: Statement[] = [];
        while (this.currentToken().type != closerType && this.currentToken().type != TokenType.EOF) {
            let comments = this.consumeComments();
            let currentTokenType = this.currentToken().type;            

            let useSpecialStatement = this.tokenStatementProcessors.has(currentTokenType);
            let statement: Statement | null;
            if (useSpecialStatement) {
                statement = this.tokenStatementProcessors.get(currentTokenType)!()
            } else {
                statement = this.parseExpressionStatement();

                // dont include statements which boil down to just a MissingExpression
                let expr = (statement as ExpressionStatement).expression;
                while (expr instanceof GroupExpression) expr = expr.expression;
                if (expr instanceof MissingExpression) {
                    this.consume();
                    continue;
                }

                this.expect(TokenType.SEMICOLON);
            }

            if (statement != null) {
                statement.attachedComments.push(...comments);
                statements.push(statement);
            };
        }
        
        let [closer, closerFound] = this.expectOrMissing(closerType);

        return new ChunkExpression(
            opener,
            statements,
            closer,
        );
    }

    parseExpression = (bp: number, allowMissingLeft: boolean = false): Expression => { 
        this.consumeComments();

        let nudProps = this.currrentTokenNUDProps();
        let left: Expression;
        if (nudProps == null) {
            // EVERYTHING IN THIS IF STATEMENT IS ERROR RECOVERY!!
            this.reportUndisplayedError(
                this.currentToken().startPos, this.currentToken().endPos,
                `Expected a value here, got ${this.currentToken()}`
            );
            let missing = new MissingExpression(this.currentToken().startPos);
            if (allowMissingLeft && !this.isLineDelimiter()) {
                // if this is an operator without a left value, try
                // running its parsing code with a Missing as its left
                if (this.currentTokenLEDProps()) {
                    left = missing;
                } else {
                    // if the current token cannot be processed in any way,
                    // call it a MissingExpression to avoid being stuck forever
                    this.consume();
                    return missing;
                }
            } else {
                return missing;
            }
        } else {
            // this branch will run every time for a error-free ast
            left = nudProps.processor(bp); // advances position
        }

        let ledProps = this.currentTokenLEDProps();

        while (ledProps != null && ledProps.bp > bp) {
            left = ledProps.processor(left, ledProps.bp);
            ledProps = this.currentTokenLEDProps();
        }

        return left;
    }

    parseExpressionStatement = (): ExpressionStatement => {
        let expr = this.parseExpression(BindingPower.DEFAULT);
        return new ExpressionStatement(expr.startPos,expr.endPos,expr);
    }

    parseVariableStatement = (): VariableStatement => {
        let variable = this.parseVariableExpression();
        let operator: Token | null = null;

        // specify a type
        let type = this.parseTypeAssignmentExpression(true);

        // assign to a value
        let value: Expression | null = null;
        if (ASSIGNMENT_OPERATORS.includes(this.currentToken().type)) {
            operator = this.consume();
            value = this.parseExpression(BindingPower.DEFAULT);
        }

        this.expect(TokenType.SEMICOLON);
        return new VariableStatement(variable, type, operator, value);
    }

    parseEventStatement = (): EventStatement | null => {
        let modifiers: Token[] = [];
        if (this.currentToken().type == TokenType.LAGSLAYER_CANCEL) {
            modifiers.push(this.consume());
        }

        let [mainKeyword, mainKeywordFound] = this.expectOrMissing([TokenType.PLAYER_EVENT, TokenType.ENTITY_EVENT, TokenType.GAME_EVENT]);
        if (!mainKeywordFound) return null;
        
        let [eventName, eventNameFound] = this.expectOrMissing(TokenType.IDENTIFIER)
        
        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (!chunk) return null;

        return new EventStatement(modifiers, mainKeyword, eventName, chunk);
    }

    parseFunctionStatement = (): FunctionStatement | null => {
        let keyword = this.consume();
        
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL]);

        let params = this.parseParamListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA, true);

        let returnType = this.parseMultiTypeAssignmentExpression(true);

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (!chunk) return null;

        return new FunctionStatement(keyword, name, params, returnType, chunk);
    }

    parseProcessStatement = (): ProcessStatement | null => {
        let keyword = this.consume();
        
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL]);

        let params = this.parseParamListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA, true);

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (!chunk) return null;

        return new ProcessStatement(keyword, name, params, chunk);
    }


    parseRepeatStatement = (): RepeatStatement | null => {
        let keyword = this.consume();

        let [next, nextFound] = this.expect([TokenType.OPEN_PAREN, TokenType.OPEN_CURLY], false);
        if (!nextFound) return null;

        let countExpression: GroupExpression | null = null;
        // repeat n times statement
        if (next.type == TokenType.OPEN_PAREN) {
            countExpression = this.parseGroupExpression(BindingPower.DEFAULT);
        }

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (chunk == null) return null;
        return new RepeatStatement(keyword, countExpression, chunk);
    }

    parseIfStatement = (): IfStatement | null => {
        let keyword = this.consume();

        let condition = this.parseGroupExpression(BindingPower.DEFAULT);

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (chunk == null) return null;

        return new IfStatement(keyword, condition, chunk);
    }

    parseSingleKeywordStatement = (): SingleKeywordStatement => {
        let keyword = this.consume();
        let args: ListExpression | null = null;
        if (keyword.type == TokenType.WAIT || keyword.type == TokenType.ENDALLTHREADS) {
            if (this.currentToken().type == TokenType.OPEN_PAREN) {
                args = this.parseListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA)
            }
        }
        this.expect(TokenType.SEMICOLON);
        return new SingleKeywordStatement(keyword, args);
    }

    parseReturnStatement = (): ReturnStatement => {
        let keyword = this.consume();
        let value: Expression | null = null;

        let values: Expression[] = [];
        do {
            if (this.currentToken().type == TokenType.COMMA)
                this.consume();
            if (this.currentToken().type != TokenType.SEMICOLON) {
                values.push(this.parseExpression(BindingPower.DEFAULT));
            }
        } while (this.currentToken().type == TokenType.COMMA);

        this.expect(TokenType.SEMICOLON);
        return new ReturnStatement(keyword, values);
    }

    parse() {
        this.statements.length = 0;
        this.errors.length = 0;

        let chunk = this.parseChunkExpression(TokenType.MISSING, TokenType.EOF) as ChunkExpression;
        this.statements.push(...chunk.statements);
    }
}