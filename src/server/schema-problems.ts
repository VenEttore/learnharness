/**
 * READABLE SCHEMA PROBLEMS (fork, external-teacher ticket 25). pi's
 * validateToolArguments throws one string: a header, one line per AJV
 * error (a union reports each branch: "must be equal to constant" twice,
 * then "must match a schema in anyOf"), and the whole payload echoed back.
 * A Bot Teacher gets the turn route's `invalid` refusal instead, with one
 * plain problem per field, in the wording the route's other checks use
 * ("question must be a string, not number").
 *
 * The walk covers the keywords the turn kinds' schemas use (type,
 * properties, required, items, minItems, maxItems, minLength, const,
 * anyOf). An optional field sent as null gets the route's own wording,
 * "must not be null; leave it out". pi still decides validity; this only words a failure it found.
 * When the walk finds nothing to say, pi's own error lines are kept,
 * without the payload echo.
 */

type Schema = {
	type?: string;
	properties?: Record<string, Schema>;
	required?: string[];
	items?: Schema;
	minItems?: number;
	maxItems?: number;
	minLength?: number;
	const?: unknown;
	anyOf?: Schema[];
};

function jsonType(value: unknown): string {
	return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

function article(type: string): string {
	return type === "array" || type === "object" || type === "integer" ? "an" : "a";
}

const at = (path: string, key: string) => (path ? `${path}.${key}` : key);
const name = (path: string) => path || "the payload";

function typeMatches(type: string, value: unknown): boolean {
	if (type === "integer") return typeof value === "number" && Number.isInteger(value);
	return jsonType(value) === type;
}

/** One problem per field the value breaks `schema` at, worded for a bot. */
export function schemaProblems(schema: unknown, value: unknown, path = ""): string[] {
	const s = schema as Schema;
	if (Array.isArray(s.anyOf)) {
		const branches = s.anyOf;
		if (branches.some((b) => schemaProblems(b, value, path).length === 0)) return [];
		if (branches.every((b) => Object.hasOwn(b, "const"))) {
			const allowed = branches.map((b) => JSON.stringify(b.const)).join(" or ");
			return [`${name(path)} must be ${allowed}, not ${JSON.stringify(value) ?? jsonType(value)}`];
		}
		// A branch of the value's own type says what is wrong inside it.
		const sameType = branches.find((b) => b.type !== undefined && typeMatches(b.type, value));
		if (sameType) return schemaProblems(sameType, value, path);
		const types = [...new Set(branches.map((b) => b.type).filter((t): t is string => typeof t === "string"))];
		return types.length > 0
			? [`${name(path)} must be ${types.map((t) => `${article(t)} ${t}`).join(" or ")}, not ${jsonType(value)}`]
			: [`${name(path)} does not match any allowed form`];
	}
	if (Object.hasOwn(s, "const") && value !== s.const) {
		return [`${name(path)} must be ${JSON.stringify(s.const)}, not ${JSON.stringify(value) ?? jsonType(value)}`];
	}
	if (s.type !== undefined && !typeMatches(s.type, value)) {
		return [`${name(path)} must be ${article(s.type)} ${s.type}, not ${jsonType(value)}`];
	}
	if (s.type === "string" && typeof value === "string" && s.minLength !== undefined && value.length < s.minLength) {
		return [s.minLength === 1 ? `${name(path)} must not be empty` : `${name(path)} must be at least ${s.minLength} characters`];
	}
	if (s.type === "array" && Array.isArray(value)) {
		const out: string[] = [];
		if (s.minItems !== undefined && value.length < s.minItems) out.push(`${name(path)} needs at least ${s.minItems} ${s.minItems === 1 ? "item" : "items"}, not ${value.length}`);
		if (s.maxItems !== undefined && value.length > s.maxItems) out.push(`${name(path)} takes at most ${s.maxItems} ${s.maxItems === 1 ? "item" : "items"}, not ${value.length}`);
		if (s.items) out.push(...value.flatMap((v, i) => schemaProblems(s.items, v, `${path}[${i}]`)));
		return out;
	}
	if (s.type === "object" && jsonType(value) === "object") {
		const object = value as Record<string, unknown>;
		const missing = (s.required ?? []).filter((k) => !Object.hasOwn(object, k)).map((k) => `${at(path, k)} is required`);
		const required = new Set(s.required ?? []);
		// pi drops an optional null before it checks; the route refuses it
		// in conversionProblems' words, used here too.
		const inner = Object.entries(s.properties ?? {}).flatMap(([k, sub]) =>
			!Object.hasOwn(object, k) ? []
				: object[k] === null && !required.has(k) ? [`${at(path, k)} must not be null; leave it out`]
					: schemaProblems(sub, object[k], at(path, k)),
		);
		return [...missing, ...inner];
	}
	return [];
}

/** pi's error lines ("  - type: must be equal to constant"), deduplicated,
 *  without the header or the payload echo: the fallback when the walk
 *  finds nothing to word. */
export function piErrorLines(message: string): string[] {
	const lines = message.split("\n").flatMap((l) => (l.startsWith("  - ") ? [l.slice(4).trim()] : []));
	return [...new Set(lines)];
}
