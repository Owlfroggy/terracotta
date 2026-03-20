import { BinaryExpression, Expression, AtomicExpression, GroupExpression, MissingExpression, ListExpression, CallExpression, AccessExpression, ChunkExpression, VariableExpression } from "../ast/expression.ts";
import { EventStatement, ExpressionStatement, Statement } from "../ast/statement.ts";
import { Token, TokenType, BindingPower } from "../ast/token.ts";
import { ErrorType, TCError } from "../error/error.ts";

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
    tokenStatementProcessors: Map<TokenType, (() => Statement | null) | (() => Statement)>;
    position: number = 0;

    constructor(
        public tokens: Token[]
    ) {
        this.tokenNUDProperties = new Map<TokenType, NUDProcessingProperties>([
            [TokenType.IDENTIFIER,      {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.STRING_LITERAL,  {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {bp: BindingPower.GROUP, processor: this.parseGroupExpression}],
            [TokenType.OPEN_BRACKET,    {bp: BindingPower.ATOM,  processor: () => this.parseListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA)}],
            [TokenType.GLOBAL,          {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.SAVED,           {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.LOCAL,           {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
            [TokenType.LINE,            {bp: BindingPower.ATOM,  processor: this.parseVariableExpression}],
        ]);
        this.tokenLEDProperties = new Map<TokenType, LEDProcessingProperties>([
            [TokenType.EQUALS,          {bp: BindingPower.ASSIGN,processor: this.parseBinaryExpression}],
            [TokenType.PLUS_EQUALS,     {bp: BindingPower.ASSIGN,processor: this.parseBinaryExpression}],
            [TokenType.MINUS_EQUALS,    {bp: BindingPower.ASSIGN,processor: this.parseBinaryExpression}],
            [TokenType.STAR_EQUALS,     {bp: BindingPower.ASSIGN,processor: this.parseBinaryExpression}],
            [TokenType.SLASH_EQUALS,    {bp: BindingPower.ASSIGN,processor: this.parseBinaryExpression}],

            [TokenType.PLUS,            {bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],

            [TokenType.OPEN_PAREN,      {bp: BindingPower.CALL,  processor: this.parseCallExpression}],
            [TokenType.DOT,             {bp: BindingPower.ACCESS,processor: this.parseAccessExpression}],
            // [TokenType.EOF,     {bp: 0  , processType: TokenPType.NONE}]
        ]);
        this.tokenStatementProcessors = new Map([
            [TokenType.LAGSLAYER_CANCEL,    this.parseEventStatement],
            [TokenType.PLAYER_EVENT,        this.parseEventStatement],
            [TokenType.ENTITY_EVENT,        this.parseEventStatement],
            [TokenType.GAME_EVENT,          this.parseEventStatement],
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

    expect(type: TokenType | TokenType[]): [Token, boolean] {
        this.consumeComments();
        let currentToken = this.currentToken();
        if (
            Array.isArray(type) ? (type.includes(currentToken.type)) : (currentToken.type == type)
        ) {
            this.consume();
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
            && type != TokenType.IDENTIFIER
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
        ) {
            let comments = this.consumeComments();
            let expr: Expression;
            if (!this.currrentTokenNUDProps()) {
                // EVERYTHING IN THIS IF STATEMENT IS ERROR RECOVERY!!

                // if this is an operator without a left value, try
                // running its parsing code with a Missing as its left
                let ledProps = this.currentTokenLEDProps();
                if (ledProps) {
                    expr = ledProps.processor(new MissingExpression(this.currentToken().startPos), BindingPower.DEFAULT)
                } 
                // if the current token cannot be processed in any way,
                // break to avoid getting stuck in an infinite loop
                else {
                    break;
                }
            } 
            // normal parsing code, this will run every time on a valid syntax file
            else {
                expr = this.parseExpression(BindingPower.DEFAULT);
            }
            expr.attachedComments.push(...comments);
            elements.push(expr);
            if (this.currentToken().type != closerType) {
                this.expect(delimiter);
            }
        }
        let [closer, closerFound] = this.expect(closerType);
        return new ListExpression(opener, elements, closer);
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
                if ((statement as ExpressionStatement).expression instanceof MissingExpression) {
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

    parseExpression = (bp: number): Expression => { 
        this.consumeComments();

        let nudProps = this.currrentTokenNUDProps();
        if (nudProps == null) {
            this.reportUndisplayedError(
                this.currentToken().startPos, this.currentToken().endPos,
                `Expected a value here, got ${this.currentToken()}`
            );
            return new MissingExpression(this.currentToken().startPos);
        }

        let left = nudProps.processor(bp); // advances position

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

    parseEventStatement = (): EventStatement | null => {
        let modifiers: Token[] = [];
        if (this.currentToken().type == TokenType.LAGSLAYER_CANCEL) {
            modifiers.push(this.consume());
        }

        let [mainKeyword, mainKeywordValid] = this.expectOrMissing([TokenType.PLAYER_EVENT, TokenType.ENTITY_EVENT, TokenType.GAME_EVENT]);
        if (!mainKeywordValid) return null;
        
        let [eventName, eventNameValid] = this.expectOrMissing(TokenType.IDENTIFIER)
        
        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (!chunk) return null;

        return new EventStatement(modifiers, mainKeyword, eventName, chunk);
    }

    parse() {
        this.statements.length = 0;
        this.errors.length = 0;

        let chunk = this.parseChunkExpression(TokenType.MISSING, TokenType.EOF) as ChunkExpression;
        this.statements.push(...chunk.statements);
    }
}