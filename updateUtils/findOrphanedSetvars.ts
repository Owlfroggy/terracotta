// lists all setvar actions that don't belong to a domain
// format: deno run updateUtils/findOrphanedSetvars.ts -l?
// -l: include legacy actions
import { parseArgs } from "node:util";
import { DFActionMap } from "../src/util/actionDump.ts";
import { TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS } from "../src/util/constants.ts";
import process from "node:process";
import { COLOR } from "../src/util/characterUtils.ts";

const options = {l: {type: "boolean"}} as const
const { values, positionals } = parseArgs({args: process.argv, options: options, allowPositionals: true})

let found = 0;

for (let pass of ["set_var","if_var"]) {
    const existingActions = new Set([...Object.values(pass == "set_var" ? TYPE_DOMAIN_ACTIONS : TYPE_DOMAIN_CONDITIONS)].flat())
    for (const action of Object.values(DFActionMap[pass]!)) {
        if (!action) {continue}
        if (action?.DFId == "VoronoiNoise" || action?.DFId == "PerlinNoise" || action.DFId == "WorleyNoise") {continue} //these are legacy but for whatever reason the actiondump doesn't say so
        if (!existingActions.has(action.DFId)) {
            if (!values.l && action.IsLegacy) {continue}
            found += 1;
            console.log(action.DFId, action.IsLegacy ? "(legacy)" : "")
        }
    }
    if (found > 0) {
        console.log(`${COLOR.Red}The above ${pass}s are inaccessible in Terracotta.${COLOR.Reset}`)
    } else {
        console.log(`${COLOR.Green}No orphaned ${pass}s found!${COLOR.Reset}`)
    }
}
