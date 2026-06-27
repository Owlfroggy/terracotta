// note: this does not include metadata used by the extension such as item images

export interface ItemLibraryItemEntry {
    data: string,
    version: number
}

export interface ItemLibrary {
    compilationMode: "item" | "variable",
    id: "string",
    items: {[id: string]: ItemLibraryItemEntry},
}