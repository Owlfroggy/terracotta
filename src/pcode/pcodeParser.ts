import { PCodeError } from "../error/error.ts";
import { PCode, PCodeTarget, SegmentPCode, TargetPCode, VarPCode, RoundPCode, RandomPCode, IndexPCode, EntryPCode, PCodeOperation, OperationPCode, MathPCode } from "./pcode.ts";

const MATH_SEGMENT_REGEX = new RegExp(
    `.+?(?=[${Object.values(PCodeOperation).map(v=>"\\"+v).join("")}]|$)`,'y'
);

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
            [/%entry\(/y, this.parseEntry],
            [/%math\(/y, this.parseMath],
            [new RegExp(`%(${Object.values(PCodeTarget).join("|")})`,'y'), this.parseTarget],
            [/.+?(?=%|$)/y, this.parseSegment],
        ];
    }

    private matchInRange(regex: RegExp, rangeStart: number, rangeEnd: number, matchFrom: number): RegExpMatchArray | null {
        regex.lastIndex = matchFrom-rangeStart;
        let match = regex.exec(this.expr.substring(rangeStart, rangeEnd));
        if (match != null) {
            match.index += rangeStart;
        }
        return match;
    }

    private reportError(startPos: number, endPos: number, message: string) {
        this.errors.push(new PCodeError(
            startPos, endPos,
            message
        ));
    }

    /** Returns this.expr.length if unclosed */
    private getClosingParenIndex(openerIndex: number) {
        let count = 0;
        for (let i = openerIndex; i < this.expr.length; i++) {
            if (this.expr[i] == "(") {count++;}
            else if (this.expr[i] == ")") {count--;}
            
            if (count == 0) return i;
        }
        this.reportError(
            openerIndex, openerIndex+1,
            `Unclosed parentheses`
        );
        return this.expr.length;
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

    private parseEntry = (match: RegExpMatchArray): IndexPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);

        // search for The comma
        let delimiterIndex = -1;
        for (let i = openParenIndex+1; i < closeParenIndex; i++) {
            if (this.expr[i] == ",") {
                delimiterIndex = i;
                break;
            }
        }

        // if there is no delimiter, count the entire thing as the first arg
        if (delimiterIndex == -1) {
            return new EntryPCode(
                [this.parseRange(openParenIndex+1, closeParenIndex)],
                match.index!, closeParenIndex+1
            );
        }
        // otherwise its business as usual
        else {
            return new EntryPCode(
                [
                    this.parseRange(openParenIndex+1, delimiterIndex),
                    this.parseRange(delimiterIndex+1, closeParenIndex),
                ],
                match.index!, closeParenIndex+1
            );
        }
    }
    
    private parseMath = (match: RegExpMatchArray): MathPCode => {
        let openParenIndex = match.index! + match[0].length - 1;
        let closeParenIndex = this.getClosingParenIndex(openParenIndex);

        let codes: PCode[] = [];
        let segmentStart = openParenIndex+1;
        while (segmentStart < closeParenIndex) {
            // try a % code
            let parseResults = this.parseRange(segmentStart, closeParenIndex, 1);
            if (parseResults.length == 1 && !(parseResults[0] instanceof SegmentPCode)) {
                codes.push(parseResults[0]);
                segmentStart = parseResults[0].endPos!;
                continue;
            }

            // if char is an op, add the operator
            let op = PCodeOperation[this.expr[segmentStart]];
            if ( op != undefined ) {
                codes.push(new OperationPCode(op, segmentStart));
                segmentStart++;
                continue;
            }

            // otherwise add everything up to the next op as a segment
            MATH_SEGMENT_REGEX.lastIndex = segmentStart;
            let match = this.matchInRange(MATH_SEGMENT_REGEX, openParenIndex, closeParenIndex, segmentStart);
            let segment = this.parseSegment(match!);
            codes.push(segment);
            segmentStart = segment.endPos!;
        }

        return new MathPCode(
            codes,
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
    private parseRange = (startPos: number, endPos: number, maxCodes: number = -1): PCode[] => {
        let codes: PCode[] = [];
        let i = startPos;
        while (i < endPos && (maxCodes == -1 || codes.length < maxCodes)) {
            for (const [regex, handler] of this.codeParsers) {
                let match = this.matchInRange(regex, startPos, endPos, i);
                if (match != null) {
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