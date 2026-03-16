import { BinaryExpression, Expression, AtomicExpression, GroupExpression, MissingExpression } from "../ast/expression.ts";
import { ExpressionStatement, Statement } from "../ast/statement.ts";
import { Token, TokenType, BindingPower, TokenProcessingProperites, TokenPType } from "../ast/token.ts";
import { ErrorType, TCError } from "../error/error.ts";

export class Parser {
    statements: Statement[] = [];
    errors: TCError[] = [];
    tokenProperties: Map<TokenType, TokenProcessingProperites>;
    position: number = 0;

    constructor(
        public tokens: Token[]
    ) {
        this.tokenProperties = new Map<TokenType, TokenProcessingProperites>([
            [TokenType.IDENTIFIER,      {processType: TokenPType.EXPR_NUD,  bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {processType: TokenPType.EXPR_NUD,  bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {processType: TokenPType.EXPR_NUD,  bp: BindingPower.GROUP, processor: this.parseGroupExpression}],
            [TokenType.PLUS,            {processType: TokenPType.EXPR_LED,  bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {processType: TokenPType.EXPR_LED,  bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {processType: TokenPType.EXPR_LED,  bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {processType: TokenPType.EXPR_LED,  bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
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
        } else {
            this.reportError(
                currentToken.startPos, currentToken.endPos,
                `expected ${TokenType[type]} got ${currentToken}`
            );
        }
        return currentToken;
    }

    // NOTE: these methods have to take arrow form (=>) or else everything breaks horrendously. you have been warned...

    /** returns the token at index `position` */
    currentToken = (): Token => {
        return this.tokens[this.position];
    }

    /** returns the processing properties of the token at index `position` */
    currentTokenPProps = (): TokenProcessingProperites => {
        return this.tokenProperties.get(this.currentToken().type) ?? {processType: TokenPType.NONE};
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

    parseExpression = (bp: number): Expression => { 
        let props = this.currentTokenPProps();

        if (props.processType != TokenPType.EXPR_NUD) {
            this.reportUndisplayedError(
                this.currentToken().startPos, this.currentToken().endPos,
                `Expected a value here, got ${this.currentToken()}`
            );
            return new MissingExpression(this.currentToken().startPos);
        }

        let left = props.processor(bp); // advances position

        props = this.currentTokenPProps();

        while (props.processType == TokenPType.EXPR_LED && props.bp > bp) {
            left = props.processor(left, props.bp);
            props = this.currentTokenPProps();
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
            this.statements.push(statement);
            this.expect(TokenType.SEMICOLON);
        }
    }
}