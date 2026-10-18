import { Definition, DefinitionType } from "../definition/base.ts";
import { FunctionDefinition } from "../definition/function.ts";


export class NamespaceDefinition extends Definition {
  static registry: { [identifier: string]: NamespaceDefinition; } = {};

  constructor(
    public identifier: string,
    public members: { [identifier: string]: Definition; } = {},
    public nameFunction: FunctionDefinition | null = null
  ) {
    super(DefinitionType.NAMESPACE);
    if (identifier in NamespaceDefinition.registry) {
      throw new Error(`Attempted to register duplicate namespace '${identifier}'`);
    }
    NamespaceDefinition.registry[identifier] = this;
  }
}
