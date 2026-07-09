// format: deno run --allow-all updateUtils/dumpdiff.ts src/data/actiondump_old.json src/data/actiondump.json
import { parseArgs } from "node:util";
import process from "node:process"
import { readFile } from "node:fs/promises";

const { values, positionals } = parseArgs({args: process.argv, allowPositionals: true})

if (positionals.length < 1) {
    console.log("Missing path to old action dump")
    process.exit(1)
} else if (positionals.length < 2) {
    console.log("Missing path to new action dump")
    process.exit(1)
}

const oldDump = JSON.parse((await readFile(positionals[2]!)).toString())
const newDump = JSON.parse((await readFile(positionals[3]!)).toString())

// actions \\
let seen: {[key: string]: any} = {}

oldDump.actions.forEach(action => {
    if (!seen[action.codeblockName]) { seen[action.codeblockName] = {}; }
    seen[action.codeblockName][action.name] = true
});

console.log("== NEW ACTIONS ==")
newDump.actions.forEach(action => {
    if (!seen[action.codeblockName]) { seen[action.codeblockName] = {}; }
    if (!seen[action.codeblockName][action.name]) {
        console.log(`${action.codeblockName}:${action.name}${action.legacyReplacement ? "  (is somehow already legacy step up ur update speed omg)" : ""}`)
    }
})

// values \\
seen = {}

oldDump.gameValues.forEach(value => {
    seen[value.icon.name] = true
});

console.log("== NEW GAME VALUES ==")
newDump.gameValues.forEach(value => {
    if (!seen[value.icon.name]) {
        console.log(`${value.icon.name}`)
    }
})

export {}