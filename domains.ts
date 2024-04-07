import * as AD from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>,silent: boolean = false) {
        this.Identifier = identifier
        this.Comparisons = comparisons
        this.Actions = actions
        this.Values = values

        if (Object.entries(values).length == 0) {
            this.SupportsGameValues = false
        }

        if (silent == false) {
            DomainList[identifier] = this
        }
    }

    SupportsGameValues: boolean = true
    Identifier: string
    Actions: Dict<AD.Action>
    Comparisons: Dict<AD.Action>
    Values: Dict<string>
}

export class TargetDomain extends Domain {
    constructor(identifier: string, target: string, actionType: "player" | "entity", actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>, silent: boolean = false) {
        super(identifier,actions,comparisons,values,silent)

        this.Target = target
        this.ActionType = actionType
    }
    
    Target: string
    ActionType: "player" | "entity"
}

export var TargetDomains = { //this feels like a sin
    //players
    selection: new TargetDomain("selection","selection","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    default: new TargetDomain("default","default","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    killer: new TargetDomain("killer","killer","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    damager: new TargetDomain("damager","damager","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    shooter: new TargetDomain("shooter","shooter","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    victim: new TargetDomain("victim","victim","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues),
    allPlayers: new TargetDomain("allPlayers","allPlayers","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,{}),

    //entities
    selectionEntities: new TargetDomain("selectionEntity","selection","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    defaultEntity: new TargetDomain("defaultEntity","default","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    killerEntity: new TargetDomain("killerEntity","killer","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    damagerEntity: new TargetDomain("damagerEntity","damager","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    shooterEntity: new TargetDomain("shooterEntity","shooter","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    victimEntity: new TargetDomain("victimEntity","victim","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    allEntities: new TargetDomain("allEntities","allEntities","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,{}),
    allMobs: new TargetDomain("allMobs","allMobs","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,{}),
    projectile: new TargetDomain("projectile","projectile","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
    lastSpawnedEntity: new TargetDomain("lastSpawnedEntity","lastSpawnedEntity","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues),
}

//versions of target domains but generalized to just "player" and "entity"
export var GenericTargetDomains = {
    player: new TargetDomain("player","default","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,true),
    entity: new TargetDomain("entity","default","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,true),
}

export var GameDomain = new Domain("game",AD.ValidGameActions,AD.ValidGameCompActions,AD.ValidGameGameValues)

export var TypeDomains = {
    "str": new Domain("str",AD.ValidSetVarStringActions,AD.ValidSetVarStringConds,{}),
    "num": new Domain("num",AD.ValidSetVarNumActions,AD.ValidSetVarNumConds,{}),
    "vec": new Domain("vec",AD.ValidSetVarVectorActions,AD.ValidSetVarVectorConds,{}),
    "loc": new Domain("loc",AD.ValidSetVarLocActions,AD.ValidSetVarLocConds,{}),
    "pot": new Domain("pot",AD.ValidSetVarPotionActions,AD.ValidSetVarPotionConds,{}),
    "var": new Domain("var",AD.ValidSetVarVarActions,AD.ValidSetVarVarConds,{}),
    "snd": new Domain("snd",AD.ValidSetVarSoundActions,AD.ValidSetVarSoundConds,{}),
    "txt": new Domain("txt",AD.ValidSetVarTextActions,AD.ValidSetVarTextConds,{}),
    "item": new Domain("item",AD.ValidSetVarItemActions,AD.ValidSetVarItemConds,{}),
    "list": new Domain("list",AD.ValidSetVarListActions,AD.ValidSetVarListConds,{}),
    "dict": new Domain("dict",AD.ValidSetVarDictActions,AD.ValidSetVarDictConds,{})
}

//DomainsList except it has generic target domains instead of normal target domains
export var GenericDomains = {
    player: GenericTargetDomains.player,
    entity: GenericTargetDomains.entity
}
//add all other domains that aren't targeted
for (let [id, domain] of Object.entries(DomainList)) {
    if (!(domain instanceof TargetDomain)) {
        //if not a target domain, just add it straight to the list
        GenericDomains[id] = domain
    }
}