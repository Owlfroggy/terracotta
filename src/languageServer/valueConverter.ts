import { ParticleExtraData } from "../compiler/codeValue.ts";
import { particles, potions, sounds } from "../df/actiondump.ts";
import { MCNote } from "../util/note.ts";
import { isIdentifier, valueToTCString } from "../util/utils.ts";

export type DFValueData = (
    {
        id: "txt" | "comp" | "num",
        data: {name: string}
    } |
    {
        id: "loc",
        data: {isBlock: boolean, loc: {x: number, y: number, z: number, pitch: number, yaw: number}}
    } |
    {
        id: "vec",
        data: {"x": number, "y":number, "z": number}
    } |
    {
        id: "var",
        data: {name: string, scope: "unsaved" | "saved" | "local" | "line"}
    } | 
    {
        id: "snd",
        data: {sound: string, pitch: number, vol: number, variant?: string} | {key: string, pitch: number, vol: number}
    } |
    {
        id: "part",
        data: {cluster: {amount: number, horizontal: number, vertical: number}, particle: string, data: ParticleExtraData}
    } | 
    {
        id: "pot",
        data: {pot: string, dur: number, amp: number}
    }
)


function convertNumber(n: number, precision: number = 3) {
	return (
        n
		.toFixed(precision)
		.replace(/(?<!^)(?:\.|(?<=[^0]))0+$/,"") //remove trailing decimal places
	);
}
/**
 * Values which are invalid or could not be converted will be returned as null
 */
export function convertDFValue(value: DFValueData): string | null {
    if (value.id == "num") {
        // TODO: handle %math numbers
        return value.data.name;
    } 
    else if (value.id == "txt") {
        return valueToTCString(value.data.name);
    }
    else if (value.id == "comp") {
        return "s"+valueToTCString(value.data.name);
    }
    else if (value.id == "loc") {
        let args: string[] = [];
        if (value.data.isBlock) {
            args = [
                Math.floor(value.data.loc.x).toString(),
                Math.floor(value.data.loc.y).toString(),
                Math.floor(value.data.loc.z).toString(),
            ];
        } else {
            args = [
                convertNumber(value.data.loc.x, 4),
                convertNumber(value.data.loc.y, 4),
                convertNumber(value.data.loc.z, 4),
            ];
            if (value.data.loc.pitch !== 0 || value.data.loc.yaw !== 0) {
                args.push(
                    convertNumber(value.data.loc.pitch, 2),
                    convertNumber(value.data.loc.yaw, 2),
                )
            }
        }
        return `loc(${args.join(", ")})`
    }
    else if (value.id == "vec") {
        let args: string[] = [
            convertNumber(value.data.x, 15),
            convertNumber(value.data.y, 15),
            convertNumber(value.data.z, 15),
        ];
        return `vec(${args.join(", ")})`
    }
    else if (value.id == "snd") {
        let constructorType = "key" in value.data ? "csnd" : "snd";
        let args: string[] = [];

        if ("key" in value.data) {
            let key = value.data.key;
            if (key.startsWith("minecraft:")) 
                key = key.substring("minecraft:".length);
            args.push(valueToTCString(key));
        } else {
            args.push(valueToTCString(sounds[value.data.sound.toLowerCase()]?.name ?? value.data.sound));
        }

        let pitchArg: string = convertNumber(value.data.pitch,15);
        if (value.data.pitch != 0.5 && value.data.pitch != 1.0 && value.data.pitch != 2.0) {
            let noteName = MCNote.getNoteFromPitch(value.data.pitch);
            if (noteName) pitchArg = valueToTCString(noteName);
        }

        if (value.data.vol != 2 || "variant" in value.data) {
            args.push(
                pitchArg,
                convertNumber(value.data.vol),
            );
            if ("variant" in value.data && value.data.variant != undefined) {
                args.push(valueToTCString(value.data.variant));
            }
        } else if (value.data.pitch != 1) {
            args.push(pitchArg);
        }
        return `${constructorType}(${args.join(", ")})`;
    }
    else if (value.id == "part") {
        let fields: {[key: string]: string} = {};
        const pdata = value.data.data;

        if (value.data.cluster.amount !== 1) {
            fields.amount = convertNumber(value.data.cluster.amount)
        }

        if (pdata.rgb !== undefined) {
            fields.color = valueToTCString("#"+pdata.rgb.toString(16).padStart(6,"0"));
        }
        if (pdata.colorVariation && pdata.colorVariation !== 0) {
            fields.colorVariation = convertNumber(pdata.colorVariation);
        }

        if (pdata.rgb_fade !== undefined) {
            fields.fadeColor = valueToTCString("#"+pdata.rgb_fade.toString(16).padStart(6,"0"))
        }

        if (pdata.material !== undefined) {
            fields.material = valueToTCString(pdata.material.toLowerCase());
        }

        if (pdata.x && !(pdata.x == 1 && pdata.y == 0 && pdata.z == 0)) {
            fields.motion = convertDFValue({id: "vec", data: {x: pdata.x!, y: pdata.y!, z: pdata.z!}})!;
        }
        if (pdata.motionVariation && pdata.motionVariation != 100) {
            fields.motionVariation = convertNumber(pdata.motionVariation)
        }

        if (pdata.size !== undefined && pdata.size !== 1) {
            fields.size = convertNumber(pdata.size);
        }
        if (pdata.sizeVariation && pdata.sizeVariation !== 0) {
            fields.sizeVariation = convertNumber(pdata.sizeVariation);
        }

        if (pdata.roll !== undefined && pdata.roll !== 0) {
            fields.roll = convertNumber(pdata.roll)
        }

        if (pdata.opacity !== undefined && pdata.opacity !== 100) {
            fields.opacity = convertNumber(pdata.opacity)
        }
        
        if (pdata.power !== undefined && pdata.power !== 1) {
            fields.power = convertNumber(pdata.power)
        }
        
        if (pdata.time !== undefined && pdata.time !== 20) {
            fields.duration = convertNumber(pdata.time)
        }

        if (value.data.cluster.horizontal !== 0 || value.data.cluster.vertical !== 0) {
            fields.spreadHoriz = convertNumber(value.data.cluster.horizontal);
            fields.spreadVert = convertNumber(value.data.cluster.vertical);
        }


        let fieldsEntries = Object.entries(fields);
        let name = particles[value.data.particle.toLowerCase()]?.name ?? value.data.particle;
        if (fieldsEntries.length > 0) {
            return `par(${valueToTCString(name)}, ${fieldsEntries.map(([k, v]) => `${k}=${v}`).join(", ")})`;
        } else {
            return `par(${valueToTCString(name)})`;
        }
    }
    else if (value.id == "pot") {
        let args: string[] = [
            valueToTCString(potions[value.data.pot.toLowerCase()]?.name ?? value.data.pot),
        ];
        if (value.data.amp != 0 || value.data.dur != 1000000) {
            args.push(convertNumber(value.data.amp+1));
            if (value.data.dur != 1000000) {
                args.push(convertNumber(value.data.dur));
            }
        }
        return `pot(${args.join(", ")})`;
    }
    else if (value.id == "var") {
        let scope = value.data.scope == "unsaved" ? "global" : value.data.scope;
        return `${scope} ${isIdentifier(value.data.name) ? value.data.name : valueToTCString(value.data.name)}`
    }
    return null;
}