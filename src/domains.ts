import * as AD from "./actionDump"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>,silent: boolean = false,codeBlock: string | null = null) {
        this.Identifier = identifier
        this.Comparisons = comparisons
        this.Actions = actions
        this.Values = values
        this.CodeBlock = codeBlock

        if (Object.entries(values).length == 0) {
            this.SupportsGameValues = false
        }

        if (silent == false) {
            DomainList[identifier] = this
        }

        //generate inverses
        for (let [tcName, action] of Object.entries(this.Actions)) {
            if (action == null) { continue } //make vscode shut the hell up about how action might be null

            this.ActionsInverse[action.DFName] = action
        }

        for (let [tcName, action] of Object.entries(this.Comparisons)) {
            if (action == null) { continue } //make vscode shut the hell up about how action might be null

            this.ComparisonsInverse[action.DFName] = action
        }

        for (let [tcName, dfName] of Object.entries(this.Values)) {
            if (dfName == null) { continue } //make vscode shut the hell up about how action might be null

            this.ValuesInverse[dfName] = tcName
        }
    }

    SupportsGameValues: boolean = true
    Identifier: string
    Actions: Dict<AD.Action>
    Comparisons: Dict<AD.Action>
    Values: Dict<string>
    CodeBlock: string | null

    //inverse: df name as the key
    ActionsInverse: Dict<AD.Action> = {}
    ComparisonsInverse: Dict<AD.Action> = {}
    ValuesInverse: Dict<string> = {}
}

export class TargetDomain extends Domain {
    constructor(identifier: string, target: string, actionType: "player" | "entity", actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<string>, silent: boolean = false, codeBlock: string | null = null) {
        super(identifier,actions,comparisons,values,silent,codeBlock)

        this.Target = target
        this.ActionType = actionType
    }
    
    Target: string
    ActionType: "player" | "entity"
}

export var TargetDomains = { //this feels like a sin
    //players
    selection: new TargetDomain("selection","selection","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    default: new TargetDomain("default","default","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    killer: new TargetDomain("killer","killer","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    damager: new TargetDomain("damager","damager","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    shooter: new TargetDomain("shooter","shooter","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    victim: new TargetDomain("victim","victim","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,false,"player_action"),
    allPlayers: new TargetDomain("allPlayers","allPlayers","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,{},false,"player_action"),

    //entities
    selectionEntities: new TargetDomain("selectionEntity","selection","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    defaultEntity: new TargetDomain("defaultEntity","default","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    killerEntity: new TargetDomain("killerEntity","killer","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    damagerEntity: new TargetDomain("damagerEntity","damager","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    shooterEntity: new TargetDomain("shooterEntity","shooter","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    victimEntity: new TargetDomain("victimEntity","victim","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    allEntities: new TargetDomain("allEntities","allEntities","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,{},false,"entity_action"),
    allMobs: new TargetDomain("allMobs","allMobs","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,{},false,"entity_action"),
    projectile: new TargetDomain("projectile","projectile","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
    lastSpawnedEntity: new TargetDomain("lastSpawnedEntity","lastSpawnedEntity","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,false,"entity_action"),
}

//versions of target domains but generalized to just "player" and "entity"
export var GenericTargetDomains = {
    player: new TargetDomain("player","default","player",AD.ValidPlayerActions,AD.ValidPlayerCompActions,AD.ValidPlayerGameValues,true),
    entity: new TargetDomain("entity","default","entity",AD.ValidEntityActions,AD.ValidEntityCompActions,AD.ValidEntityGameValues,true),
}

export var GameDomain = new Domain("game",AD.ValidGameActions,AD.ValidGameCompActions,AD.ValidGameGameValues,false,"game_action")

export var TypeDomains = {
    "str": new Domain("str",AD.ValidSetVarStringActions,AD.ValidSetVarStringConds,{},false,"set_var"),
    "num": new Domain("num",AD.ValidSetVarNumActions,AD.ValidSetVarNumConds,{},false,"set_var"),
    "vec": new Domain("vec",AD.ValidSetVarVectorActions,AD.ValidSetVarVectorConds,{},false,"set_var"),
    "loc": new Domain("loc",AD.ValidSetVarLocActions,AD.ValidSetVarLocConds,{},false,"set_var"),
    "pot": new Domain("pot",AD.ValidSetVarPotionActions,AD.ValidSetVarPotionConds,{},false,"set_var"),
    "var": new Domain("var",AD.ValidSetVarVarActions,AD.ValidSetVarVarConds,{},false,"set_var"),
    "snd": new Domain("snd",AD.ValidSetVarSoundActions,AD.ValidSetVarSoundConds,{},false,"set_var"),
    "txt": new Domain("txt",AD.ValidSetVarTextActions,AD.ValidSetVarTextConds,{},false,"set_var"),
    "item": new Domain("item",AD.ValidSetVarItemActions,AD.ValidSetVarItemConds,{},false,"set_var"),
    "list": new Domain("list",AD.ValidSetVarListActions,AD.ValidSetVarListConds,{},false,"set_var"),
    "dict": new Domain("dict",AD.ValidSetVarDictActions,AD.ValidSetVarDictConds,{},false,"set_var")
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