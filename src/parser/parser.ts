import { BinaryExpression, Expression, AtomicExpression, GroupExpression, MissingExpression, ListExpression } from "../ast/expression.ts";
import { ExpressionStatement, Statement } from "../ast/statement.ts";
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
    position: number = 0;

    constructor(
        public tokens: Token[]
    ) {
        this.tokenNUDProperties = new Map<TokenType, NUDProcessingProperties>([
            [TokenType.IDENTIFIER,      {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {bp: BindingPower.GROUP, processor: this.parseGroupExpression}],
            [TokenType.OPEN_BRACKET,    {bp: BindingPower.ATOM,  processor: () => this.parseListExpression(TokenType.OPEN_BRACKET, TokenType.CLOSE_BRACKET, TokenType.COMMA)}]
        ]);
        this.tokenLEDProperties = new Map<TokenType, LEDProcessingProperties>([
            [TokenType.PLUS,            {bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            // [TokenType.EOF,     {bp: 0  , processType: TokenPType.NONE}]
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

    expect(type: TokenType): Token {
        let currentToken = this.currentToken();
        if (currentToken.type == type) {
            this.consume();
            return currentToken;
        } else {
            this.reportError(
                currentToken.startPos, currentToken.endPos,
                `expected ${TokenType[type]} got ${currentToken}`
            );
            return currentToken;
        }
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
        this.position++;
        return t;
    }

    parseAtomicExpression = (): AtomicExpression => {
        let token = this.consume();
        return new AtomicExpression(token);
    }

    parseBinaryExpression = (left: Expression, bp: number): BinaryExpression => {
        return new BinaryExpression(
            left,
            this.consume(),
            this.parseExpression(bp)
        );
    }

    parseGroupExpression = (bp: number): GroupExpression => {
        let opener = this.expect(TokenType.OPEN_PAREN);
        let expr = this.parseExpression(BindingPower.DEFAULT);
        let closer = this.expect(TokenType.CLOSE_PAREN);
        return new GroupExpression(
            opener,
            expr,
            closer,
        );
    }

    parseListExpression = (openerType: TokenType, closerType: TokenType, delimiter: TokenType): ListExpression => {
        let opener = this.expect(openerType);
        let elements: Expression[] = [];
        while (
            this.currentToken().type != closerType 
        ) {
            // if the current token cannot be processed in any way,
            // break to avoid getting stuck in an infinite loop
            if (!(this.currentTokenLEDProps() || this.currrentTokenNUDProps())) {
                break;
            }
            let expr = this.parseExpression(BindingPower.DEFAULT);
            elements.push(expr);
            if (this.currentToken().type != closerType) {
                this.expect(delimiter);
            }
        }
        let closer = this.expect(closerType);
        return new ListExpression(opener, elements, closer);
    }

    parseExpression = (bp: number): Expression => { 
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

    parseExpressionStatement(): ExpressionStatement {
        let expr = this.parseExpression(BindingPower.DEFAULT);
        return new ExpressionStatement(expr.startPos,expr.endPos,expr);
    }

    parse() {
        this.statements.length = 0;
        this.errors.length = 0;

        while (this.currentToken().type != TokenType.EOF) {
            let statement = this.parseExpressionStatement();
            if (statement instanceof ExpressionStatement && statement.expression instanceof MissingExpression) {
                this.consume();
                continue;
            }
            this.statements.push(statement);
            this.expect(TokenType.SEMICOLON);
        }
    }
}