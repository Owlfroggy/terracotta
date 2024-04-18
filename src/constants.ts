export const VALID_TYPES = ["str","num","vec","loc","pot","var","snd","any","txt","item","list","dict"]
export const TC_TYPE_TO_DF_TYPE = {
    "str": "txt",
    "txt": "comp",
    "num": "num",
    "loc": "loc",
    "vec": "vec",
    "snd": "snd",
    "par": "part",
    "pot": "pot",
    "item": "item",
    "any": "any",
    "var": "var",
    "list": "list",
    "dict": "dict"
}

export const ITEM_DF_NBT = 3705

export const VALID_PARAM_MODIFIERS = ["plural","optional"]

export const VALID_VAR_SCCOPES = {
    "global": "unsaved",
    "saved": "saved",
    "local": "local",
    "line": "line"
}

export const VALID_ASSIGNMENT_OPERATORS = ["=", "+=", "-=", "*=", "/=", "%="]
export const VALID_MATH_OPERATORS = ["+", "-", "*", "/", "^", "%"]
export const VALID_COMPARISON_OPERATORS = ["==", "!=", "<", ">", "<=", ">="]

export const VALID_CONTROL_KEYWORDS = ["break","continue","return","returnmult","wait","endthread"]

export const VALID_TARGETS = ["default", "defaultEntity", "selection", "selectionEntity", "killer", "killerEntity", "damager", "damagerEntity", "victim", "victimEntity", "shooter", "shooterEntity", "lastEntity", "projectile"]

export const VALID_HEADER_KEYWORDS = ["LAGSLAYER_CANCEL"]

export const VALID_LINE_STARTERS = ["PLAYER_EVENT","ENTITY_EVENT","PROCESS","FUNCTION"]