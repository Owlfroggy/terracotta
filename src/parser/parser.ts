import { BinaryExpression, Expression, NumberExpression } from "../ast/expression.ts";
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
            [TokenType.NUMERIC_LITERAL, {processType: TokenPType.EXPR_NUD,  bp: BindingPower.ATOM, processor: this.parseNumberExpression}],
            [TokenType.PLUS,            {processType: TokenPType.EXPR_LED,  bp: BindingPower.ADD,  processor: this.parseBinaryExpression}],
            // [TokenType.EOF,     {bp: 0  , processType: TokenPType.NONE}]
        ]);
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

    parseNumberExpression = (): NumberExpression => {
        let numToken = this.consume();
        return new NumberExpression(numToken);
    }

    parseBinaryExpression = (left: Expression, bp: number): BinaryExpression => {
        return new BinaryExpression(
            left,
            this.consume(),
            this.parseExpression(BindingPower.DEFAULT)
        );
    }

    parseExpression = (bp: number): Expression => { 
        let props = this.currentTokenPProps();
        if (props.processType != TokenPType.EXPR_NUD) {
            throw "Expected a nud";
        }

        let left = props.processor(bp); // advances position

        props = this.currentTokenPProps();

        while (props.processType != TokenPType.NONE && props.bp > bp) {
            if (props.processType == TokenPType.EXPR_NUD) {
                throw "Expected a nud (two)";
            }
            left = props.processor(left, props.bp);
            props = this.currentTokenPProps();
        }

        return left;
    }
}