import * as AD from "./actionDump"
import { TYPE_DOMAIN_ACTIONS, TYPE_DOMAIN_CONDITIONS } from "./constants"

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
    selection: new TargetDomain("selection","Selection","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    default: new TargetDomain("default","Default","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    killer: new TargetDomain("killer","Killer","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    damager: new TargetDomain("damager","Damager","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    shooter: new TargetDomain("shooter","Shooter","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    victim: new TargetDomain("victim","Victim","player",playerActions,playerConditions,playerGameValues,["player_action","if_player"]),
    allPlayers: new TargetDomain("allPlayers","AllPlayers","player",playerActions,playerConditions,{},["player_action","if_player"]),

    //entities
    selectionEntities: new TargetDomain("selectionEntity","Selection","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    defaultEntity: new TargetDomain("defaultEntity","Default","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    killerEntity: new TargetDomain("killerEntity","Killer","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    damagerEntity: new TargetDomain("damagerEntity","Damager","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    shooterEntity: new TargetDomain("shooterEntity","Shooter","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    victimEntity: new TargetDomain("victimEntity","Victim","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    allEntities: new TargetDomain("allEntities","AllEntities","entity",entityActions,entityConditions,{},["entity_action","if_entity"]),
    allMobs: new TargetDomain("allMobs","AllMobs","entity",entityActions,entityConditions,{},["entity_action","if_entity"]),
    projectile: new TargetDomain("projectile","Projectile","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
    lastSpawnedEntity: new TargetDomain("lastSpawnedEntity","LastEntity","entity",entityActions,entityConditions,entityGameValues,["entity_action","if_entity"]),
}

//versions of target domains but generalized to just "player" and "entity"
export var GenericTargetDomains = {
    player: new TargetDomain("player","Default","player",playerActions,playerConditions,playerGameValues,null,true),
    entity: new TargetDomain("entity","Default","entity",entityActions,entityConditions,entityGameValues,null,true),
}

export var GameDomain = new Domain("game",AD.TCActionMap.game_action!,AD.TCActionMap.if_game!,AD.TCUntargetedGameValues,["game_action","if_game"])

function toTcActionTable(actionDFIds: string[],block: string) {
    let table: Dict<AD.Action> = {}
    for (const dfId of actionDFIds) {
        if (!AD.DFActionMap[block]![dfId]!) {continue}
        table[AD.DFActionMap[block]![dfId]!.TCId] = AD.DFActionMap[block]![dfId]!
    }
    return table
}

//WALL OF DOOOOOOOOOMMM!!!!!!
export var TypeDomains = {
    "str": new Domain("str",  toTcActionTable(TYPE_DOMAIN_ACTIONS.str,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.str,"if_var")  ,{},["set_var","if_var"]),
    "num": new Domain("num",  toTcActionTable(TYPE_DOMAIN_ACTIONS.num,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.num,"if_var")  ,{},["set_var","if_var"]),
    "vec": new Domain("vec",  toTcActionTable(TYPE_DOMAIN_ACTIONS.vec,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.vec,"if_var")  ,{},["set_var","if_var"]),
    "loc": new Domain("loc",  toTcActionTable(TYPE_DOMAIN_ACTIONS.loc,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.loc,"if_var")  ,{},["set_var","if_var"]),
    "pot": new Domain("pot",  toTcActionTable(TYPE_DOMAIN_ACTIONS.pot,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.pot,"if_var")  ,{},["set_var","if_var"]),
    "var": new Domain("var",  toTcActionTable(TYPE_DOMAIN_ACTIONS.var,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.var,"if_var")  ,{},["set_var","if_var"]),
    "snd": new Domain("snd",  toTcActionTable(TYPE_DOMAIN_ACTIONS.snd,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.snd,"if_var")  ,{},["set_var","if_var"]),
    "txt": new Domain("txt",  toTcActionTable(TYPE_DOMAIN_ACTIONS.txt,"set_var") , toTcActionTable(TYPE_DOMAIN_CONDITIONS.txt,"if_var")  ,{},["set_var","if_var"]),
    "item": new Domain("item",toTcActionTable(TYPE_DOMAIN_ACTIONS.item,"set_var"), toTcActionTable(TYPE_DOMAIN_CONDITIONS.item,"if_var") ,{},["set_var","if_var"]),
    "list": new Domain("list",toTcActionTable(TYPE_DOMAIN_ACTIONS.list,"set_var"), toTcActionTable(TYPE_DOMAIN_CONDITIONS.list,"if_var") ,{},["set_var","if_var"]),
    "dict": new Domain("dict",toTcActionTable(TYPE_DOMAIN_ACTIONS.dict,"set_var"), toTcActionTable(TYPE_DOMAIN_CONDITIONS.dict,"if_var") ,{},["set_var","if_var"])
}
GenericDomains.entity = GenericTargetDomains.entity
GenericDomains.player = GenericTargetDomains.player