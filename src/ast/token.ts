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
    
    FOR,
    REPEAT,
    IF,
    WHILE,

    TO,
    IN,
    ON,

    SELECT,
    FILTER,

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
    BANG_EQUALS,
    LESS_EQUALS,
    LESS,
    GREATER_EQUALS,
    GREATER,

    EQUALS,
    PLUS_EQUALS,
    MINUS_EQUALS,
    STAR_EQUALS,
    SLASH_EQUALS,
    PERCENT_EQUALS,
    POW_EQUALS,

    BANG,

    PLUS,
    MINUS,
    STAR,
    SLASH,
    PERCENT,
    POW,

    BW_OR_EQUALS,
    BW_AND_EQUALS,
    BW_NOT_EQUALS,
    BW_XOR_EQUALS,
    BW_LSHIFT_EQUALS,
    BW_RSHIFT_EQUALS,
    BW_URSHIFT_EQUALS,
    PBW_OR_EQUALS,
    PBW_AND_EQUALS,
    PBW_NOT_EQUALS,
    PBW_XOR_EQUALS,
    PBW_LSHIFT_EQUALS,
    PBW_RSHIFT_EQUALS,
    PBW_URSHIFT_EQUALS,

    BW_OR,
    BW_AND,
    BW_NOT,
    BW_XOR,
    BW_LSHIFT,
    BW_RSHIFT,
    BW_URSHIFT,
    PBW_OR,
    PBW_AND,
    PBW_NOT,
    PBW_XOR,
    PBW_LSHIFT,
    PBW_RSHIFT,
    PBW_URSHIFT,
}

export enum BindingPower {
    DEFAULT,
    LOOP_KW,
    ASSIGN,
    BW_OR,
    BW_XOR,
    BW_AND,
    COMPARE,
    BW_SHIFT,
    ADD,
    MULT,
    EXPO,
    CALL,
    ACCESS,
    PREFIX,
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