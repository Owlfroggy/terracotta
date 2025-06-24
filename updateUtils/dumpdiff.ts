// format: deno run updateUtils/dumpdiff.ts path/to/old.json path/to/new.json
import { parseArgs } from "node:util";
import process from "node:process"
import { readFile } from "node:fs/promises";
import { Dict } from "../src/util/dict.ts";

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
let seen: Dict<any> = {}

oldDump.actions.forEach(action => {
    if (!seen[action.codeblockName]) {
        seen[action.codeblockName] = {}
    }
    seen[action.codeblockName][action.name] = true
});

console.log("== NEW ACTIONS ==")
newDump.actions.forEach(action => {
    if (!seen[action.codeblockName][action.name]) {
        console.log(`${action.codeblockName}:${action.name}`)
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