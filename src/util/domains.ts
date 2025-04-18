import * as AD from "./actionDump.ts"
import { TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS } from "./constants.ts"
import { Dict } from "./dict.ts"

//list of all registered domain ids
export var DomainList: Dict<Domain> = {}
//all domains that aren't marked as internal
export var PublicDomains: Dict<Domain> = {}

//DomainsList except it has generic target domains instead of normal target domains
export let GenericDomains: Dict<Domain> = {}

export class Domain {
    constructor(identifier: string, actions: Dict<AD.Action>, conditions: Dict<AD.Action>, values: Dict<AD.GameValue>,codeblocks: string[] | null = null, internal: boolean = false) {
        this.Identifier = identifier
        this.Conditions = conditions
        this.Actions = actions
        this.Values = values
        this.Internal = internal

        if (codeblocks) {
            this.ActionCodeblock = codeblocks[0]
            this.ConditionCodeblock = codeblocks[1]
        }

        if (Object.entries(values).length == 0) {
            this.SupportsGameValues = false
        }

        DomainList[identifier] = this
        if (!(this instanceof TargetDomain)) { GenericDomains[identifier] = this }
        if (!internal) {PublicDomains[identifier] = this}
    }

    SupportsGameValues: boolean = true

    //domain identifier
    Identifier: string
    
    //key: tc name
    Actions: Dict<AD.Action>
    
    //key: tc name
    Conditions: Dict<AD.Action>

    //key: tc name
    Values: Dict<AD.GameValue>
    
    //codeblock identifiers
    ActionCodeblock: string | null

    ConditionCodeblock: string | null

    //used internally by stuff like generic target comparisons. makes this domain not valid for general use in scripts (for example, player:SendMessage(); is invalid because player domain is set as internal)
    Internal: boolean
}

export class TargetDomain extends Domain {
    constructor(identifier: string, target: string, actionType: "player" | "entity", actions: Dict<AD.Action>, comparisons: Dict<AD.Action>, values: Dict<AD.GameValue>, codeblocks: string[] | null = null, internal: boolean = false) {
        super(identifier,actions,comparisons,values,codeblocks,internal)

        this.Target = target
        this.ActionType = actionType
    }
    
    Target: string
    ActionType: "player" | "entity"
}

let playerActions = AD.TCActionMap["player_action"]!
let playerConditions = AD.TCActionMap["if_player"]!
let playerGameValues = AD.TCTargetedGameValues
let entityActions = AD.TCActionMap["entity_action"]!
let entityConditions = AD.TCActionMap["if_entity"]!
let entityGameValues = AD.TCEntityGameValues

export var TargetDomains = { //this feels like a sin
    //players
    selected: new TargetDomain("selected","Selection","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    default: new TargetDomain("default","Default","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    killer: new TargetDomain("killer","Killer","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    damager: new TargetDomain("damager","Damager","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    shooter: new TargetDomain("shooter","Shooter","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    victim: new TargetDomain("victim","Victim","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    allPlayers: new TargetDomain("allPlayers","AllPlayers","player",playerActions,playerConditions,{},["player_action","if_player"]),

    //entities
    selectedEntity: new TargetDomain("selectedEntity","Selection","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    defaultEntity: new TargetDomain("defaultEntity","Default","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    killerEntity: new TargetDomain("killerEntity","Killer","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    damagerEntity: new TargetDomain("damagerEntity","Damager","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    shooterEntity: new TargetDomain("shooterEntity","Shooter","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    victimEntity: new TargetDomain("victimEntity","Victim","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    allEntities: new TargetDomain("allEntities","AllEntities","entity",entityActions,entityConditions,{},["entity_action","if_entity"]),
    allMobs: new TargetDomain("allMobs","AllMobs","entity",entityActions,entityConditions,{},["entity_action","if_entity"]),
    projectile: new TargetDomain("projectile","Projectile","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    lastEntity: new TargetDomain("lastEntity","LastEntity","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
}

//versions of target domains but generalized to just "player" and "entity"
export var GenericTargetDomains = {
    player: new TargetDomain("player","Default","player",{},playerConditions,{},["player_action","if_player"],true),
    entity: new TargetDomain("entity","Default","entity",{},entityConditions,{},["entity_action","if_entity"],true),
}
GenericDomains.entity = GenericTargetDomains.entity
GenericDomains.player = GenericTargetDomains.player

export var GameDomain = new Domain("game",AD.TCActionMap.game_action!,AD.TCActionMap.if_game!,AD.TCUntargetedGameValues,["game_action","if_game"])

function toTcActionTable(actionDFIds: string[],block: string) {
    let table: Dict<AD.Action> = {}
    for (const dfId of actionDFIds) {
        if (!AD.DFActionMap[block]![dfId]!) {continue}
        table[AD.DFActionMap[block]![dfId]!.TCId] = AD.DFActionMap[block]![dfId]!
    }
    return table
}

export var TypeDomains = {};
["str","num","vec","loc","pot","var","snd","txt","item","par","list","dict"].forEach(type => {
    TypeDomains[type] = new Domain(type,toTcActionTable(TYPE_DOMAIN_ACTIONS[type],"set_var"), toTcActionTable(TYPE_DOMAIN_CONDITIONS[type],"if_var") ,{},["set_var","if_var"])
});