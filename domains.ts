import * as AD from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>) {
        this.Identifier = identifier
        this.Comparisons = comparisons
        this.Actions = actions
        this.Values = values

        if (Object.entries(values).length == 0) {
            this.SupportsGameValues = false
        }

        DomainList[identifier] = this
    }

    SupportsGameValues: boolean = true
    Identifier: string
    Actions: Dict<AD.Action>
    Comparisons: Dict<AD.Action>
    Values: Dict<string>
}

export class TargetDomain extends Domain {
    constructor(identifier: string, target: string, actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>) {
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
    //players
    selection: new TargetDomain("selection","selection",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    default: new TargetDomain("default","default",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    killer: new TargetDomain("killer","killer",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    damager: new TargetDomain("damager","damager",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    shooter: new TargetDomain("shooter","shooter",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    victim: new TargetDomain("victim","victim",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    allPlayers: new TargetDomain("allPlayers","allPlayers",AD.ValidPlayerActions,AD.ValidPlayerCompActions,{}),

    //entities
    selectionEntities: new TargetDomain("selectionEntity","selection",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    defaultEntity: new TargetDomain("defaultEntity","default",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    killerEntity: new TargetDomain("killerEntity","killer",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    damagerEntity: new TargetDomain("damagerEntity","damager",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    shooterEntity: new TargetDomain("shooterEntity","shooter",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    victimEntity: new TargetDomain("victimEntity","victim",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    allEntities: new TargetDomain("allEntities","allEntities",AD.ValidEntityActions,AD.ValidEntityCompActions,{}),
    allMobs: new TargetDomain("allMobs","allMobs",AD.ValidEntityActions,AD.ValidEntityCompActions,{}),
    projectile: new TargetDomain("projectile","projectile",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    lastSpawnedEntity: new TargetDomain("lastSpawnedEntity","lastSpawnedEntity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
}

export var GameDomain = new Domain("game",AD.ValidGameActions,AD.ValidGameCompActions,AD.ValidGameGameValues)