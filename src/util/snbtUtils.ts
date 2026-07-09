import * as NBT from "nbtify";

export function isSNBTValid(snbt: string): true | string {
    try {
        NBT.parse(snbt);
    } catch (e) {
        if (e instanceof Error) {
            return e.message;
        } else {
            return ""+e;
        }
    }
    return true;
}