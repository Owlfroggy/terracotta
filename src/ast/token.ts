import { ASTNode } from "./astNode.ts";

export enum TokenType {
    LAGSLAYER_CANCEL,
    PLAYER_EVENT,
    GAME_EVENT,
    ENTITY_EVENT,
    FUNCTION,
    PROCESS,
    DECLARE,

    CALL,
    START,

    RETURN,
    BREAK,
    CONTINUE,

    GLOBAL,
    SAVED,
    LOCAL,
    LINE,
    
    FOR,
    REPEAT,
    IF,
    ELSE,
    WHILE,
    DO,

    PERSELECTED,

    AS,

    TO,
    OF,

    SELECT,
    FILTER,

    // everythingn above here is considered a keyword and can be cast to identifiers by parser routines that request that
    /** this is not actually a valid token type, it is used internally to control which types are considered keywords */
    __KEYWORD_RANGE_END__, 

    EOF,
    MISSING,
    EMPTY,
    SEMICOLON,
    WHITESPACE,

    COMMENT,
    MULTILINE_COMMENT,

    IDENTIFIER,
    NUMERIC_LITERAL,
    STRING_LITERAL,
    STYLED_LITERAL,
    NUMEXPR_LITERAL,

    // symbols below here

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
    BOOL_AND,
    BOOL_OR,

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
    BOOL_OR,
    BOOL_AND,
    BW_OR,
    BW_XOR,
    BW_AND,
    EQUALITY,
    RELATION,
    BW_SHIFT,
    ADD,
    MULT,
    EXPO,
    TYPECAST,
    PREFIX,
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
    ) {
        if (type == TokenType.__KEYWORD_RANGE_END__) 
            throw new Error(`Cannot create token of type ${TokenType[type]}`);
        super(startPos, endPos);
    }
    
    toString() {
        return `{${TokenType[this.type]} '${this.value}' [${this.startPos}-${this.endPos}]}`
    }

    getStringExtraData(): StringExtraData {
        if (this.type != TokenType.STRING_LITERAL && this.type != TokenType.STYLED_LITERAL) {
            throw new Error("Attempted to get string metadata on a token that wasn't a string literal");
        }
        return this.extraData as StringExtraData;
    }

    isKeyword(): boolean {
        return this.type < TokenType.__KEYWORD_RANGE_END__;
    }

    convertToIdentifier() {
        if (!this.isKeyword()) {
            throw new Error(`Cannot convert token of type '${this.type}' to an identifier, only keywords can be converted`);
        }
        // me when i summon ancient runes to break readonly's spell of protection
        (this as Token & {type: TokenType}).type = TokenType.IDENTIFIER;
    }
    
    static missing(pos: number): Token {
        return new Token(pos, pos, TokenType.MISSING, "⊘");
    }

    static empty(pos: number): Token {
        return new Token(pos, pos, TokenType.EMPTY, "");
    }
}