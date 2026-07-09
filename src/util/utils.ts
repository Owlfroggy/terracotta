import { pathToFileURL } from "node:url";
import { FoldingRangeRefreshRequest, LSPErrorCodes, URI} from "vscode-languageserver";
import { Type } from "../typeProcessor/type.ts";
import { ParameterSignature, ParameterSignatureEntry } from "../compiler/namespace/definition.ts";
import { AccessExpression, AtomicExpression, BinaryExpression, CallExpression, Expression } from "../ast/expression.ts";
import { TokenType } from "../ast/token.ts";
import { CodeValue, MissingValue, NumberValue, TangibleValue, VariableValue } from "../compiler/codeValue.ts";
import { EvaluationContext } from "../compiler/codeCompiler.ts";
import { ASTNode } from "../ast/astNode.ts";
import { argv } from "node:process";
import { ActionBlock, BracketBlock, BracketDirection, BracketType, CodeBlock } from "../compiler/codeBlock.ts";
import { DFCodeblockName } from "../df/constants.ts";
import { PCode, SegmentPCode } from "../pcode/pcode.ts";
import { TypeProcessor } from "../typeProcessor/typeProcessor.ts";
import * as AD from "../df/actiondump.ts";
import { DF_PAR_FIELD_TO_TC } from "../data/constants.ts";
import { binaryIsNamedArgument } from "./astUtils.ts";
import { URI as URIUtil } from "vscode-uri";

export function getOrCreateMapLayer<K, V>(map: Map<K, V>, key: K, defaultValue: V): V {
    if (!map.has(key)) {
        map.set(key, defaultValue);
        return defaultValue;
    }
    return map.get(key)!;
}

export function getOrCreateDictLayer<V>(dict: {[key: string]: V}, key: string, defaultValue: V): V {
    if (!Object.hasOwn(dict, key)) {
        dict[key] = defaultValue;
        return defaultValue;
    }
    return dict[key];
}

export function deColorizeString(input: string): string {
    return input.replaceAll(/§./g,"");
}

export function codeifyName(name: string): string {
    name = deColorizeString(name);

    //convert characters following spaces to uppercase
    for (let i = 0; i < name.length; i++) {
        if (name[i] == " " && name[i+1]) {
            name = name.substring(0, i+1) + name[i+1].toUpperCase() + name.substring(i+2);
        }
    }
    //remove spaces
    name = name.replace(/ /g,"");

    // make first letter loweracase
    name = name.substring(0,1).toLowerCase() + name.substring(1);

    return name;
}

export function upperFirst(s: string): string {
    return s.substring(0,1).toUpperCase() + s.substring(1);
}

export function toNameCase(s: string): string {
    return s.substring(0,1).toUpperCase() + s.substring(1).toLowerCase();
}

export function pathToUri(path: string): URI { 
    return URIUtil.file(path).toString();
}


/** wraps value in quotes and takes care of necessary escape sequences */
export function valueToTCString(value: string, quoteChar: string = '"'): string {
    return quoteChar + value.replace('\\','\\\\').replace(quoteChar, '\\'+quoteChar).replace('\n','\\n') + quoteChar;
}

/** 
 * turns a stringified tc number into an actual number 
 * 
 * will return NaN for invalid numbers
 * */
export function tcParseNumber(val: string): number {
    if (val.startsWith("0x") || val.startsWith("0X")) {
        return parseInt(val.substring(2), 16);
    } else if (val.startsWith("0b") || val.startsWith("0B")) {
        return parseInt(val.substring(2), 2);
    }
    return parseFloat(val);
}

/** 
 * stands for 'plural s' (i think)
 * @returns '' if count == 1, else returns 's' 
 * */
export function ps(count: number, inverse: boolean = false): 's' | '' {
    if (inverse) return count == 1 ? 's' : '';
    return count == 1 ? '' : 's';
}

export function expressionizeIfBlock(ifCode: CodeBlock[], ctx: EvaluationContext): [VariableValue, CodeBlock[]] {
    let tempVar = ctx.tvp.newTempVar(Type.num);
    ifCode = [
        // initialize temp var
        new ActionBlock(DFCodeblockName.SET_VARIABLE,{
            action: "=",
            args: [tempVar, new NumberValue("0")]
        }),
        // evaluate argument expressions, if block will be at the very end
        ...ifCode,
        new BracketBlock({direction: BracketDirection.OPEN, type: BracketType.IF}),
            // set temp var to 1 if condition is true
            new ActionBlock(DFCodeblockName.SET_VARIABLE,{
                action: "=",
                args: [tempVar, new NumberValue("1")]
            }),
        new BracketBlock({direction: BracketDirection.CLOSE, type: BracketType.IF}),
    ]
    return [tempVar, ifCode];
}

/**
 * Top 10 function names!!
 * 
 * @param value if a string is passed in, converts it to an array
 * with a segment pcode representing that string's value.
 * if a PCode[] expression is passed in, returns it.
 */
export function ensurePCodeness(value: string | PCode[]): PCode[] {
    if (typeof value == "string") {
        return [new SegmentPCode(value)];
    } else {
        return value;
    }
}

export function allAreCompTimeConstant(args: CodeValue[]) {
    for (const arg of args) {
        if (!arg.isCompileTimeConstant()) {
            return false;
        }
    }
    return true;
}

/**
 * Intended for use in return type getters
 * 
 * Tags will only have an entry in the dict if they are set to a constant value.
 */
export function getTagsAndArgTypes(args: Expression[], types: TypeProcessor, methodCallOf?: Expression | Type): [argTypes: Type[], tagConstants: {[name: string]: string}] {
    let argTypes: Type[] = [];
    let tagConstants: {[name: string]: string} = {};

    if (methodCallOf) argTypes.push(
        methodCallOf instanceof Type
        ? methodCallOf
        : types.evaluateExpression(methodCallOf, types.getNodeFrame(methodCallOf))
    );

    for (const arg of args) {
        if (
            arg instanceof BinaryExpression 
            && arg.operator.type == TokenType.EQUALS
            && arg.left instanceof AtomicExpression
            && arg.left.token.type == TokenType.IDENTIFIER
            && arg.right instanceof AtomicExpression
            && arg.right.token.type == TokenType.STRING_LITERAL
        ) {
            tagConstants[arg.left.token.value] = arg.right.token.value;
        } else {
            argTypes.push(types.evaluateExpression(arg, types.getNodeFrame(arg)));
        }
    }

    return [argTypes, tagConstants];
}

/** Will return a string (error message) if the color is invalid */
export function integerizeHexColor(color: string): number | string {
    if (!color.startsWith("#")) {
        return `Hex color must start with a hashtag.`;
    }
    let string = color.substring(1, color.length)
    if (string.length != 6) {
        return `Invalid hex color: '${color}'`;
    }

    let int = Number("0x" + string)
    if (Number.isNaN(int) || int < 0 || int > 16777215) {
        return `Invalid hex color: '${color}'`;
    }
    
    return int
}


export function parseTcNumber(tcNum: string): number {
    // todo: make this actually good
    return parseFloat(tcNum);
}

/** 
 * Returns the allowed TC particle field names for this particle
 * 
 * Returns all fields if parDef is undefined 
 * */
export function getAllowedParticleFields(parDef: AD.Particle | undefined): string[] {
    const allowedFields = ['amount', 'spreadHoriz', 'spreadVert']; 
    if (parDef) {
        for (const dfField of parDef.fields) {
            let tcField = DF_PAR_FIELD_TO_TC[dfField];
            if (tcField) {
                allowedFields.push(tcField);
            }
        }
    } 
    // allow all fields for unspecified particle
    else {
        allowedFields.push(...Object.values(DF_PAR_FIELD_TO_TC));
    }
    return allowedFields;
}

export function isIdentifier(str: string) {
    return /^[A-Za-z0-9_]+$/.test(str);
}