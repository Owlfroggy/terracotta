import { dirWithoutRelations } from "../../util/debug.ts";
import { Definition, DefinitionType } from "../definition/base.ts";
import { FunctionDefinition } from "../definition/function.ts";

export class NamespaceDefinition extends Definition {
	members: { [identifier: string]: Definition[]; } = {}

	// TODO: this pattern should eventually be moved away from
	functions: { [identifier: string]: FunctionDefinition[] } = {};
	processes: { [identifier: string]: FunctionDefinition[] } = {};
	namespaces: { [identifier: string]: NamespaceDefinition[] } = {};

	constructor(
		public identifier: string,
		public nameFunction: FunctionDefinition | null = null
	) {
		super(DefinitionType.NAMESPACE);
	}

	/** CURRENTLY UNIMPLEMENTED!! */
	clone(): NamespaceDefinition {
		throw new Error("NamespaceDefinition.clone() is currently unimplemented.")
	}

	addMembersFromEntries(members: [identifier: string, member: Definition][], cloneAll?: boolean): this {
		for (const [identifier, member] of members) {
			let m = cloneAll ? member.clone() : member;
			this.addMember(identifier, m);
		}
		return this;
	}
	addMembersFromObject(members: {[identifier: string]: Definition}, cloneAll?: boolean): this {
		for (const [identifier, member] of Object.entries(members)) {
			let m = cloneAll ? member.clone() : member;
			this.addMember(identifier, m);
		}
		return this;
	}
	getPath(): string {
		let n: NamespaceDefinition | null = this.parent;
		let out = this.identifier;
		while (n != null) {
			out = n.identifier + "." + out;
			n = n.parent;
		}
		return out;
	}
	addMember(identifier: string, member: Definition) {
		// TODO: use full namespace paths
		if (member == this) {
			throw new Error(`Attempted to add namespace '${this.getPath()}' to itself.`)
		}
		if (member.parent != null) {
			throw new Error(`Attempted to add member '${identifier}' (${member.constructor.name}) to namespace '${this.getPath()}' but it already had a parent (old parent: '${member.parent.getPath()}')`)
		}
		
		member.parent = this;

		if (!(identifier in this.members)) 
			this.members[identifier] = [];
		this.members[identifier].push(member);

		if (member instanceof FunctionDefinition) {
			const category = member.flags?.isProcess ? "processes" : "functions";
			if (!(identifier in this[category]))
				this[category][identifier] = [];
			this[category][identifier].push(member);
		}

		if (member instanceof NamespaceDefinition) {
			if (!(identifier in this.namespaces))
				this.namespaces[identifier] = [];
			this.namespaces[identifier].push(member);
		}
	}

	getMember(identifier: string): Definition | undefined {
		return this.members[identifier]?.[0];
	}

	*iterateMembers(): Generator<[identifier: string, member: Definition]> {
		for (const [identifier, members] of Object.entries(this.members)) {
			yield [identifier, members[0]];
		}
	}
}
