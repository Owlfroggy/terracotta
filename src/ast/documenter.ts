import { Token, TokenType } from "./token.ts";

export interface CommentHolder {
    attachedComments: Token[];
}

/** 
 * Converts attached comments into a documentation string
 * Will return `undefined` if there are no comments that can be turned into documentation
 */
export function commentsToDocumentation(comments: Token[]): string | undefined {
    let out = "";
    for (const c of comments) {
        if (!(c.type == TokenType.MULTILINE_COMMENT)) continue;
        if (!(c.value.startsWith("*"))) continue;
        if (out !== "") out += "\n";
        let formatted = c.value.split("\n").map(
            s => {
                let trimmed = s.trim();
                return trimmed.startsWith("*") ? trimmed.substring(1) : trimmed
            }
        ).join("\n");
        if (formatted.startsWith("\n")) formatted = formatted.substring(1);
        if (formatted.endsWith("\n")) formatted = formatted.substring(0,formatted.length-1);
        out += formatted;
    }
    if (out === "") return undefined;
    return out;
}