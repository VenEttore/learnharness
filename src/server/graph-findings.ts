import * as fs from "node:fs";
import { validateToolArguments, type ToolCall } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";
import {
	asSessionFindings,
	auditSchema,
	fillAudit,
	fillFindings,
	sessionFindingsSchema,
	validateFindingsChains,
	validateSessionAnchors,
} from "../agent/subagents/extraction.ts";
import type { AuditVerdicts, ChatRecord, EmissionStats, GraphChain, GraphNode, SessionFindings } from "../core/contracts.ts";
import { coveredSet } from "../core/coverage.ts";
import { emit } from "../core/events.ts";
import { getGraph, mergeFindings } from "../core/graph.ts";
import { settleGraphLayout } from "../core/layout-settle.ts";
import { extractionEnabled } from "../core/settings-resolution.ts";
import type { GraphStore } from "../core/ports.ts";
import { botLesson, conversionProblems, cursorAndItems, externalFailure, unknownFields } from "./bot-run.ts";
import { LEDGER_FILES } from "../../config.ts";
import { unreadBatches } from "./graph-reads.ts";
import { piErrorLines, schemaProblems } from "./schema-problems.ts";
import { effectiveSettings, stores } from "./stores.ts";

/**
 * Bot findings into the knowledge graph (fork, ADR 0001; option A of
 * .scratch/external-teacher/graph-feasibility.md, ticket 29). The Bot
 * Teacher does the extractor's and the auditor's thinking from what
 * `lh extract-view` and `lh graph` show it, and sends the result here.
 * LearnHarness checks it with the extractor's and auditor's own schemas
 * and submit-seam laws, then writes it the way runExtraction does:
 * mergeFindings, the layout settle and the coverage checkpoint, inside the
 * process-wide audit lock. No model is called.
 *
 * The bot names the batch by its messageIds, but the server never trusts
 * that list: it rebuilds the lesson's first unread batch from the coverage
 * file and merges only when the two match. What it checkpoints is its own
 * batch's slots.
 *
 * THE SOURCE TAG: every node line and chain line this route appends to
 * nodes.jsonl and chains.jsonl carries `"source": "external"` (GraphNode
 * and GraphChain in src/core/contracts/graph.ts). That covers new nodes,
 * link lines (a bot verdict that a proposition is an existing node) and
 * chain assertions, so a cleanup can find and remove every line a bot
 * wrote. Coverage lines carry no tag; they name the lesson, and a
 * bot-run lesson is `driver: "external"` on its chat record.
 */

/** The request body: the batch's message ids as extract-view gave them, the
 *  extractor's submit_findings payload and the auditor's submit_review
 *  payload. */
interface FindingsBody {
	messageIds: string[];
	findings: Static<typeof sessionFindingsSchema>;
	verdicts: Static<typeof auditSchema>;
}

const BODY_FIELDS = ["messageIds", "findings", "verdicts"];

/** How long a submission waits for the audit lock before `graph_busy`. A
 *  LearnHarness extraction of an ordinary lesson can hold the lock through
 *  a whole auditor loop; lh gives up on a reply after 30 s. Test seam. */
export const findingsLockWaitMs = { current: 20_000 };

/** A payload checked as the tool boundary checks a model's call (pi's
 *  TypeBox validation), with the bot-run turn route's two extra refusals:
 *  fields the schema does not define, and values pi had to convert. */
function checkedAgainst<S extends TSchema>(schema: S, name: string, value: unknown): { value: Static<S> } | { problems: string[] } {
	const unknown = unknownFields(schema, value, name);
	if (unknown.length > 0) return { problems: unknown };
	let checked: Static<S>;
	try {
		checked = validateToolArguments(
			{ name, description: name, parameters: schema },
			// The body is parsed JSON, so its values are JSON values.
			{ type: "toolCall", id: "bot_findings", name, arguments: value as ToolCall["arguments"] },
		) as Static<S>;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const worded = schemaProblems(schema, value, name);
		const problems = worded.length > 0 ? worded : piErrorLines(message).map((line) => `${name}: ${line}`);
		return { problems: problems.length > 0 ? problems : [`${name}: ${message}`] };
	}
	const converted = conversionProblems(value, checked, name);
	return converted.length > 0 ? { problems: converted } : { value: checked };
}

/** The body's shape problems, or the body. Semantic checks that need the
 *  graph or the coverage file run later, inside the lock. */
function parseBody(body: unknown): { body: FindingsBody } | { problems: string[] } {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { problems: ["the body must be a JSON object { messageIds, findings, verdicts }"] };
	}
	const raw = body as Record<string, unknown>;
	const problems: string[] = [];
	for (const key of Object.keys(raw)) if (!BODY_FIELDS.includes(key)) problems.push(`${key} is not a field; fields: ${BODY_FIELDS.join(", ")}`);
	const ids = raw.messageIds;
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every((m) => typeof m === "string" && m !== "")) {
		problems.push("messageIds must be the batch's messageIds from lh extract-view: a non-empty array of message ids");
	} else if (new Set(ids).size !== ids.length) {
		problems.push("messageIds repeats an id");
	}
	const findings = raw.findings === undefined ? { problems: ["findings is required: { propositions, chains }"] } : checkedAgainst(sessionFindingsSchema, "findings", raw.findings);
	const verdicts = raw.verdicts === undefined ? { problems: ["verdicts is required: { links }"] } : checkedAgainst(auditSchema, "verdicts", raw.verdicts);
	if ("problems" in findings) problems.push(...findings.problems);
	if ("problems" in verdicts) problems.push(...verdicts.problems);
	if (problems.length > 0 || "problems" in findings || "problems" in verdicts) return { problems };
	return { body: { messageIds: ids as string[], findings: findings.value, verdicts: verdicts.value } };
}

/** Rules the model path lets through silently but a bot gets told about:
 *  mergeFindings keeps the first of two propositions with one id, ignores
 *  a link whose id names no proposition, turns a link to an unknown node
 *  into a new node, resolves a chain endpoint to this submission's
 *  proposition before an existing node of the same id, writes a blank
 *  proposition, and drops a chain premise that resolves to the chain's own
 *  conclusion. */
function strictProblems(findings: SessionFindings, verdicts: AuditVerdicts, existingIds: ReadonlySet<string>): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	for (const [i, p] of findings.propositions.entries()) {
		const at = `findings.propositions[${i}]`;
		if (p.id.trim() === "") problems.push(`${at}.id must not be blank`);
		else if (ids.has(p.id)) problems.push(`${at}.id "${p.id}" repeats; each proposition needs its own id`);
		if (existingIds.has(p.id)) problems.push(`${at}.id "${p.id}" is an existing node's id; give the proposition its own id (p1, p2, ...) and link it in verdicts if it is that node`);
		if (p.name.trim() === "") problems.push(`${at}.name must not be blank`);
		if (p.statement.trim() === "") problems.push(`${at}.statement must not be blank`);
		ids.add(p.id);
	}
	const linkTo = new Map<string, string>();
	for (const [i, link] of verdicts.links.entries()) {
		const at = `verdicts.links[${i}]`;
		if (!ids.has(link.id)) problems.push(`${at}.id "${link.id}" is not a proposition id in findings`);
		else if (linkTo.has(link.id)) problems.push(`${at}.id "${link.id}" is linked twice`);
		else linkTo.set(link.id, link.linkTo);
		if (!existingIds.has(link.linkTo)) problems.push(`${at}.linkTo "${link.linkTo}" is not a node in the knowledge graph; leave the proposition out of links to add it as new`);
	}
	// What each endpoint is once the links apply: a linked proposition is
	// the node it links to.
	const resolved = (id: string) => linkTo.get(id) ?? id;
	for (const [i, chain] of findings.chains.entries()) {
		const conclusion = resolved(chain.conclusion);
		for (const premise of chain.premises) {
			if (premise !== chain.conclusion && resolved(premise) === conclusion) {
				problems.push(`findings.chains[${i}]: premise "${premise}" and conclusion "${chain.conclusion}" are the same node once the links apply`);
			}
		}
	}
	return problems;
}

/** The graph store with every node and chain line it appends tagged
 *  `source: "external"`. Everything else passes through to the real store. */
function taggedStore(store: GraphStore): GraphStore {
	return new Proxy(store, {
		get(target, prop) {
			if (prop === "appendNode") return (node: GraphNode) => target.appendNode({ ...node, source: "external" });
			if (prop === "appendChain") return (chain: GraphChain) => target.appendChain({ ...chain, source: "external" });
			const value: unknown = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

interface AuditLockGlobal {
	/** extraction.ts's serialized-audit mutex: a FIFO promise chain that
	 *  createExtractionPipeline's withAuditLock holds from audit through
	 *  merge. Taking the same chain here means no LearnHarness auditor
	 *  explores the graph while a bot's findings are merged into it. */
	__lhAuditLock?: { tail: Promise<void> };
}

/** Run `critical` holding the audit lock, or return "busy" after
 *  findingsLockWaitMs. A waiter that gives up keeps its place in the chain
 *  until the holder before it releases, so the next waiter still waits for
 *  that holder. */
async function withAuditLock<T>(critical: () => T): Promise<T | "busy"> {
	const g = globalThis as typeof globalThis & AuditLockGlobal;
	const lock = (g.__lhAuditLock ??= { tail: Promise.resolve() });
	const prev = lock.tail;
	let release!: () => void;
	lock.tail = new Promise<void>((resolve) => (release = resolve));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const gaveUp = new Promise<"busy">((resolve) => (timer = setTimeout(() => resolve("busy"), findingsLockWaitMs.current)));
	const turn = await Promise.race([prev.then(() => "free" as const), gaveUp]);
	clearTimeout(timer);
	if (turn === "busy") {
		void prev.then(release);
		return "busy";
	}
	try {
		return critical();
	} finally {
		release();
	}
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

/** The merge, run inside the lock against the lesson as it is now. */
function mergeUnderLock(id: string, body: FindingsBody): Response {
	const record = stores.chatStore.getChat(id);
	// Deleted while this request waited for the lock.
	if (!record) return externalFailure(404, "not_found");
	const lesson = (extra: Record<string, unknown>) => ({ lesson: id, ...extra, ...cursorAndItems(record) });
	// The switch may have been turned off while this request waited.
	if (!extractionEnabled(effectiveSettings().graph)) return externalFailure(409, "graph_disabled", lesson({}));
	const { batches, covered } = unreadBatches(record);

	// Which of the bot's ids are teacher passages of this lesson, and which
	// of those the coverage file already holds.
	const read = coveredSet(stores.graphStore.readCoverage(), id);
	const visible = new Map(covered.slots.filter((s) => s.tokens > 0).map((s) => [s.message.id, read.has(s.fp)]));
	const unknown = body.messageIds.filter((m) => !visible.has(m));
	if (unknown.length > 0) {
		return externalFailure(400, "bad_findings", lesson({ problems: unknown.map((m) => `messageIds: "${m}" is not a teacher passage of this lesson`) }));
	}
	if (body.messageIds.every((m) => visible.get(m) === true)) {
		// A rerun: every message is already read, so nothing is written.
		return Response.json({ ok: true, ...lesson({ merged: false, alreadyRead: true, nodes: 0, chains: 0, remaining: batches.length }) });
	}
	const batch = batches[0];
	if (!batch || !sameIds(body.messageIds, batch.messageIds)) {
		return externalFailure(409, "stale_batch", lesson({ batch: batch?.messageIds ?? [] }));
	}

	// The pipeline's own lift: runSubmitAgent fills, runExtractor lifts.
	const findings: SessionFindings = asSessionFindings(fillFindings(body.findings));
	const verdicts: AuditVerdicts = fillAudit(body.verdicts);
	const existingIds = new Set(getGraph(stores.graphStore).nodes.map((n) => n.id));
	const law = validateSessionAnchors(body.findings, new Set(batch.messageIds)) ?? validateFindingsChains(findings, existingIds);
	const problems = [...(law === null ? [] : [law]), ...strictProblems(findings, verdicts, existingIds)];
	if (problems.length > 0) return externalFailure(400, "bad_findings", lesson({ problems }));

	const foldedAt = new Date().toISOString();
	let stats: EmissionStats;
	try {
		stats = mergeFindings(id, findings, verdicts, { chatStore: stores.chatStore, graphStore: taggedStore(stores.graphStore) }, {
			foldedAt,
			coverage: batch.slots.filter((slot) => slot.tokens > 0).map((slot) => ({ chatId: id, fp: slot.fp, tokens: slot.tokens, foldedAt })),
		});
	} catch (err) {
		console.error(`[chat ${id}] bot findings merge failed:`, err);
		return externalFailure(500, "save_failed", lesson({}));
	}
	// The merge and its coverage are written: a failed layout write must not
	// tell the bot otherwise (a resend would only get alreadyRead). The next
	// merge settles the whole graph again.
	try {
		settleGraphLayout(stores.graphStore);
	} catch (err) {
		console.error(`[chat ${id}] layout settle after bot findings failed:`, err);
	}
	// The activity dock and the graph view re-read on this; the view
	// refetches the graph because /api/graph/status's graphRevision moved
	// (no run row comes and goes for a bot merge).
	emit("activity-changed", {});
	return Response.json({
		ok: true,
		...lesson({
			merged: true,
			nodes: stats.nodes,
			chains: stats.chains ?? 0,
			...(stats.droppedChains ? { droppedChains: stats.droppedChains } : {}),
			read: batch.messageIds,
			remaining: batches.length - 1,
		}),
	});
}

/** /api/graph/status's stamp: graphRevision (server/graph.ts) without
 *  positions.json, so the view's own position commits do not refetch. */
export function graphDataRevision(): number {
	return Math.max(0, ...Object.values(LEDGER_FILES).map((file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0)));
}

/** POST /api/external/chats/:id/findings. Bot-run lessons only. */
export async function submitFindings(id: string, body: unknown): Promise<Response> {
	const record: ChatRecord | Response = botLesson(id);
	if (record instanceof Response) return record;
	// The graph master switch closes the write channel, as it does for
	// LearnHarness's own automatic extraction (chat-handler.ts).
	if (!extractionEnabled(effectiveSettings().graph)) return externalFailure(409, "graph_disabled", { lesson: id, ...cursorAndItems(record) });
	const parsed = parseBody(body);
	if ("problems" in parsed) return externalFailure(400, "bad_findings", { lesson: id, problems: parsed.problems, ...cursorAndItems(record) });
	try {
		const result = await withAuditLock(() => mergeUnderLock(id, parsed.body));
		return result === "busy" ? externalFailure(503, "graph_busy", { lesson: id, ...cursorAndItems(record) }) : result;
	} catch (err) {
		// A check's own bug, not the bot's input: nothing was written.
		console.error(`[chat ${id}] bot findings failed:`, err);
		return externalFailure(500, "internal_error", { lesson: id, ...cursorAndItems(record) });
	}
}
