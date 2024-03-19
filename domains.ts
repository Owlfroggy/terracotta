import { ValidPlayerActions, ValidPlayerCompActions } from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<string>, comparisons: Dict<string>) {
        this.Identifier = identifier
        this.Comparisons = comparisons
        this.Actions = actions

        DomainList[identifier] = this
    }

    Identifier: string
    Actions: Dict<string>
    Comparisons: Dict<string>
}

export class TargetDomain extends Domain {
    constructor(identifier: string, actions: Dict<string>, comparisons: Dict<string>, target: string) {
        super(identifier,actions,comparisons)

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

export var TargetDomains = {
    selection: new TargetDomain("selection",ValidPlayerActions,ValidPlayerCompActions,"default"),
    default: new TargetDomain("default",ValidPlayerActions,ValidPlayerCompActions,"default"),
    killer: new TargetDomain("killer",ValidPlayerActions,ValidPlayerCompActions,"killer"),
    damager: new TargetDomain("damager",ValidPlayerActions,ValidPlayerCompActions,"damager"),
    shooter: new TargetDomain("shooter",ValidPlayerActions,ValidPlayerCompActions,"shooter"),
    victim: new TargetDomain("victim",ValidPlayerActions,ValidPlayerCompActions,"victim"),
    allPlayers: new TargetDomain("allPlayers",ValidPlayerActions,ValidPlayerCompActions,"allPlayers")
}