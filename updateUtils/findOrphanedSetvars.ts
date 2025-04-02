// lists all setvar actions that don't belong to a domain
// format: deno run updateUtils/findOrphanedSetvars.ts -l?
// -l: include legacy actions
import { parseArgs } from "node:util";
import { DFActionMap } from "../src/util/actionDump.ts";
import { TYPE_DOMAIN_ACTIONS } from "../src/util/constants.ts";
import process from "node:process";
import { COLOR } from "../src/util/characterUtils.ts";

const options = {l: {type: "boolean"}} as const
const { values, positionals } = parseArgs({args: process.argv, options: options, allowPositionals: true})

const existingActions = new Set([...Object.values(TYPE_DOMAIN_ACTIONS)].flat())

let found = 0;

for (const action of Object.values(DFActionMap.set_var!)) {
    if (!action) {continue}
    if (!existingActions.has(action.DFId)) {
        if (!values.l && action.IsLegacy) {continue}
        found += 1;
        console.log(action.DFId, action.IsLegacy ? "(legacy)" : "")
    }
}
console.log(`${COLOR.Red}The above actions are inaccessible in Terracotta.`)