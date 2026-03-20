import { ASTNode } from "./astNode.ts";

export enum TokenType {
    EOF,
    MISSING,
    SEMICOLON,
    WHITESPACE,

    COMMENT,
    MULTILINE_COMMENT,

    IDENTIFIER,
    NUMERIC_LITERAL,
    STRING_LITERAL,

    LAGSLAYER_CANCEL,
    PLAYER_EVENT,
    GAME_EVENT,
    ENTITY_EVENT,

    GLOBAL,
    SAVED,
    LOCAL,
    LINE,

    REPEAT,

    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,
    OPEN_CURLY,
    CLOSE_CURLY,

    COMMA,
    DOT,

    EQUALS,
    PLUS_EQUALS,
    MINUS_EQUALS,
    STAR_EQUALS,
    SLASH_EQUALS,

    PLUS,
    MINUS,
    STAR,
    SLASH,
}

export enum BindingPower {
    DEFAULT,
    ASSIGN,
    ADD,
    MULT,
    CALL,
    ACCESS,
    GROUP,
    ATOM,
}

export type StringExtraData = {
    quoteChar: string,
    isClosed: boolean,
};

export class Token extends ASTNode {
    constructor(
        startPos: number, endPos: number,
        readonly type: TokenType,
        readonly value: string = "",
        readonly extraData: StringExtraData | null = null,
    ) {super(startPos, endPos);}
    
    toString() {
        return `{${TokenType[this.type]} '${this.value}' [${this.startPos}-${this.endPos}]}`
    }

    getStringExtraData(): StringExtraData {
        if (this.type != TokenType.STRING_LITERAL) {
            throw new Error("Attempted to get string metadata on a token that wasn't a string literal");
        }
        return this.extraData as StringExtraData;
    }
    
    static missing(pos: number): Token {
        return new Token(pos, pos, TokenType.MISSING, "⊘");
    }
}