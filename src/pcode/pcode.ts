export enum PCodeTarget {
    default = "default",
    defaultuuid = "defaultuuid",
    damager = "damager",
    damageruuid = "damageruuid",
    killer = "killer",
    killeruuid = "killeruuid",
    shooter = "shooter",
    shooteruuid = "shooteruuid",
    victim = "victim",
    victimuuid = "victimuuid",
    projectile = "projectile",
    projectileuuid = "projectileuuid",
    uuid = "uuid",
    selected = "selected",
}

/**
 * NOTE: startPos and endPos are relative to the start of the SCRIPT just like other ast nodes
 * they are NOT relative to the start of the string that contains them!!!!
 * 
 * they will also ONLY be accurate for pcodes parsed from strings.
 * modifying pcodes directly with code does not update their start/end positions,
 * you'd have to stringify and reparse to get that
 */
export abstract class PCode {
    constructor(
        public startPos: number, 
        public endPos: number,
    ) {}
}

export class RootPCode extends PCode {
    constructor(
        public elements: PCode[],
    ) { super(0, elements[elements.length-1]?.endPos ?? 0); }

    toString() {
        return this.elements.join("");
    }
}

export class TargetPCode extends PCode {
    constructor(
        public target: PCodeTarget,
        startPos: number, endPos: number,
    ) { super(startPos, endPos); }

    toString() {
        return `%${this.target}`
    }
}

export class SegmentPCode extends PCode {
    constructor(
        public contents: string,
        startPos: number, endPos: number
    ) { super(startPos, endPos); }

    toString() {
        return this.contents;
    }
}

export class VarPCode extends PCode {
    constructor(
        public name: PCode[],
        startPos: number, endPos: number
    ) { super(startPos, endPos); }

    toString() {
        return `%var(${this.name.join("")})`
    }
}

export class RoundPCode extends PCode {
    constructor(
        public value: PCode[],
        startPos: number, endPos: number
    ) { super(startPos, endPos); }

    toString() {
        return `%round(${this.value.join("")})`
    }
}