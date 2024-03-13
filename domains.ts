import { ValidPlayerActions } from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<string>) {
        this.Identifier = identifier
        this.Actions = actions

        DomainList[identifier] = this
    }

    Identifier: string
    Actions: Dict<string>
}

export class TargetDomain extends Domain {
    constructor(identifier: string, actions: Dict<string>, target: string) {
        super(identifier,actions)

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
    selection: new TargetDomain("selection",ValidPlayerActions,"default"),
    default: new TargetDomain("default",ValidPlayerActions,"default"),
    killer: new TargetDomain("killer",ValidPlayerActions,"killer"),
    damager: new TargetDomain("damager",ValidPlayerActions,"damager"),
    shooter: new TargetDomain("shooter",ValidPlayerActions,"shooter"),
    victim: new TargetDomain("victim",ValidPlayerActions,"victim"),
    allPlayers: new TargetDomain("allPlayers",ValidPlayerActions,"allPlayers")
}