import { Action } from "../df/actiondump.ts";
import * as AD from "../df/actiondump.ts";

function getDFParamString(parameters: AD.Parameter[], header: string, noParamsFallback: string) {
    if (parameters.length == 0) { return noParamsFallback }

    let paramStrings: string[] = []

    for (const param of parameters) {
        let groupStrings: string[] = []
        for (const group of param.groups) {
            let valueStrings: string[] = []
            for (const value of group) {                
                // notes
                let notesString = ""
                for (const note of value.notes) {
                    if (note.length > 0) {
                        notesString += `\\\n  ⏵ ${note}`
                    }
                }

                // main string
                let pluralSuffix = value.plural ? "(s)" : ""
                let optionalSuffix = value.optional ? "*" : ""
                valueStrings.push(`\`${AD.dfTypeToString.get(value.type)}${pluralSuffix}${optionalSuffix}\` ${value.description.length + notesString.length > 0 ? "-" : ""} ${value.description}${notesString}`)
            }
            groupStrings.push(valueStrings.join("\\\n"))
        }
        paramStrings.push(groupStrings.join("\\\n **OR**\\\n"))
    }
    return header + paramStrings.join("\n\n\n\n")
}

export function getActionDocumentation(action: Action) {
    let paramString = getDFParamString(action.parameters,"\n\n**Parameters:**\n\n","\n\n**No Parameters**")
    let infoString = action.additionalInfo.join("\\\n  ⏵ "); if (infoString) {infoString = "\\\n  ⏵ " + infoString}

    let worksWithString = ""
    if (action.worksWith.length > 0) {
        worksWithString = "\n\n**Works with:**\n\n  ⏵ " + action.worksWith.join("\\\n  ⏵ ")
    }

    let tagsString = ""
    if (Object.keys(action.tags).length > 0) {
        tagsString = "\n\n**Tags:**"
        for (const tag of Object.values(action.tags)) {
            tagsString += `\\\n\`${tag?.name}\` - ${Object.keys(tag?.options).map(v => `"${v}"`).join(", ")}`
        }
    }

    let returnString = getDFParamString(action.returnTypes,"\n\n**Returns:**\n\n","")

    // let rankString = (action.RequiresRank && (!AD.RankCheck(configuration.dfRank,action?.RequiresRank!))) ? `\n\n❌ **(Requires ${action.RequiresRank})**\n\n` : ""
    let rankString = "";
    let worldPlotString = (action.worldPlotExclusive ? "🌐 **World Plot Exclusive**\n\n" : "");

    return `${worldPlotString}${rankString}${action.description}${infoString}${worksWithString}${paramString}${tagsString}${returnString}`
}