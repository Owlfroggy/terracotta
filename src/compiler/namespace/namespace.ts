import { Definition } from "./definition.ts";

export class Namespace {
    static registry: {[identifier: string]: Namespace} = {};

    constructor(
        public identifier: string,
        public members: {[identifier: string]: Definition} = {},
    ) {
        if (identifier in Namespace.registry) {
            throw new Error(`Attempted to register duplicate namespace '${identifier}'`);
        }
        Namespace.registry[identifier] = this;
    }
}