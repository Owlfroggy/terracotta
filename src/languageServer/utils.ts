import { ASTNode } from "../ast/astNode.ts";
import { Action } from "../df/actiondump.ts";
import * as AD from "../df/actiondump.ts";
import { DFRank, dfTypeToString } from "../df/constants.ts";
import { toNameCase, upperFirst } from "../util/utils.ts";

export function getDFParamString(parameters: AD.Parameter[], header: string, noParamsFallback: string) {
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
                valueStrings.push(`\`${dfTypeToString.get(value.type)}${pluralSuffix}${optionalSuffix}\` ${value.description.length + notesString.length > 0 ? "-" : ""} ${value.description}${notesString}`)
            }
            groupStrings.push(valueStrings.join("\\\n"))
        }
        paramStrings.push(groupStrings.join("\\\n **OR**\\\n"))
    }
    return header + paramStrings.join("\n\n\n\n")
}

export function getRankString(ownedRank: DFRank, requiredRank: DFRank) {
    if (!AD.rankCheck(ownedRank,requiredRank)) {
        return `\n\n❌ **(Requires ${toNameCase(requiredRank)})**\n\n`;
    } else {
        return ""
    }
}

export function getActionDocumentation(action: Action, ownedRank: DFRank = DFRank.OVERLORD) {
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

    let rankString = getRankString(ownedRank, action.requiresRank);
    let worldPlotString = (action.worldPlotExclusive ? "🌐 **World Plot Exclusive**\n\n" : "");

    return `${worldPlotString}${rankString}${action.description}${infoString}${worksWithString}${paramString}${tagsString}${returnString}`
}

export function getValueDocumentation(val: AD.GameValue) {
    let description = val.description
    let info = val.additionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
    let worksWithString = ""
    if (val.worksWith.length > 0) {
        worksWithString = "\n\n**Works with:**\n\n  ⏵ " + val.worksWith.join("\\\n  ⏵ ")
    }

    //creating a parameter object so that it can work with the existing string gen is kinda a hack but whatever
    let returnV = new AD.ParameterGroupValue(
        val.type,
        val.returnDescription,
    )

    let returnP = new AD.Parameter([[returnV]])

    let returnType = getDFParamString([returnP],"\n\n**Value:**\n\n","")

    let worldPlotString = (val.worldPlotExclusive ? "🌐 **World Plot Exclusive**\n\n" : "");

    return `${worldPlotString}${description}${worksWithString}${info}${returnType}`
}

export function getEventDocumentation(event: Action, ownedRank: DFRank = DFRank.OVERLORD) {
    let info = event.additionalInfo.join("\\\n  ⏵ "); if (info) {info = "\\\n  ⏵ " + info}
    let cancelInfo = event.cancellable ? "\n\n∅ Cancellable" : event.cancelledAutomatically ? "\n\n∅ Cancelled automatically" : ""
    let rankString = getRankString(ownedRank, event.requiresRank);
    let worldPlotString = (event.worldPlotExclusive ? "🌐 **World Plot Exclusive**\n\n" : "");
    return `${worldPlotString}${rankString}${event.description}${info}${cancelInfo}`
}

export function visualizeNodeAncestors(node: ASTNode, prev: ASTNode | null = null): string {
    // if (node.parent == null) 
    let cString = node.children.map(c => `\n    ${c == prev ? "> " : ""}${c.keyInParent}  ${c}`).join("")
    let thisNodeString = `${node.keyInParent} ${node}${cString}\n`;
    return (node.parent == null ? "" : visualizeNodeAncestors(node.parent, node)) + thisNodeString;
}