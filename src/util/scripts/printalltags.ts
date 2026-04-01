import * as AD from "../../df/actiondump.ts"

let names: any = {};

for (let actions of AD.actions.values()) {
    for (let a of Object.values(actions)) {
        if (a.isLegacy) continue;
        for (const tagName of Object.keys(a.tags)) {
            let tcName = AD.getTCTagName(tagName);
            if (!names[tagName]) names[tagName] = (
                tagName + `${" ".repeat(30-tagName.length)} | `
                + tcName + `${" ".repeat(30-tcName.length)} | `
            );
            if (names[tagName].length < 200) {
                names[tagName] += `${a.codeblock} ${a.name} (${AD.getTCActionName(a.codeblock, a.name)}), `
            } else if (names[tagName][names[tagName].length-1] != ".") {
                names[tagName] += "...";
            }
        }
    }
}

console.log(Object.values(names).join("\n"));