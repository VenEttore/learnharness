import { proseView, sourceDigest } from "../agent/subagents/extraction.ts";
import { prepareAuditorReview, proberGraphTools } from "../agent/tools/graph.ts";
import { batchRuns, coverageOf, messageViewLines } from "../core/coverage.ts";
import { getGraph, graphSessionIndex, graphSessionPropositions } from "../core/graph.ts";
import { failedOutputCallIds } from "../core/native-messages.ts";
import {
	CANDIDATE_PAGE_SIZE,
	createPropositionCandidateSearch,
	propositionCandidateBatch,
	type CandidateProposition,
	type CandidateRequest,
} from "../core/proposition-candidates.ts";
import { FACTORY_SETTINGS } from "../core/settings.ts";
import type { ChatRecord } from "../core/contracts.ts";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { botLesson, cursorOf, externalFailure } from "./bot-run.ts";
import { stores } from "./stores.ts";

/**
 * Graph reads for the Bot Teacher (fork, ADR 0001; option A of
 * .scratch/external-teacher/graph-feasibility.md). The bot does the
 * extractor's and auditor's thinking, so it reads what those models read:
 * the extraction view, and the auditor's and prober's graph tools. Every
 * read reuses the in-process code; nothing here writes or calls a model.
 */

/** One batch of a lesson's unread teacher text, as the extractor gets it. */
export interface ExtractViewBatch {
	/** The batch's teacher-prose message ids: the only anchors a finding
	 *  from this batch may name (the extractor's validateSessionAnchors). */
	messageIds: string[];
	/** "# title" then "TEACHER [id] text" passages: the extractor's view. */
	view: string;
}

export interface ExtractView {
	/** What this lesson already added to the graph ("" when nothing): the
	 *  digest the extractor reads before the view. */
	digest: string;
	/** The extractor's prompt for the first batch: digest, blank line, view
	 *  (or the view alone when the digest is empty). Null with no batches. */
	prompt: string | null;
	/** Unread teacher text in token-budgeted batches, oldest first. Merging
	 *  one batch changes the digest, so read again before the next. */
	batches: ExtractViewBatch[];
	uncoveredCount: number;
	uncoveredTokens: number;
}

/** The extraction pipeline's chunk budget. The server's pipeline sets no
 *  getChunkTokens, so it runs on the factory value; this matches it. */
const CHUNK_TOKENS = FACTORY_SETTINGS.graph.extractionChunkTokens;

/** The same batching and view runExtraction builds for a chat
 *  (src/agent/subagents/extraction.ts), without the model call. */
export function extractViewOf(record: ChatRecord, chunkTokens: number = CHUNK_TOKENS): ExtractView {
	const graph = getGraph(stores.graphStore);
	const covered = coverageOf(record.messages, stores.graphStore.readCoverage(), record.id);
	const failedOutputCalls = failedOutputCallIds(record.messages);
	const batches = batchRuns(covered.slots, covered.uncovered, chunkTokens).map((batch): ExtractViewBatch => {
		const messages = batch.map((slot) => slot.message);
		return {
			messageIds: messages.filter((m) => messageViewLines(m, m.id, failedOutputCalls).length > 0).map((m) => m.id),
			view: proseView(messages, record.title, failedOutputCalls),
		};
	});
	const digest = sourceDigest(graph, record.id);
	const first = batches[0];
	return {
		digest,
		prompt: first === undefined ? null : digest === "" ? first.view : `${digest}\n\n${first.view}`,
		batches,
		uncoveredCount: covered.uncoveredCount,
		uncoveredTokens: covered.uncoveredTokens,
	};
}

/** GET /api/external/chats/:id/extract-view. Bot-run lessons only: an
 *  ordinary lesson is LearnHarness's own extractor's to read. */
export function showExtractView(id: string): Response {
	const record = botLesson(id);
	if (record instanceof Response) return record;
	return Response.json({ ok: true, lesson: id, cursor: cursorOf(record), ...extractViewOf(record) });
}

const graphDeps = () => ({ chatStore: stores.chatStore, graphStore: stores.graphStore });

/** A read-only tool's text, run in-process exactly as a model's call runs it. */
async function toolText(tool: AgentTool<any>, input: unknown): Promise<string> {
	const result = await tool.execute("lh", input);
	const part = result.content[0];
	return part?.type === "text" ? part.text : "";
}

/** GET /api/external/graph/sessions: the birth sessions, with the
 *  auditor's and the prober's list_sessions text. */
export async function listGraphSessions(): Promise<Response> {
	const deps = graphDeps();
	return Response.json({
		ok: true,
		sessions: graphSessionIndex(deps),
		auditorText: await toolText(prepareAuditorReview(deps).tools.list_sessions!, {}),
		proberText: await toolText(proberGraphTools(deps).list_sessions!, {}),
	});
}

/** GET /api/external/graph/sessions/:id/propositions: the propositions born
 *  in one session, with full statements (the auditor's view) and the
 *  auditor's and the prober's list_propositions text. */
export async function listGraphPropositions(session: string): Promise<Response> {
	const deps = graphDeps();
	const nodes = new Map(getGraph(deps.graphStore).nodes.map((n) => [n.id, n]));
	const propositions = graphSessionPropositions(deps, session).map((p) => {
		// graphSessionPropositions lists these same nodes, so the lookup hits.
		const node = nodes.get(p.nodeId)!;
		return { nodeId: p.nodeId, name: p.name, statement: node.statement, aliases: node.aliases };
	});
	return Response.json({
		ok: true,
		session,
		propositions,
		auditorText: await toolText(prepareAuditorReview(deps).tools.list_propositions!, { session }),
		proberText: await toolText(proberGraphTools(deps).list_propositions!, { session }),
	});
}

interface FindQuery extends CandidateProposition {
	hints?: string[];
	offset?: number;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** The find body's problems, or the queries. The boundary guard: the
 *  candidate search throws on a repeated id or a bad offset, and would
 *  read a missing name or statement as text; this turns all of it into
 *  a 400 that lists every problem. */
function findQueries(body: unknown): { queries: FindQuery[] } | { problems: string[] } {
	const raw = (typeof body === "object" && body !== null ? body : {}) as { propositions?: unknown };
	if (!Array.isArray(raw.propositions) || raw.propositions.length === 0) {
		return { problems: ["propositions must be a non-empty array of { id, name, statement?, aliases?, hints?, offset? }"] };
	}
	const problems: string[] = [];
	for (const key of Object.keys(raw)) if (key !== "propositions") problems.push(`${key} is not a field; set offset and hints on each proposition`);
	const queries: FindQuery[] = [];
	const seen = new Set<string>();
	raw.propositions.forEach((item: unknown, i) => {
		const at = `propositions[${i}]`;
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			problems.push(`${at} must be an object`);
			return;
		}
		const p = item as Record<string, unknown>;
		const known = ["id", "name", "statement", "aliases", "hints", "offset"];
		for (const key of Object.keys(p)) if (!known.includes(key)) problems.push(`${at}.${key} is not a field`);
		if (typeof p.id !== "string" || p.id === "") problems.push(`${at}.id must be a non-empty string`);
		else if (seen.has(p.id)) problems.push(`${at}.id "${p.id}" repeats; combine its hints in one entry`);
		else seen.add(p.id);
		if (typeof p.name !== "string" || p.name.trim() === "") problems.push(`${at}.name must be a non-empty string`);
		if (p.statement !== undefined && typeof p.statement !== "string") problems.push(`${at}.statement must be a string`);
		if (p.aliases !== undefined && !isStringArray(p.aliases)) problems.push(`${at}.aliases must be an array of strings`);
		if (p.hints !== undefined && (!isStringArray(p.hints) || p.hints.some((h) => h === ""))) {
			problems.push(`${at}.hints must be an array of non-empty strings`);
		}
		if (p.offset !== undefined && (!Number.isSafeInteger(p.offset) || (p.offset as number) < 0)) {
			problems.push(`${at}.offset must be a nonnegative integer`);
		}
		queries.push({
			id: String(p.id),
			name: String(p.name),
			statement: typeof p.statement === "string" ? p.statement : "",
			aliases: isStringArray(p.aliases) ? p.aliases : [],
			hints: isStringArray(p.hints) ? p.hints : undefined,
			offset: typeof p.offset === "number" ? p.offset : undefined,
		});
	});
	return problems.length > 0 ? { problems } : { queries };
}

/** POST /api/external/graph/find: the auditor's find_candidates over the
 *  bot's proposed propositions. Same ranking and pages; a stateless HTTP
 *  caller gets nextOffset where the in-process tool hands out a page token. */
export function findGraphCandidates(body: unknown): Response {
	const parsed = findQueries(body);
	if ("problems" in parsed) return externalFailure(400, "bad_find", { problems: parsed.problems });
	const search = createPropositionCandidateSearch(getGraph(stores.graphStore).nodes);
	const requests: CandidateRequest[] = parsed.queries.map((q) => ({ id: q.id, hints: q.hints, offset: q.offset }));
	const batch = propositionCandidateBatch(search, parsed.queries, requests);
	return Response.json({
		ok: true,
		pageSize: CANDIDATE_PAGE_SIZE,
		matches: batch.matches.map((m) => ({
			propositionId: m.propositionId,
			candidateIds: m.candidateIds,
			offset: m.offset,
			totalCandidates: m.totalCandidates,
			nextOffset: m.nextOffset,
		})),
		candidates: batch.candidates,
	});
}
