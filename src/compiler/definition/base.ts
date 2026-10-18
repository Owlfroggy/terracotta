import type { FunctionDefinition } from "./function.ts";
import type { NamespaceDefinition } from "./namespace.ts";
import type { PropertyDefinition } from "./property.ts";
import type { ValueDefinition } from "./value.ts";

export enum DefinitionType {
  FUNCTION,
  VALUE,
  PROPERTY,
  NAMESPACE,
}

export abstract class Definition {
  parent: NamespaceDefinition | null;

  protected constructor(
    public readonly definitionType: DefinitionType,
  ) {}

  isFunctionDefinition(this: Definition): this is FunctionDefinition {
    return this.definitionType === DefinitionType.FUNCTION;
  }

  isValueDefinition(this: Definition): this is ValueDefinition {
    return this.definitionType === DefinitionType.VALUE;
  }

  isPropertyDefinition(this: Definition): this is PropertyDefinition {
    return this.definitionType === DefinitionType.PROPERTY;
  }

  isNamespaceDefinition(this: Definition): this is NamespaceDefinition {
    return this.definitionType === DefinitionType.NAMESPACE;
  }

  /** 
   * Creates a copy of this Definition that is its own distinct object
   * 
   * The copy will have its parent set to `null`
   */
  abstract clone(): Definition
}