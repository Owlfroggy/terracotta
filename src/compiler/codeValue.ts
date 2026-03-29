import { ASTNode } from "../ast/astNode.ts";

//=--------------------=\\
//=- abstract classes -=\\
//=--------------------=\\

/**
 * base class which all code values extend from
 */
export class CodeValue {
    astNode?: ASTNode;   
}

/**
 * used for stuff like namespaces and their methods,
 * stuff that needs to be evaluated in expressions but
 * has no item representation in df
 */
export class InternalValue extends CodeValue {}

/**
 * used for actual values like vars, strings, numbers,
 * anything that does have an actual item representation in diamondfire
 */
export class TangibleValue extends CodeValue {}

//=-------------------=\\
//=- internal values -=\\
//=-------------------=\\


//=-------------------=\\
//=- tangible values -=\\
//=-------------------=\\