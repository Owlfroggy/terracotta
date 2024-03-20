import { ValidPlayerActions, ValidPlayerCompActions, ValidPlayerGameValues } from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<string>, comparisons: Dict<string>, values: Dict<string>) {
        this.Identifier = identifier
        this.Comparisons = comparisons
        this.Actions = actions
        this.Values = values

        DomainList[identifier] = this
    }

    Identifier: string
    Actions: Dict<string>
    Comparisons: Dict<string>
    Values: Dict<string>
}

export class TargetDomain extends Domain {
    constructor(identifier: string, target: string, actions: Dict<string>, comparisons: Dict<string>, values: Dict<string>) {
        super(identifier,actions,comparisons,values)

        this.Target = target
        if (
            target == "default" ||
            target == "selecton" ||
            target == "killer" ||
            target == "damager" ||
            target == "victim" ||
            target == "shooter"
        ) {
            this.ActionType = "player"
        } else {
            this.ActionType = "entity"
        }
    }
    
    Target: string
    ActionType: "player" | "entity"
}

export var TargetDomains = { //this feels like a sin
    selection: new TargetDomain("selection","selection",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    default: new TargetDomain("default","default",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    killer: new TargetDomain("killer","killer",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    damager: new TargetDomain("damager","damager",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    shooter: new TargetDomain("shooter","shooter",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    victim: new TargetDomain("victim","victim",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues),
    allPlayers: new TargetDomain("allPlayers","allPlayers",ValidPlayerActions,ValidPlayerCompActions,ValidPlayerGameValues)
}