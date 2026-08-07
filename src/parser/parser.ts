import { ASTNode, RootNode } from "../ast/astNode.ts";
import { BinaryExpression, Expression, AtomicExpression, GroupExpression, MissingExpression, ListExpression, CallExpression, AccessExpression, ChunkExpression, VariableExpression, CallOrStartExpression, TypeExpression, TypeAssignmentExpression, ParameterExpression, MultiTypeAssignmentExpression, DictionaryEntryExpression, DictionaryExpression, UnaryPrefixExpression, BracketedAccessExpression, TypecastExpression, DictionaryTypeExpression, DictionaryTypeEntryExpression, PerSelectedExpression, SelectionExpression } from "../ast/expression.ts";
import { EventStatement, ExpressionStatement, RepeatStatement, ReturnStatement, SingleKeywordStatement, Statement, FunctionStatement, IfStatement, WhileStatement, ForStatement, DoStatement, AssignmentStatement, PerSelectedStatement, DeclareStatement, IncrementStatement } from "../ast/statement.ts";
import { Token, TokenType, BindingPower } from "../ast/token.ts";
import { ErrorPositionMode, ErrorType, TCError, TCNodeError } from "../error/error.ts";
import { dirWithoutRelations } from "../util/debug.ts";

export const VARIABLE_SCOPE_KEYWORDS = [TokenType.GLOBAL,TokenType.SAVED,TokenType.LOCAL,TokenType.LOCAL];
export const ASSIGNMENT_OPERATORS = [TokenType.EQUALS, TokenType.PLUS_EQUALS, TokenType.MINUS_EQUALS, TokenType.STAR_EQUALS, TokenType.SLASH_EQUALS];

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
            [TokenType.IDENTIFIER,      {bp: BindingPower.ATOM,     processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {bp: BindingPower.ATOM,     processor: this.parseAtomicExpression}],
            [TokenType.NUMEXPR_LITERAL, {bp: BindingPower.ATOM,     processor: this.parseAtomicExpression}],
            [TokenType.STRING_LITERAL,  {bp: BindingPower.ATOM,     processor: this.parseAtomicExpression}],
            [TokenType.STYLED_LITERAL,  {bp: BindingPower.ATOM,     processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {bp: BindingPower.GROUP,    processor: this.parseGroupExpression}],
            [TokenType.OPEN_BRACKET,    {bp: BindingPower.ATOM,     processor: () => this.parseListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA)}],
            [TokenType.OPEN_CURLY,      {bp: BindingPower.ATOM,     processor: this.parseDictionaryExpression}],

            [TokenType.GLOBAL,          {bp: BindingPower.ATOM,     processor: this.parseVariableExpression}],
            [TokenType.SAVED,           {bp: BindingPower.ATOM,     processor: this.parseVariableExpression}],
            [TokenType.LOCAL,           {bp: BindingPower.ATOM,     processor: this.parseVariableExpression}],
            [TokenType.LINE,            {bp: BindingPower.ATOM,     processor: this.parseVariableExpression}],

            [TokenType.PERSELECTED,     {bp: BindingPower.ATOM,     processor: this.parsePerSelectedExpression}],
            [TokenType.SELECT,          {bp: BindingPower.ATOM,     processor: this.parseSelectionExpression}],
            [TokenType.FILTER,          {bp: BindingPower.ATOM,     processor: this.parseSelectionExpression}],
            
            [TokenType.CALL,            {bp: BindingPower.ATOM,     processor: this.parseCallOrStartExpression}],
            [TokenType.START,           {bp: BindingPower.ATOM,     processor: this.parseCallOrStartExpression}],

            [TokenType.MINUS,           {bp: BindingPower.PREFIX,   processor: this.parseUnaryPrefixExpression}],
            [TokenType.BANG,            {bp: BindingPower.PREFIX,   processor: this.parseUnaryPrefixExpression}],
        ]);
        this.tokenLEDProperties = new Map<TokenType, LEDProcessingProperties>([
            [TokenType.EQUALS,          {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.PLUS_EQUALS,     {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS_EQUALS,    {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.STAR_EQUALS,     {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.SLASH_EQUALS,    {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.PERCENT_EQUALS,  {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],
            [TokenType.POW_EQUALS,      {bp: BindingPower.ASSIGN,   processor: this.parseBinaryExpression}],

            [TokenType.DOUBLE_EQUALS,   {bp: BindingPower.EQUALITY, processor: this.parseBinaryExpression}],
            [TokenType.BANG_EQUALS,     {bp: BindingPower.EQUALITY, processor: this.parseBinaryExpression}],
            [TokenType.LESS_EQUALS,     {bp: BindingPower.RELATION, processor: this.parseBinaryExpression}],
            [TokenType.LESS,            {bp: BindingPower.RELATION, processor: this.parseBinaryExpression}],
            [TokenType.GREATER_EQUALS,  {bp: BindingPower.RELATION, processor: this.parseBinaryExpression}],
            [TokenType.GREATER,         {bp: BindingPower.RELATION, processor: this.parseBinaryExpression}],

            [TokenType.PLUS,            {bp: BindingPower.ADD,      processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {bp: BindingPower.ADD,      processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {bp: BindingPower.MULT,     processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {bp: BindingPower.MULT,     processor: this.parseBinaryExpression}],
            [TokenType.PERCENT,         {bp: BindingPower.MULT,     processor: this.parseBinaryExpression}],
            [TokenType.POW,             {bp: BindingPower.EXPO,     processor: this.parseBinaryExpression}],
            
            [TokenType.BOOL_AND,        {bp: BindingPower.BOOL_AND, processor: this.parseBinaryExpression}],
            [TokenType.BOOL_OR,         {bp: BindingPower.BOOL_OR,  processor: this.parseBinaryExpression}],

            [TokenType.COALESCE,        {bp: BindingPower.BOOL_OR,  processor: this.parseBinaryExpression}],
            
            [TokenType.AS,              {bp: BindingPower.TYPECAST, processor: this.parseTypecastExpression}],

            [TokenType.TO,              {bp: BindingPower.LOOP_KW,  processor: this.parseBinaryExpression}],

            [TokenType.OPEN_PAREN,      {bp: BindingPower.CALL,     processor: this.parseCallExpression}],
            [TokenType.DOT,             {bp: BindingPower.ACCESS,   processor: this.parseAccessExpression}],
            [TokenType.OPEN_BRACKET,    {bp: BindingPower.ACCESS,   processor: this.parseBracketedAccessExpression}],

            // bitwise hell
            ... // assignment
            [TokenType.BW_OR_EQUALS, TokenType.BW_AND_EQUALS, TokenType.BW_NOT_EQUALS, TokenType.BW_XOR_EQUALS, TokenType.BW_LSHIFT_EQUALS, TokenType.BW_RSHIFT_EQUALS, TokenType.BW_URSHIFT_EQUALS,
             TokenType.PBW_OR_EQUALS,TokenType.PBW_AND_EQUALS,TokenType.PBW_NOT_EQUALS,TokenType.PBW_XOR_EQUALS,TokenType.PBW_LSHIFT_EQUALS,TokenType.PBW_RSHIFT_EQUALS,TokenType.PBW_URSHIFT_EQUALS,
            ].map(t => [t, {bp: BindingPower.ASSIGN, processor: this.parseBinaryExpression}] as const),
            
            ... // or
            [TokenType.BW_OR,TokenType.PBW_OR
            ].map(t => [t, {bp: BindingPower.BW_OR, processor: this.parseBinaryExpression}] as const),
            
            ... // xor
            [TokenType.BW_XOR,TokenType.PBW_XOR
            ].map(t => [t, {bp: BindingPower.BW_XOR, processor: this.parseBinaryExpression}] as const),
            
            ... // and
            [TokenType.BW_AND,TokenType.PBW_AND
            ].map(t => [t, {bp: BindingPower.BW_AND, processor: this.parseBinaryExpression}] as const),
            
            ... // shift
            [TokenType.BW_LSHIFT, TokenType.BW_RSHIFT, TokenType.BW_URSHIFT,
             TokenType.PBW_LSHIFT,TokenType.PBW_RSHIFT,TokenType.PBW_URSHIFT
            ].map(t => [t, {bp: BindingPower.BW_SHIFT, processor: this.parseBinaryExpression}] as const),

        ]);
        this.tokenStatementProcessors = new Map<TokenType, () => Statement | null>([
            [TokenType.LAGSLAYER_CANCEL,    this.parseEventStatement],
            [TokenType.PLAYER_EVENT,        this.parseEventStatement],
            [TokenType.ENTITY_EVENT,        this.parseEventStatement],
            [TokenType.GAME_EVENT,          this.parseEventStatement],
            [TokenType.FUNCTION,            this.parseFunctionStatement],
            [TokenType.PROCESS,             this.parseFunctionStatement],
            [TokenType.DECLARE,             this.parseDeclareStatement],

            [TokenType.FOR,                 this.parseForStatement],
            [TokenType.REPEAT,              this.parseRepeatStatement],
            [TokenType.IF,                  this.parseIfStatement],
            [TokenType.WHILE,               this.parseWhileStatement],
            [TokenType.DO,                  this.parseDoWhileStatement],

            [TokenType.PERSELECTED,         this.parsePerSelectedStatement],
            
            [TokenType.RETURN,              this.parseReturnStatement],
            [TokenType.BREAK,               this.parseSingleKeywordStatement],
            [TokenType.CONTINUE,            this.parseSingleKeywordStatement],
        ]);
    }


    reportError(node: ASTNode, message: string, positionMode: ErrorPositionMode = ErrorPositionMode.FULL_NODE) {
        this.errors.push(new TCNodeError(
            node,
            ErrorType.PARSER,
            message,
            positionMode
        ));
    }

    /** Reports an error that should not be displayed to the user since
     *  a later compilation sstep will provide a more detailed breakdown */
    reportUndisplayedError(node: ASTNode, message: string) {
        let e = new TCNodeError(
            node,
            ErrorType.PARSER,
            message
        );
        e.shouldDisplay = false;
        this.errors.push(e);
    }

    /**
     * @param identCastKeywords If this is true and TokenType.IDENTIFIER is accepted,
     * keyword tokens will be converted to identifier tokens instead of rejected
     */
    expect(type: TokenType | TokenType[], advance: boolean = true, identCastKeywords: boolean = false): [Token, boolean] {
        this.consumeComments();
        let currentToken = this.currentToken();

        // identifier casting
        if (
            identCastKeywords 
            && currentToken.isKeyword()
            //TODO: let keywords specified in type pass through?
            && (type == TokenType.IDENTIFIER || (Array.isArray(type) && type.includes(TokenType.IDENTIFIER)) ) 
        ) {
            currentToken.convertToIdentifier()
        }
            
        if (
            Array.isArray(type) ? (type.includes(currentToken.type)) : (currentToken.type == type)
        ) {
            if (advance) this.consume();
            return [currentToken, true];
        } else {
            // special error positioning for missing semicolon
            if (type == TokenType.SEMICOLON) {
                this.reportError(
                    this.tokens[this.position-1],
                    `Statement ended unexpectedly. Missing semicolon?`,
                    ErrorPositionMode.AFTER_NODE
                );
            } else {
                this.reportError(
                    currentToken,
                    `expected ${Array.isArray(type) ? ("one of "+type.map(t => TokenType[t]).join(", ")) : TokenType[type]} got ${currentToken}`,
                );
            }
            return [currentToken, false];
        }
    }
    expectOrMissing(type: TokenType | TokenType[], identCastKeywords: boolean = false): [Token, boolean] {
        let result = this.expect(type, true, identCastKeywords);
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
    /** returns the token at index `position + tokenCount` */
    lookAhead = (tokenCount: number = 1): Token => {
        return this.tokens[this.position + tokenCount]
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

        this.consume();


        // error handling for a non-atomic token
        if (
            type != TokenType.NUMERIC_LITERAL
            && type != TokenType.NUMEXPR_LITERAL
            && type != TokenType.STRING_LITERAL
            && type != TokenType.STYLED_LITERAL
            && type != TokenType.IDENTIFIER
        ) {
            this.reportUndisplayedError(
                token,
                `Expected atomic expression, got ${token}`
            );
            return new MissingExpression(token.startPos);
        }

        return new AtomicExpression(token);
    }

    parseVariableExpression = (): VariableExpression => {
        let scope = this.consume();
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL], true);
        let type = this.parseTypeAssignmentExpression(true);
        return new VariableExpression(scope, name, type);
    }

    parseTypeExpression = (): TypeExpression | null  => {
        let [typeToken, typeTokenFound] = this.expect([TokenType.IDENTIFIER, TokenType.OPEN_BRACKET, TokenType.OPEN_CURLY], false);
        if (!typeTokenFound) return null;


        let type: Token | ListExpression<TypeExpression> | DictionaryTypeExpression;
        let subType: ListExpression<TypeExpression> | null = null;
        let ellipses: Token | null = null;
        // normal type
        if (typeToken.type == TokenType.IDENTIFIER) {
            type = this.consume()

            // subtype parsing
            if (typeTokenFound && this.currentToken().type == TokenType.OPEN_BRACKET) {
                subType = this.parseTypedListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA, this.parseTypeExpression);
            }
        } 
        // list literal type
        else if (typeToken.type == TokenType.OPEN_BRACKET) {
            type = this.parseTypedListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA, this.parseTypeExpression)!;
        }
        // dict literal type
        else {
            type = this.parseDictionaryTypeExpression();
        }

        if (this.currentToken().type == TokenType.ELLIPSES) {
            ellipses = this.consume();
        }

        return new TypeExpression(type, subType, ellipses)
    }

    parseTypeAssignmentExpression = (optional: boolean = false): TypeAssignmentExpression | null => {
        if (optional && this.currentToken().type != TokenType.COLON)
            return null;
        let [colon, colonFound] = this.expect(TokenType.COLON);
        let type = this.parseTypeExpression() ?? new TypeExpression(Token.missing(this.currentToken().startPos), null);
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
            types.push(this.parseTypeExpression() ?? new TypeExpression(Token.missing(this.currentToken().startPos), null));
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

    parseTypecastExpression = (left: Expression, bp: number): TypecastExpression => {
        return new TypecastExpression(
            left,
            this.consume(),
            this.parseTypeExpression() ?? new TypeExpression(Token.missing(this.currentToken().startPos), null)
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
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL], true)
        let args: ListExpression | null = null;
        if (this.currentToken().type == TokenType.OPEN_PAREN) {
            args = this.parseListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA);
        }
        return new CallOrStartExpression(keyword, name, args);
    }

    parseBracketedAccessExpression = (left: Expression, bp: number): BracketedAccessExpression => {        
        let opener = this.consume();
        let propertyName = this.parseExpression(BindingPower.DEFAULT);
        let [closer, closerFound] = this.expectOrMissing(TokenType.CLOSE_BRACKET);
        
        return new BracketedAccessExpression(
            left,
            opener,
            propertyName,
            closer
        );
    }

    parseAccessExpression = (left: Expression, bp: number): AccessExpression => {
        let accessorToken = this.consume();

        let [propertyName, propertyNameFound] = this.expectOrMissing(TokenType.IDENTIFIER, true);
        
        return new AccessExpression(
            left,
            accessorToken,
            propertyName
        );
    }

    parseUnaryPrefixExpression = (bp: number) => {
        return new UnaryPrefixExpression(
            this.consume(),
            this.parseExpression(bp)
        );
    }

    parseGroupExpression = (bp: number): GroupExpression => {
        let [opener, openerFound] = this.expectOrMissing(TokenType.OPEN_PAREN);
        let expr = this.parseExpression(BindingPower.DEFAULT);
        let [closer, closerFound] = this.expectOrMissing(TokenType.CLOSE_PAREN);
        return new GroupExpression(
            opener,
            expr,
            closer,
        );
    }

    /**
     * @param openerType if null, no opener will be expected
     */
    parseListExpression = (openerType: TokenType | null, closerType: TokenType | TokenType[], delimiter: TokenType, exitIfNoDelimiter: boolean = false): ListExpression => {
        let opener: Token | null = null;
        if (openerType) {
            let [o, _] = this.expect(openerType);
            opener = o;
        }

        let elements: Expression[] = [];
        let elementStartPositions: number[] = [opener?.endPos ?? this.currentToken().startPos];
        while (
            this.currentToken().type != closerType 
            && !this.isLineDelimiter(this.currentToken())
        ) {
            let comments = this.consumeComments();
            let expr: Expression = this.parseExpression(BindingPower.DEFAULT, true);
            expr.attachedComments.push(...comments);
            elements.push(expr);
            if (this.currentToken().type != closerType) {
                if (exitIfNoDelimiter && this.currentToken().type != delimiter) {
                    break;
                }
                let [delimiterToken, delimiterFound] = this.expect(delimiter);
                elementStartPositions.push(delimiterToken.endPos);
            }
        }
        let [closer, closerFound] = this.expectOrMissing(closerType);
        return new ListExpression(opener, elements, closer, elementStartPositions);
    }
    
    parseTypedListExpression = <T extends Expression>(
        openerType: TokenType, 
        closerType: TokenType, 
        delimiter: TokenType, 
        parser: (...args: any[]) => T | null, 
        optional: boolean = false
    ): ListExpression<T> | null => {
        if (optional && this.currentToken().type != openerType) return null;
        let [opener, openerFound] = this.expect(openerType);
        if (!openerFound) return null;

        let elements: T[] = [];
        let elementStartPositions: number[] = [opener.endPos];
        while (
            this.currentToken().type != closerType 
            && !this.isLineDelimiter()
        ) {
            let comments = this.consumeComments();
            let expr = parser();
            if (expr == null) {
                this.consume();
            } else {
                expr.attachedComments.push(...comments);
                elements.push(expr);
            }
            if (this.currentToken().type != closerType) {
                let [delimiterToken, delimiterFound] = this.expect(delimiter);
                elementStartPositions.push(delimiterToken.endPos);
            }
        }
        let [closer, closerFound] = this.expect(closerType);
        return new ListExpression<T>(opener, elements, closer, elementStartPositions);
    }

    parseParameterExpression = (): ParameterExpression | null => {
        let ellipses: Token | null = null;
        if (this.currentToken().type == TokenType.ELLIPSES) {
            ellipses = this.consume();
        }

        let [name, nameFound] = this.expect([TokenType.IDENTIFIER, TokenType.STRING_LITERAL], true, true);
        if (!nameFound) return null;

        let optionalMarker: Token | null = null;
        if (this.currentToken().type == TokenType.QUESTION) {
            optionalMarker = this.consume();
        }

        let type = this.parseTypeAssignmentExpression(true);
        let equals: Token | null = null;
        let defaultValue: Expression | null = null;
        if (this.currentToken().type == TokenType.EQUALS) {
            equals = this.consume();
            defaultValue = this.parseExpression(BindingPower.DEFAULT);
        }
        return new ParameterExpression(name, ellipses, optionalMarker, type, equals, defaultValue);
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
            [key, keyFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL, TokenType.OPEN_PAREN], true);
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
        let [closer, closerFound] = this.expectOrMissing(TokenType.CLOSE_CURLY);
        return new DictionaryExpression(opener, entries, closer);
    }
    
    parseDictionaryTypeExpression = (): DictionaryTypeExpression => {
        let [opener, openerFound] = this.expect(TokenType.OPEN_CURLY);
        let entries: DictionaryTypeEntryExpression[] = [];
        let overflowTypes: TypeExpression[] = [];
        while (
            this.currentToken().type != TokenType.CLOSE_CURLY
            && !this.isLineDelimiter(this.currentToken())
        ) {
            let comments = this.consumeComments();

            // normal types
            if (this.lookAhead(1).type == TokenType.COLON) {
                let [key, keyFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL], true);            
                let [colon, colonFound] = this.expectOrMissing(TokenType.COLON);
                let type = this.parseTypeExpression();
                if (type != null) {
                    let expr = new DictionaryTypeEntryExpression(key, colon, type);
                    expr.attachedComments.push(...comments);
                    entries.push(expr);
                } else {
                    this.consume();
                }
            } 
            else if (this.currentToken().type == TokenType.COLON) {
                this.consume();
                continue;
            }
            // overflow type
            else {
                let typeExpression = this.parseTypeExpression()
                if (typeExpression != null) {
                    overflowTypes.push(typeExpression);
                } else {
                    this.consume();
                }
            }

            if (this.currentToken().type != TokenType.CLOSE_CURLY) {
                this.expect(TokenType.COMMA);
            }
        }
        let [closer, closerFound] = this.expectOrMissing(TokenType.CLOSE_CURLY);
        return new DictionaryTypeExpression(opener, entries, overflowTypes, closer);
    }

    parsePerSelectedExpression = (): PerSelectedExpression => {
        let keyword = this.consume();
        let groupExpression = this.parseGroupExpression(BindingPower.DEFAULT);
        return new PerSelectedExpression(keyword, groupExpression);
    }

    parseSelectionExpression = (): SelectionExpression => {
        let keyword = this.consume();

        let nameInverterToken: Token | null = null;
        if (this.currentToken().type == TokenType.BANG) {
            nameInverterToken = this.consume();
        }

        let [name, nameFound] = this.expectOrMissing(TokenType.IDENTIFIER, true);

        let inverterToken: Token | null = null;
        if (this.currentToken().type == TokenType.BANG) {
            inverterToken = this.consume();
        }

        return new SelectionExpression(keyword, nameInverterToken, name, inverterToken);
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
            let statement: Statement | null = null;
            if (useSpecialStatement) {
                statement = this.tokenStatementProcessors.get(currentTokenType)!()
            }
            // if the special processor failed out, fall back to parsing an expression
            if (statement == null) {
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
                if (statement instanceof DeclareStatement) {
                    statement.subStatement.attachedComments.push(...comments);
                } else {
                    statement.attachedComments.push(...comments);
                }
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
                this.currentToken(),
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
            left = nudProps.processor(nudProps.bp); // advances position
        }

        let ledProps = this.currentTokenLEDProps();

        while (ledProps != null && ledProps.bp > bp) {
            left = ledProps.processor(left, ledProps.bp);
            ledProps = this.currentTokenLEDProps();
        }

        return left;
    }

    parseDeclareStatement = (): DeclareStatement => {
        let keyword = this.consume();
        let subStatement = this.parseExpressionStatement();
        this.expect(TokenType.SEMICOLON);
        return new DeclareStatement(keyword, subStatement);
    }

    parseExpressionStatement = (): ExpressionStatement | AssignmentStatement | IncrementStatement => {
        let allExpressions: Expression[] = [];
        let separators: Token[] = [];

        while (true) {
            let expression = this.parseExpression(BindingPower.DEFAULT);
            if (
                allExpressions.length == 0
                && (this.currentToken().type == TokenType.PLUS_PLUS || this.currentToken().type == TokenType.MINUS_MINUS)
            ) {
                let operator = this.consume();
                return new IncrementStatement(expression, operator);
            }
            // handle assignment operator
            if (expression instanceof BinaryExpression && ASSIGNMENT_OPERATORS.includes(expression.operator.type)) {
                allExpressions.push(expression.left);
                return new AssignmentStatement(allExpressions, separators, expression.operator, expression.right);
            }
            allExpressions.push(expression);

            if (this.currentToken().type !== TokenType.COMMA) {
                break;
            }

            separators.push(this.consume());
        }

        if (separators.length > 0) {
            this.reportError(this.currentToken(), "Expected assignment operator");
            return new AssignmentStatement(
                allExpressions, separators
            );
        }

        return new ExpressionStatement(allExpressions[0] ?? new MissingExpression(this.currentToken().startPos));
    }

    parseEventStatement = (): EventStatement | null => {
        let modifiers: Token[] = [];
        if (this.currentToken().type == TokenType.LAGSLAYER_CANCEL) {
            modifiers.push(this.consume());
        }

        let [mainKeyword, mainKeywordFound] = this.expectOrMissing([TokenType.PLAYER_EVENT, TokenType.ENTITY_EVENT, TokenType.GAME_EVENT]);
        if (!mainKeywordFound) return null;
        
        let [eventName, eventNameFound] = this.expectOrMissing(TokenType.IDENTIFIER, true)

        let [_, openCurlyFound] = this.expect(TokenType.OPEN_CURLY, false);
        let chunk = openCurlyFound ? this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY)! : new MissingExpression(this.currentToken().startPos);

        return new EventStatement(modifiers, mainKeyword, eventName, chunk);
    }

    parseFunctionStatement = (): FunctionStatement | null => {
        let keyword = this.consume();
        
        let [name, nameFound] = this.expectOrMissing([TokenType.IDENTIFIER, TokenType.STRING_LITERAL], true);

        let params = this.parseTypedListExpression(TokenType.OPEN_PAREN, TokenType.CLOSE_PAREN, TokenType.COMMA, this.parseParameterExpression, true);

        let returnType = this.parseMultiTypeAssignmentExpression(true);

        let [_, openCurlyFound] = this.expect(TokenType.OPEN_CURLY, false);
        let chunk = openCurlyFound ? this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY)! : new MissingExpression(this.currentToken().startPos);

        return new FunctionStatement(keyword, name, params, returnType, chunk);
    }

    parseForStatement = (): ForStatement | null => {
        let keyword = this.consume();

        let [openParen, openParenFound] = this.expect(TokenType.OPEN_PAREN);
        if (!openParenFound) return null;

        let variableList = this.parseListExpression(null, TokenType.OF, TokenType.COMMA, true);

        let iteratorExpression: Expression | null = null;
        if (variableList.closer.type == TokenType.OF)
            iteratorExpression = this.parseExpression(BindingPower.DEFAULT);

        let [closeParen, closeParenFound] = this.expectOrMissing(TokenType.CLOSE_PAREN);

        let chunk: ChunkExpression | null = null;
        if (closeParenFound)
            chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);

        return new ForStatement(keyword, openParen, variableList, iteratorExpression, closeParen, chunk);
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
        
        return new RepeatStatement(keyword, countExpression, chunk);
    }

    parseIfStatement = (): IfStatement | null => {
        let keyword = this.consume();

        let inverterToken: Token | null = null;
        if (this.currentToken().type == TokenType.BANG) {
            inverterToken = this.consume();
        }

        let condition = this.parseGroupExpression(BindingPower.DEFAULT);

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);

        let elseKeyword: Token | null = null;
        let elseContents: IfStatement | ChunkExpression | null = null;

        if (this.currentToken().type == TokenType.ELSE) {
            elseKeyword = this.consume();
            if (this.currentToken().type == TokenType.IF) {
                elseContents = this.parseIfStatement();
            } else {
                elseContents = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
            }
        }

        return new IfStatement(keyword, inverterToken, condition, chunk, elseKeyword, elseContents);
    }

    parseWhileStatement = (): WhileStatement | null => {
        let keyword = this.consume();

        let inverterToken: Token | null = null;
        if (this.currentToken().type == TokenType.BANG) {
            inverterToken = this.consume();
        }

        let condition = this.parseGroupExpression(BindingPower.DEFAULT);

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);

        return new WhileStatement(keyword, inverterToken, condition, chunk);
    }

    parseDoWhileStatement = (): DoStatement | null => {
        let doKeyword = this.consume();

        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (chunk == null) return null;

        let whileKeyword: Token | null = null;
        let whileInverterToken: Token | null = null;
        let whileCondition: Expression | null = null;

        if (this.currentToken().type == TokenType.WHILE) {
            whileKeyword = this.consume();
            if (this.currentToken().type == TokenType.BANG) {
                whileInverterToken = this.consume();
            }
            whileCondition = this.parseGroupExpression(BindingPower.DEFAULT);
        }

        return new DoStatement(doKeyword, chunk, whileKeyword, whileInverterToken, whileCondition);
    }

    parsePerSelectedStatement = (): PerSelectedStatement | null => {
        // the expression handler will consume the keyword if this doesn't
        if (this.lookAhead(1).type != TokenType.OPEN_CURLY) return null;

        let keyword = this.consume();
        let chunk = this.parseChunkExpression(TokenType.OPEN_CURLY, TokenType.CLOSE_CURLY);
        if (!chunk) return null;

        return new PerSelectedStatement(keyword, chunk);
    }

    parseSingleKeywordStatement = (): SingleKeywordStatement => {
        let keyword = this.consume();
        this.expect(TokenType.SEMICOLON);
        return new SingleKeywordStatement(keyword);
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

    parse(): RootNode {
        this.statements.length = 0;
        this.errors.length = 0;
        this.position = 0;

        let chunk = this.parseChunkExpression(TokenType.MISSING, TokenType.EOF) as ChunkExpression;

        // assign 'parent' field of all nodes
        let processChildren = (n: ASTNode) => {
            for (const [k, v] of Object.entries(n)) {
                if (k == 'parent' || k == 'children') continue;
                for (const c of Array.isArray(v) ? v : [v]) {
                    if (c instanceof ASTNode) {
                        if (c.parent != null) {
                            console.log("------");
                            console.log("child: ")
                            dirWithoutRelations(c);
                            console.log("old parent: ");
                            dirWithoutRelations(c.parent);
                            console.log("new parent: ");
                            dirWithoutRelations(n);
                            throw `->> Node owned by multiple parents??`;
                        } else {
                            c.parent = n;
                            c.keyInParent = k;
                            n.children.push(c);
                            processChildren(c);
                        }
                    }
                }
            }
            n.children.sort((a, b) => a.startPos - b.startPos);
        }

        let statements = [];
        let unusedTokens: Token[] = [];
        let root = new RootNode(statements, unusedTokens)

        for (const statement of chunk.statements) {
            processChildren(statement);
            statement.parent = root;
            root.children.push(statement);
            root.statements.push(statement);
        }

        // put all unused tokens in the root node
        for (const token of this.tokens) {
            if (token.parent == undefined) {
                token.parent = root;
                root.unusedTokens.push(token);
            }
        }

        return root;
    }
}