import { Expression } from "../ast/expression.ts";
import { Parser } from "./parser.ts";

export enum BindingPower {
    DEFAULT,
    ADD,
    ATOM,
}

export enum TokenPType {
    /** left denotation */
    EXPR_LED,
    /** null denotation */
    EXPR_NUD,
    NONE,
}

export type TokenProcessingProperites = (
    {
        /** binding power */
        bp: number,
        processType: TokenPType.EXPR_NUD,
        processor: (bp: number) => Expression;
    } |
    {
        /** binding power */
        bp: number,
        processType: TokenPType.EXPR_LED,
        processor: (left: Expression, bp: number) => Expression;
    } |
    {
        processType: TokenPType.NONE,
    }
)