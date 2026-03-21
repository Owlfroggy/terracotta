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
    STYLED_LITERAL,

    STR,
    NUM,
    VEC,
    LOC,
    POT,
    VAR,
    SND,
    TXT,
    ITEM,
    LIST,
    DICT,
    PAR,
    ANY,

    LAGSLAYER_CANCEL,
    PLAYER_EVENT,
    GAME_EVENT,
    ENTITY_EVENT,
    FUNCTION,
    PROCESS,

    CALL,
    START,

    RETURN,
    BREAK,
    CONTINUE,
    ENDTHREAD,
    ENDALLTHREADS,
    WAIT,

    GLOBAL,
    SAVED,
    LOCAL,
    LINE,
    
    REPEAT,
    IF,

    TO,

    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,
    OPEN_CURLY,
    CLOSE_CURLY,

    COLON,
    COMMA,
    DOT,
    ELLIPSES,
    
    DOUBLE_EQUALS,
    NOT_EQUALS,
    LESS_EQUALS,
    LESS,
    GREATER_EQUALS,
    GREATER,

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
    LOOP_KW,
    ASSIGN,
    COMPARE,
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
        if (this.type != TokenType.STRING_LITERAL && this.type != TokenType.STYLED_LITERAL) {
            throw new Error("Attempted to get string metadata on a token that wasn't a string literal");
        }
        return this.extraData as StringExtraData;
    }
    
    static missing(pos: number): Token {
        return new Token(pos, pos, TokenType.MISSING, "⊘");
    }
}