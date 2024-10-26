/** HOW TO USE **
 * place this script inside the /src/ folder of the terracotta source code
 * set the configuration values to dump the right thing
 * run it and check console
 * 
 * console output is in csv format
 */

import { DomainList } from "./util/domains"


//= CONFIGURATION =\\

/* what to tableize */
const mode: "actions" = "actions"

/* what domain to use */
const domainId: string = "game"


//= ACTUAL SCRIPT =\\

let csv: string = ""
let entries: string[] = []

if (mode == "actions") {
    csv = "DiamondFire Sign Name,Terracotta Name\n"
    ;Object.values(DomainList[domainId]!.Actions).forEach(action => {
        if (!action?.TCId) {return}
        entries.push(`${action?.DFId.trimEnd().trimStart()},${action?.TCId}`)
    });
}

csv += entries.sort().join("\n")

console.log(csv);