// format: deno run --allow-all updateUtils/dumpdiff.ts src/data/actiondump_old.json src/data/actiondump.json
import { parseArgs } from "node:util";
import process from "node:process"
import { readFile } from "node:fs/promises";
import { Dict } from "../src/util/dict.ts";

const { values: _values, positionals } = parseArgs({args: process.argv, allowPositionals: true})

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
const seen: Dict<Dict<boolean>> = {}

oldDump.actions.forEach(action => {
    if (!seen[action.codeblockName]) { seen[action.codeblockName] = {}; }
    seen[action.codeblockName][action.name] = true
});

console.log("== NEW ACTIONS ==")
newDump.actions.forEach(action => {
    if (!seen[action.codeblockName]) { seen[action.codeblockName] = {}; }
    if (!seen[action.codeblockName][action.name]) {
        console.log(`${action.codeblockName}:${action.name}`)
    }
})

// values \\
const seenValues: Dict<boolean> = {}

oldDump.gameValues.forEach(value => {
    seenValues[value.icon.name] = true
});

console.log("== NEW GAME VALUES ==")
newDump.gameValues.forEach(value => {
    if (!seenValues[value.icon.name]) {
        console.log(`${value.icon.name}`)
    }
})

export {}