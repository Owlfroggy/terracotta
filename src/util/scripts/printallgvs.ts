import * as AD from "../../df/actiondump.ts"

let names: any = {};

for (let v of Object.values(AD.gameValues)) {
    console.log(`${v.name} ${" ".repeat(40-v.name.length)} | ${AD.getTCGameValueName(v.name)}`)
}