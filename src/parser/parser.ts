import { BinaryExpression, Expression, AtomicExpression } from "../ast/expression.ts";
import { Statement } from "../ast/statement.ts";
import { Token, TokenType } from "../lexer/token.ts";
import { BindingPower, TokenProcessingProperites, TokenPType } from "./tokenProperties.ts";

export class Parser {
    statements: Statement[];
    tokenProperties: Map<TokenType, TokenProcessingProperites>;
    position: number = 0;

    constructor(
        public tokens: Token[]
    ) {
        this.tokenProperties = new Map<TokenType, TokenProcessingProperites>([
            [TokenType.IDENTIFIER,      {processType: TokenPType.EXPR_NUD,  bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.NUMERIC_LITERAL, {processType: TokenPType.EXPR_NUD,  bp: BindingPower.ATOM,  processor: this.parseAtomicExpression}],
            [TokenType.OPEN_PAREN,      {processType: TokenPType.EXPR_NUD,  bp: BindingPower.GROUP, processor: this.parseGroupExprssion}],
            [TokenType.PLUS,            {processType: TokenPType.EXPR_LED,  bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.MINUS,           {processType: TokenPType.EXPR_LED,  bp: BindingPower.ADD,   processor: this.parseBinaryExpression}],
            [TokenType.STAR,            {processType: TokenPType.EXPR_LED,  bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            [TokenType.SLASH,           {processType: TokenPType.EXPR_LED,  bp: BindingPower.MULT,  processor: this.parseBinaryExpression}],
            // [TokenType.EOF,     {bp: 0  , processType: TokenPType.NONE}]
        ]);
    }

    // NOTE: these methods have to take arrow form (=>) or else everything breaks horrendously. you have been warned...

    expect(type: TokenType) {
        let currentToken = this.consume();
        if (currentToken.type != type) {
            throw new Error(`expected ${type} got ${currentToken}`)
        }
    }

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

    parseGroupExprssion = (bp: number): Expression => {
        this.expect(TokenType.OPEN_PAREN);
        let g = this.parseExpression(BindingPower.DEFAULT);
        this.expect(TokenType.CLOSE_PAREN);
        return g;
    }

    parseExpression = (bp: number): Expression => { 
        let props = this.currentTokenPProps();
        if (props.processType != TokenPType.EXPR_NUD) {
            throw `Expected a nud got ${this.currentToken()}`;
        }

        let left = props.processor(bp); // advances position

        props = this.currentTokenPProps();

        while (props.processType != TokenPType.NONE && props.bp > bp) {
            if (props.processType == TokenPType.EXPR_NUD) {
                throw `Expected a nud (two) ${this.currentToken()}`;
            }
            left = props.processor(left, props.bp);
            props = this.currentTokenPProps();
        }

        return left;
    }
}