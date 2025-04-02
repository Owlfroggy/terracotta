// lists all legacy actions that are accessible from terracotta
// format: deno run updateUtils/findLegacyActions.ts
import { Domain, DomainList, TargetDomains } from "../src/util/domains.ts"

for (const domain of Object.values(DomainList) as Domain[]) {
    //avoid printing duplicates for the targeted domains
    //generic domains will take care of it
    if (domain?.Identifier in TargetDomains) {continue}

    for (const conditionMode of [true,false]) {
        for (const action of Object.values(domain[conditionMode ? "Conditions" : "Actions"])) {
            if (action?.IsLegacy) {
                console.log(`${action.DFId} (${domain.Identifier}${conditionMode ? "?" : ":"}${action.TCId})`)
            }
        }
    }
}