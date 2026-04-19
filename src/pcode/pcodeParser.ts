import { PCodeError } from "../error/error.ts";
import { PCode, PCodeTarget, SegmentPCode, TargetPCode, VarPCode, RoundPCode, RandomPCode, IndexPCode } from "./pcode.ts";

export class PCodeParser {
    private expr: string;
    private errors: PCodeError[] = []

    private codeParsers: [RegExp, (match: RegExpMatchArray) => PCode][]

    constructor() {
        this.codeParsers = [
            [/%var\(/y, this.parseVar],
            [/%round\(/y, this.parseRound],
            [/%random\(/y, this.parseRandom],
            [/%index\(/y, this.parseIndex],
            [new RegExp(`%(${Object.values(PCodeTarget).join("|")})`,'y'), this.parseTarget],
            [/.+?(?=%|$)/y, this.parseSegment],
        ];
    }


    private reportError(startPos: number, endPos: number, message: string) {
        this.errors.push(new PCodeError(
            startPos, endPos,
            message
        ));
    }

    /** Returns -1 if unclosed */
    private getClosingParenIndex(openerIndex: number) {
        let count = 0;
        for (let i = openerIndex; i < this.expr.length; i++) {
            if (this.expr[i] == "(") {count++;}
            else if (this.expr[i] == ")") {count--;}
            
            if (count == 0) return i;
        }
        throw "UNCLOSED PAREN!!!"; // todo: this is temporary
        return -1;
    }

    /**
     * do NOT use this for %entry since %entry is dumb and evil and has its own behavior
     * @param startPos inclusive. make sure to pass in the index AFTER the opening paren
     * @param endPos exclusive
     */
    private parseArgsList(startPos: number, endPos: number): PCode[][] {
        let args: PCode[][] = [];
        let parenCount = 0;

        let argStartPos = startPos;
        for (let i = startPos; i < endPos; i++) {
            if (this.expr[i] == "(") {parenCount++;}
            else if (this.expr[i] == ")") {parenCount--;}
            else if (this.expr[i] == "," && parenCount == 0) {
                args.push(this.parseRange(argStartPos, i));
                argStartPos = i+1;
            }
        }
        args.push(this.parseRange(argStartPos, endPos));

        return args;
    }

    private parseVar = (match: RegExpMatchArray): VarPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);

        return new VarPCode(
            this.parseRange(openParenIndex+1,closeParenIndex),
            match.index!, closeParenIndex+1
        );
    }
    
    private parseRound = (match: RegExpMatchArray): RoundPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);


        return new RoundPCode(
            this.parseRange(openParenIndex+1,closeParenIndex),
            match.index!, closeParenIndex+1
        );
    }

    private parseRandom = (match: RegExpMatchArray): RandomPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);

        return new RandomPCode(
            this.parseArgsList(openParenIndex+1, closeParenIndex),
            match.index!, closeParenIndex+1
        );
    }

    private parseIndex = (match: RegExpMatchArray): IndexPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);

        return new IndexPCode(
            this.parseArgsList(openParenIndex+1, closeParenIndex),
            match.index!, closeParenIndex+1
        );
    }

    private parseTarget = (match: RegExpMatchArray): TargetPCode => {
        return new TargetPCode(PCodeTarget[match[1]], match.index!, match.index! + match[0].length);
    }

    private parseSegment = (match: RegExpMatchArray): SegmentPCode => {
        return new SegmentPCode(match[0], match.index!, match.index! + match[0].length);
    }

    /**
     * @param startPos inclusive
     * @param endPos exclusive
     */
    private parseRange = (startPos: number, endPos: number): PCode[] => {
        let codes: PCode[] = [];
        let i = startPos;
        while (i < endPos) {
            for (const [regex, handler] of this.codeParsers) {
                regex.lastIndex = i-startPos;
                let match = regex.exec(this.expr.substring(startPos, endPos));
                if (match != null) {
                    match.index += startPos;
                    let pcode = handler(match);

                    // if this is a segment and the last thing was also a segment,
                    // just join the two segments
                    let lastCode = codes[codes.length-1];
                    if (pcode instanceof SegmentPCode && lastCode instanceof SegmentPCode) {
                        lastCode.contents += pcode.contents;
                        lastCode.endPos = pcode.endPos;
                    }
                    // otherwise push this as its own code
                    else {
                        codes.push(pcode);
                    }

                    i = pcode.endPos!;
                    break;
                }
            }
        }
        return codes;
    }

    parse(expr: string): [PCodeError[], PCode[]] {
        this.expr = expr;
        return [this.errors, this.parseRange(0, expr.length)]
    }
}

let parsed = new PCodeParser().parse(
    "%random(%index(%uuid stats, 3), %var(%uuid gamblingPower))"
);
console.dir(parsed, {depth: null})
console.log(parsed[1].join(""))