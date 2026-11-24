/**
 * BOT FINDINGS INTO THE GRAPH (fork, ADR 0001; external-teacher ticket 29).
 * POST /api/external/chats/:id/findings takes the extractor's and the
 * auditor's output from a Bot Teacher and writes it the way LearnHarness's
 * own pipeline does:
 *
 *   parity    the same findings through the route and through the real
 *             pipeline (scripted models) leave the same ledgers, apart
 *             from the source tag, ids and timestamps
 *   refusals  bad shapes, stale batches and any chain are refused and
 *             write nothing (a bot sends "chains": [], ticket 32)
 *   count     every merge and rerun reply carries the lesson's totals and
 *             the line the bot sends the learner
 *   reruns    a rerun over read messages is a no-op, also when two land
 *             at once
 *   lock      the route waits for the pipeline's audit lock, and gives up
 *             with graph_busy, writing nothing
 *
 * No route call reaches a model or the network. Runs under an isolated
 * LH_DATA_DIR (never the home graph); app modules load after it is set.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type ToolCall } from "@earendil-works/pi-ai";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-graph-findings-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { LEDGER_FILES, POSITIONS_FILE, SETTINGS_FILE } = await import("../config.ts");
const { abortExtraction, createExtractionPipeline, extractionStatuses } = await import("../src/agent/subagents/extraction.ts");
const { getGraph, mergeFindings } = await import("../src/core/graph.ts");
const { stores } = await import("../src/server/stores.ts");
const { extractViewOf, unreadBatches } = await import("../src/server/graph-reads.ts");
const { findingsLockWaitMs, graphDataRevision } = await import("../src/server/graph-findings.ts");
const { listGraphSessions } = await import("../src/server/graph-reads.ts");
const findingsRoute = await import("../app/api/external/chats/[id]/findings/route.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;
type LhMessage = import("../src/core/native-messages.ts").LhMessage;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** The real fetch, restored after each call (two calls may overlap). */
const realFetch = globalThis.fetch;
after(() => {
	globalThis.fetch = realFetch;
});

/** A route call must not reach a model: no fetch at all while it runs. */
async function submit(id: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
	let calls = 0;
	globalThis.fetch = (async () => {
		calls++;
		throw new Error("the findings route reached the network");
	}) as typeof fetch;
	try {
		const req = new Request(`http://test/api/external/chats/${id}/findings`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		});
		const res = await findingsRoute.POST(req, ctx(id));
		return { status: res.status, body: (await res.json()) as Json };
	} finally {
		globalThis.fetch = realFetch;
		assert.equal(calls, 0, "no network call");
	}
}

const read = (file: string): string => (fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "");
/** Every file a merge writes, as raw text. */
const files = () => ({
	nodes: read(LEDGER_FILES.nodes),
	chains: read(LEDGER_FILES.chains),
	coverage: read(LEDGER_FILES.coverage),
	sessions: read(LEDGER_FILES.sessions),
	positions: read(POSITIONS_FILE),
});
const lines = (text: string): Json[] => text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Json);

// ─── lessons ────────────────────────────────────────────────────────────────

const teacher = (id: string, text: string) =>
	({ id, role: "assistant", content: [{ type: "text", text }], timestamp: 1 }) as unknown as LhMessage;
const learner = (id: string, text: string) => ({ id, role: "user", content: text, timestamp: 1 }) as unknown as LhMessage;
/** About 1500 tokens: two fit one 4096-token batch, three do not. */
const long = (lead: string) => `${lead} ${"Worked example detail. ".repeat(260)}`;

/** Two batches under the factory budget: [t1, t2], then [t3]. */
const LESSON = [
	learner("u1", "teach me derivatives"),
	teacher("t1", long("The chain rule differentiates a composition: (f∘g)' = f'(g)·g'.")),
	learner("u2", "ok"),
	teacher("t2", long("A derivative is the limit of difference quotients.")),
	teacher("t3", long("The quotient rule follows from the product rule and the chain rule.")),
];
const SHORT = [learner("u1", "teach me limits"), teacher("t1", "A limit is the value a function approaches.")];

const botLessonWith = (key: string, messages: LhMessage[]) =>
	stores.chatStore.createChat("Derivatives", undefined, { driver: "external", externalKey: key, messages }).id;
const ordinaryLessonWith = (messages: LhMessage[]) => {
	const chat = stores.chatStore.createChat("Derivatives");
	stores.chatStore.saveMessages(chat.id, messages);
	return chat.id;
};

// ─── a seed graph both runs start from ──────────────────────────────────────

mergeFindings(
	"src_seed",
	{
		propositions: [
			{ id: "s1", name: "Derivative", statement: "A derivative is an instantaneous rate of change.", aliases: [] },
			{ id: "s2", name: "Limit", statement: "A limit is the value a function approaches.", aliases: [] },
		],
		chains: [{ premises: ["s2"], conclusion: "s1" }],
	},
	{ links: [] },
	{ chatStore: stores.chatStore, graphStore: stores.graphStore },
	{ foldedAt: "2026-01-01T00:00:00.000Z" },
);
const SEED = {
	nodes: stores.graphStore.readNodes(),
	chains: stores.graphStore.readChains(),
	checkpoints: stores.graphStore.readCheckpoints(),
};
const seedId = (name: string) => SEED.nodes.find((n) => n.name === name)!.id;
const resetToSeed = () => {
	stores.graphStore.rewriteLedgers({ nodes: SEED.nodes, chains: SEED.chains, coverage: [], checkpoints: SEED.checkpoints });
	stores.graphStore.writePositions({});
};

/** What a Bot Teacher sends for batch `i`: new ideas and, in batch 1, a
 *  link to a seed node. No chains: the route refuses them (ticket 32). */
function planFor(i: number, messageIds: string[]): { findings: Json; verdicts: Json } {
	if (i === 0) {
		return {
			findings: {
				propositions: [
					{ id: "p1", name: "Chain rule", statement: "(f∘g)' = f'(g)·g'.", aliases: ["composition rule"], messageId: messageIds[0] },
					{ id: "p2", name: "Derivative", statement: "A derivative is the limit of difference quotients.", messageId: messageIds[1] },
				],
				chains: [],
			},
			verdicts: { links: [{ id: "p2", linkTo: seedId("Derivative") }] },
		};
	}
	return {
		findings: {
			propositions: [{ id: "p1", name: "Quotient rule", statement: "(f/g)' = (f'g − fg')/g².", aliases: [], messageId: messageIds[0] }],
			chains: [],
		},
		verdicts: { links: [] },
	};
}

function fauxEngine(step: Parameters<ReturnType<typeof createFauxCore>["setResponses"]>[0][number]): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses([step]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}
const submitCall = (name: string, args: unknown) =>
	fauxAssistantMessage([fauxToolCall(name, args as ToolCall["arguments"])], { stopReason: "toolUse" });

/** The ledgers with what must differ between two runs taken out: the
 *  lesson id, minted ids (numbered by first appearance), timestamps and
 *  the source tag (checked here: on every line the run added, never on a
 *  seed line). */
function normalized(f: ReturnType<typeof files>, chatId: string, tagged: boolean): Json {
	const seedIds = new Set([...SEED.nodes.map((n) => n.id), ...SEED.chains.map((c) => c.id)]);
	const ids = new Map<string, string>();
	const idOf = (id: string) => {
		if (seedIds.has(id)) return id;
		if (!ids.has(id)) ids.set(id, `${id.split("_")[0]}#${ids.size + 1}`);
		return ids.get(id)!;
	};
	const seedLines = SEED.nodes.length;
	const seedChainLines = SEED.chains.length;
	const strip = (line: Json, index: number, seedCount: number, kind: string): Json => {
		const { source, ...rest } = line;
		if (index < seedCount) assert.equal(source, undefined, `seed ${kind} line ${index} untagged`);
		else assert.equal(source, tagged ? "external" : undefined, `${kind} line ${index} tag`);
		return rest;
	};
	const point = (pt: Json) => ({ ...pt, chatId: pt.chatId === chatId ? "LESSON" : pt.chatId });
	const nodes = lines(f.nodes).map((l, i) => {
		const n = strip(l, i, seedLines, "node");
		return { ...n, id: idOf(n.id), createdAt: "T", provenance: n.provenance.map(point) };
	});
	const chains = lines(f.chains).map((l, i) => {
		const c = strip(l, i, seedChainLines, "chain");
		return { ...c, id: idOf(c.id), premises: c.premises.map(idOf), conclusion: idOf(c.conclusion), createdAt: "T", provenance: c.provenance.map(point) };
	});
	const coverage = lines(f.coverage).map((e) => ({ ...e, chatId: e.chatId === chatId ? "LESSON" : e.chatId, foldedAt: "T" }));
	const positions = Object.keys((JSON.parse(f.positions || "{}") as { positions?: Json }).positions ?? {}).map(idOf).sort();
	return { nodes, chains, coverage, sessions: lines(f.sessions), positions };
}

// ─── parity ─────────────────────────────────────────────────────────────────

describe("the findings route writes what LearnHarness's pipeline writes", () => {
	it("leaves the same ledgers as the pipeline for the same findings, batch after batch, apart from the tag", async () => {
		// Run 1: an ordinary lesson through the real pipeline, scripted models.
		resetToSeed();
		const ordinary = ordinaryLessonWith(LESSON);
		const batches = unreadBatches(stores.chatStore.getChat(ordinary)!).batches;
		assert.deepEqual(batches.map((b) => b.messageIds), [["t1", "t2"], ["t3"]], "two batches, the first of two passages");
		let extractorCalls = 0;
		let auditorCalls = 0;
		const pipeline = createExtractionPipeline({
			...stores,
			engineFor: (role) =>
				role === "extractor"
					? fauxEngine(() => {
						const batch = extractViewOf(stores.chatStore.getChat(ordinary)!).batches[0]!;
						return submitCall("submit_findings", planFor(extractorCalls++, batch.messageIds).findings);
					})
					: fauxEngine(() => submitCall("submit_review", planFor(auditorCalls++, ["t1", "t2"]).verdicts)),
		});
		const stats = await pipeline.runExtraction(ordinary);
		assert.equal(extractorCalls, 2);
		assert.deepEqual(stats, { nodes: 2, chains: 0 }, "one new idea per batch, no chains");
		const viaPipeline = normalized(files(), ordinary, false);
		assert.ok(viaPipeline.positions.length > 0, "the layout settled");

		// Run 2: the same messages in a bot-run lesson, through the route.
		resetToSeed();
		const bot = botLessonWith("findings-parity", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const r1 = await submit(bot, { messageIds: first.messageIds, ...planFor(0, first.messageIds) });
		assert.equal(r1.status, 200, JSON.stringify(r1.body));
		assert.equal(r1.body.merged, true);
		assert.deepEqual([r1.body.nodes, r1.body.chains, r1.body.droppedChains, r1.body.remaining], [1, 0, undefined, 1]);
		assert.deepEqual(r1.body.read, ["t1", "t2"]);
		const second = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		assert.deepEqual(second.messageIds, ["t3"]);
		const r2 = await submit(bot, { messageIds: second.messageIds, ...planFor(1, second.messageIds) });
		assert.equal(r2.status, 200, JSON.stringify(r2.body));
		assert.deepEqual([r2.body.merged, r2.body.nodes, r2.body.chains, r2.body.remaining], [true, 1, 0, 0]);
		const viaRoute = normalized(files(), bot, true);

		assert.deepEqual(viaRoute, viaPipeline);
		assert.ok(viaRoute.nodes.some((n: Json) => n.id === seedId("Derivative") && n.provenance[0].chatId === "LESSON"), "the link line is there");
		assert.equal(viaRoute.coverage.length, 3, "every passage is read");
		assert.deepEqual(extractViewOf(stores.chatStore.getChat(bot)!).batches, [], "nothing left unread");
	});

	it("marks every bot line so a cleanup can find them: new nodes and link lines", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-tag", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		await submit(bot, { messageIds: first.messageIds, ...planFor(0, first.messageIds) });
		const tagged = (l: Json) => l.source === "external";
		const fromBot = (l: Json) => l.provenance.some((pt: Json) => pt.chatId === bot);
		const nodeLines = lines(read(LEDGER_FILES.nodes));
		const chainLines = lines(read(LEDGER_FILES.chains));
		assert.deepEqual(nodeLines.filter(tagged), nodeLines.filter(fromBot));
		assert.equal(nodeLines.filter(tagged).length, 2, "one new node and one link line");
		assert.deepEqual(chainLines.filter((l) => tagged(l) || fromBot(l)), [], "a bot writes no chains");
	});
});

describe("the guide's example", () => {
	it("merges once its placeholders are filled", async () => {
		resetToSeed();
		const guide = fs.readFileSync(path.join(import.meta.dirname, "..", "docs", "external-teacher.md"), "utf-8");
		const block = /### Add your findings[\s\S]*?```json\n([\s\S]*?)```/.exec(guide)?.[1];
		assert.ok(block, "the guide has a JSON example under Add your findings");
		const bot = botLessonWith("findings-guide", LESSON);
		const filled = block
			.replace('"<the batch\'s messageIds from extract-view, in any order>"', '"t1", "t2"')
			.replaceAll("<one of messageIds>", "t1")
			.replaceAll("<an n_ id from the digest>", seedId("Limit"))
			.replaceAll("<an n_ id from lh graph find>", seedId("Derivative"));
		const reply = await submit(bot, JSON.parse(filled));
		assert.equal(reply.status, 200, JSON.stringify(reply.body));
		assert.equal(reply.body.merged, true);
	});
});

// ─── reruns ─────────────────────────────────────────────────────────────────

describe("a rerun adds nothing", () => {
	it("returns alreadyRead and writes nothing when the batch's messages are read", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-rerun", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const body = { messageIds: first.messageIds, ...planFor(0, first.messageIds) };
		assert.equal((await submit(bot, body)).body.merged, true);
		const before = files();
		const again = await submit(bot, body);
		assert.equal(again.status, 200);
		assert.deepEqual(
			{ ok: again.body.ok, merged: again.body.merged, alreadyRead: again.body.alreadyRead, nodes: again.body.nodes, chains: again.body.chains, remaining: again.body.remaining },
			{ ok: true, merged: false, alreadyRead: true, nodes: 0, chains: 0, remaining: 1 },
		);
		assert.deepEqual(files(), before);
	});

	it("merges once when the same findings arrive twice at the same time", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-race", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit", statement: "A limit is the value a function approaches.", messageId: "t1" }], chains: [] },
			verdicts: { links: [{ id: "p1", linkTo: seedId("Limit") }] },
		};
		const replies = await Promise.all([submit(bot, body), submit(bot, body)]);
		assert.deepEqual(replies.map((r) => r.status), [200, 200]);
		assert.deepEqual(replies.map((r) => r.body.merged).sort(), [false, true]);
		assert.equal(lines(read(LEDGER_FILES.nodes)).filter((l) => l.provenance.some((pt: Json) => pt.chatId === bot)).length, 1);
		assert.equal(lines(read(LEDGER_FILES.coverage)).filter((e) => e.chatId === bot).length, 1);
	});
});

// ─── refusals ───────────────────────────────────────────────────────────────

describe("bad submissions are refused and write nothing", () => {
	const good = () => ({
		messageIds: ["t1", "t2"],
		findings: {
			propositions: [
				{ id: "p1", name: "Chain rule", statement: "(f∘g)' = f'(g)·g'.", aliases: [], messageId: "t1" },
				{ id: "p2", name: "Derivative", statement: "A derivative is a limit.", messageId: "t2" },
			],
			chains: [] as Json[],
		},
		verdicts: { links: [] as Json[] },
	});
	type Body = ReturnType<typeof good>;
	const cases: Array<[string, (b: Body) => unknown, number, string, RegExp]> = [
		["not an object", () => null, 400, "bad_findings", /must be a JSON object/],
		["nothing", () => ({}), 400, "bad_findings", /findings is required/],
		["an unknown top-level field", (b) => ({ ...b, batch: 1 }), 400, "bad_findings", /batch is not a field/],
		["no messageIds", (b) => ({ ...b, messageIds: [] }), 400, "bad_findings", /messageIds must be/],
		["a repeated messageId", (b) => ({ ...b, messageIds: ["t1", "t1"] }), 400, "bad_findings", /repeats/],
		["a learner message as a passage", (b) => ({ ...b, messageIds: ["u1"] }), 400, "bad_findings", /"u1" is not a teacher passage/],
		["part of the batch", (b) => ({ ...b, messageIds: ["t1"] }), 409, "stale_batch", /./],
		["a later batch", (b) => ({ ...b, messageIds: ["t3"] }), 409, "stale_batch", /./],
		["a name of the wrong type", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], name: 42 }] } }), 400, "bad_findings", /findings\.propositions\[0\]\.name/],
		["no chains field", (b) => ({ ...b, findings: { propositions: b.findings.propositions } }), 400, "bad_findings", /chains/],
		["chains that are not an array", (b) => ({ ...b, findings: { ...b.findings, chains: "none" } }), 400, "bad_findings", /findings\.chains/],
		["an unknown proposition field", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], weight: 1 }] } }), 400, "bad_findings", /weight is not a field/],
		["no messageId", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ id: "p1", name: "x", statement: "y" }] } }), 400, "bad_findings", /messageId/],
		["an anchor outside the batch", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], messageId: "t3" }] } }), 400, "bad_findings", /not a passage of THIS stretch/],
		["a repeated proposition id", (b) => ({ ...b, findings: { ...b.findings, propositions: [b.findings.propositions[0], { ...b.findings.propositions[1], id: "p1" }] } }), 400, "bad_findings", /"p1" repeats/],
		["no verdicts", (b) => ({ messageIds: b.messageIds, findings: b.findings }), 400, "bad_findings", /verdicts is required/],
		["links of the wrong type", (b) => ({ ...b, verdicts: { links: "none" } }), 400, "bad_findings", /verdicts\.links/],
		["a link to an unknown node", (b) => ({ ...b, verdicts: { links: [{ id: "p1", linkTo: "n_missing" }] } }), 400, "bad_findings", /"n_missing" is not a node/],
		["a link from an unknown proposition", (b) => ({ ...b, verdicts: { links: [{ id: "p9", linkTo: seedId("Limit") }] } }), 400, "bad_findings", /"p9" is not a proposition id/],
		["an existing node's id as a proposition id", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], id: seedId("Limit") }, b.findings.propositions[1]] } }), 400, "bad_findings", /is an existing node's id/],
		["a blank id", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], id: " " }, b.findings.propositions[1]] } }), 400, "bad_findings", /id must not be blank/],
		["a blank name", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], name: "  " }, b.findings.propositions[1]] } }), 400, "bad_findings", /name must not be blank/],
		["a blank statement", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], statement: "" }, b.findings.propositions[1]] } }), 400, "bad_findings", /statement must not be blank/],
		["a proposition linked twice", (b) => ({ ...b, verdicts: { links: [{ id: "p1", linkTo: seedId("Limit") }, { id: "p1", linkTo: seedId("Derivative") }] } }), 400, "bad_findings", /linked twice/],
	];

	it("refuses each bad body with the problem named", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-refusals", LESSON);
		const before = files();
		for (const [what, make, status, code, problem] of cases) {
			const { status: got, body } = await submit(bot, make(good()));
			assert.equal(got, status, `${what}: ${JSON.stringify(body)}`);
			assert.equal(body.ok, false, what);
			assert.equal(body.code, code, what);
			if (code === "stale_batch") assert.deepEqual(body.batch, ["t1", "t2"], `${what}: the current batch`);
			else assert.ok((body.problems as string[]).some((p) => problem.test(p)), `${what}: ${JSON.stringify(body.problems)}`);
			assert.equal(typeof body.cursor, "string", `${what}: carries the cursor`);
			assert.deepEqual(files(), before, `${what}: nothing written`);
		}
		// The good body still merges: the refusals left nothing behind.
		assert.equal((await submit(bot, good())).body.merged, true);
	});

	it("refuses unknown and ordinary lessons, and browser requests", async () => {
		const before = files();
		const missing = await submit("chat_missing", good());
		assert.deepEqual([missing.status, missing.body.code], [404, "not_found"]);
		const ordinary = await submit(ordinaryLessonWith(LESSON), good());
		assert.deepEqual([ordinary.status, ordinary.body.code], [409, "not_bot_run"]);
		const bot = botLessonWith("findings-origin", LESSON);
		const browser = await submit(bot, good(), { Origin: "http://evil.example" });
		assert.deepEqual([browser.status, browser.body.code], [403, "forbidden_origin"]);
		assert.deepEqual(files(), before);
	});
});

// ─── the audit lock ─────────────────────────────────────────────────────────

// ─── chains (ticket 32) ─────────────────────────────────────────────────────

describe("a Bot Teacher's chains are refused (ticket 32)", () => {
	it("refuses findings with a chain as chains_not_accepted, writing nothing, and merges them resent with \"chains\": []", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-chains", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const plan = planFor(0, first.messageIds);
		const withChain = { messageIds: first.messageIds, findings: { ...plan.findings, chains: [{ premises: ["p1"], conclusion: "p2" }] }, verdicts: plan.verdicts };
		const before = files();
		const revision = graphDataRevision();

		const refused = await submit(bot, withChain);
		assert.equal(refused.status, 400, JSON.stringify(refused.body));
		assert.deepEqual([refused.body.ok, refused.body.code], [false, "chains_not_accepted"]);
		assert.match(refused.body.message, /Resend the same findings with "chains": \[\]/);
		assert.equal(typeof refused.body.cursor, "string", "carries the cursor");
		assert.deepEqual(files(), before, "ledgers, coverage and layout unchanged");
		assert.equal(graphDataRevision(), revision, "an open graph view sees no change");
		assert.deepEqual(extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!.messageIds, first.messageIds, "the batch is still unread");

		// A chain is named first even when the rest of the body is bad too.
		const alsoBad = await submit(bot, { ...withChain, messageIds: [], verdicts: { links: "none" } });
		assert.deepEqual([alsoBad.status, alsoBad.body.code], [400, "chains_not_accepted"]);
		assert.deepEqual(files(), before);

		const resent = await submit(bot, { ...withChain, findings: { ...withChain.findings, chains: [] } });
		assert.equal(resent.status, 200, JSON.stringify(resent.body));
		assert.deepEqual([resent.body.merged, resent.body.nodes, resent.body.chains], [true, 1, 0]);
	});

	it("leaves LearnHarness's own extraction writing chains", async () => {
		resetToSeed();
		const ordinary = ordinaryLessonWith(SHORT);
		const pipeline = createExtractionPipeline({
			...stores,
			engineFor: (role) =>
				role === "extractor"
					? fauxEngine(submitCall("submit_findings", {
						propositions: [{ id: "p1", name: "Continuity", statement: "A function is continuous where its limit equals its value.", aliases: [], messageId: "t1" }],
						chains: [{ premises: [seedId("Limit")], conclusion: "p1" }],
					}))
					: fauxEngine(submitCall("submit_review", { links: [] })),
		});
		const stats = await pipeline.runExtraction(ordinary);
		assert.equal(stats.chains, 1);
		const written = lines(read(LEDGER_FILES.chains)).filter((l) => l.provenance.some((pt: Json) => pt.chatId === ordinary));
		assert.equal(written.length, 1);
		assert.equal(written[0]!.source, undefined, "untagged: LearnHarness wrote it");
	});
});

// ─── the count line ─────────────────────────────────────────────────────────

describe("the count line for the learner", () => {
	it("matches lh graph sessions and the links sent, batch after batch and on a rerun", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-count", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const r1 = await submit(bot, { messageIds: first.messageIds, ...planFor(0, first.messageIds) });
		assert.equal(r1.status, 200, JSON.stringify(r1.body));
		assert.deepEqual([r1.body.newFacts, r1.body.linkedFacts], [1, 1]);
		assert.equal(r1.body.learnerLine, "This lesson added 1 new fact to your graph and linked 1 to facts it already had.");

		// Batch 2 adds a fact and links one to the fact batch 1 added.
		const second = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const plan = planFor(1, second.messageIds);
		const chainRule = getGraph(stores.graphStore).nodes.find((n) => n.name === "Chain rule")!.id;
		plan.findings.propositions.push({ id: "p2", name: "Chain rule", statement: "Differentiate the outer function, then multiply by the inner's derivative.", aliases: [], messageId: second.messageIds[0] });
		plan.verdicts.links.push({ id: "p2", linkTo: chainRule });
		const body2 = { messageIds: second.messageIds, ...plan };
		const r2 = await submit(bot, body2);
		assert.equal(r2.status, 200, JSON.stringify(r2.body));
		assert.equal(r2.body.remaining, 0);
		assert.deepEqual([r2.body.newFacts, r2.body.linkedFacts], [2, 2]);
		assert.equal(r2.body.learnerLine, "This lesson added 2 new facts to your graph and linked 2 to facts it already had.");

		const sessions = (await (await listGraphSessions()).json()) as Json;
		assert.equal(sessions.sessions.find((s: Json) => s.id === bot).propositions, r2.body.newFacts, "the new count is lh graph sessions' propositions");
		assert.equal(r2.body.linkedFacts, r1.body.linkedFacts + plan.verdicts.links.length, "the linked count is every links entry sent");

		// A resend after a lost reply carries the same line.
		const again = await submit(bot, body2);
		assert.deepEqual([again.body.alreadyRead, again.body.learnerLine], [true, r2.body.learnerLine]);
	});

	it("says the lesson added nothing when it did", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-count-none", SHORT);
		const reply = await submit(bot, { messageIds: ["t1"], findings: { propositions: [], chains: [] }, verdicts: { links: [] } });
		assert.equal(reply.status, 200, JSON.stringify(reply.body));
		assert.deepEqual([reply.body.newFacts, reply.body.linkedFacts], [0, 0]);
		assert.equal(reply.body.learnerLine, "This lesson added no new facts to your graph.");
	});
});

describe("the route shares the pipeline's audit lock", () => {
	it("waits while a LearnHarness audit holds it, and gives up with graph_busy, writing nothing", async () => {
		resetToSeed();
		const ordinary = ordinaryLessonWith(SHORT);
		const bot = botLessonWith("findings-lock", SHORT);
		let auditing!: () => void;
		const auditStarted = new Promise<void>((resolve) => (auditing = resolve));
		let finishAudit!: () => void;
		const auditMayFinish = new Promise<void>((resolve) => (finishAudit = resolve));
		const pipeline = createExtractionPipeline({
			...stores,
			engineFor: (role) =>
				role === "extractor"
					? fauxEngine(() =>
						submitCall("submit_findings", {
							propositions: [{ id: "p1", name: "Limit (pipeline)", statement: "A limit is approached.", messageId: "t1" }],
							chains: [],
						}),
					)
					: fauxEngine(async () => {
						auditing();
						await auditMayFinish;
						return submitCall("submit_review", { links: [] });
					}),
		});
		const run = pipeline.runExtraction(ordinary);
		await auditStarted;
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (bot)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		const wait = findingsLockWaitMs.current;
		try {
			findingsLockWaitMs.current = 100;
			const before = files();
			const busy = await submit(bot, body);
			assert.deepEqual([busy.status, busy.body.code], [503, "graph_busy"]);
			assert.deepEqual(files(), before, "a busy refusal writes nothing");

			findingsLockWaitMs.current = 20_000;
			let settled = false;
			const pending = submit(bot, body).finally(() => (settled = true));
			await new Promise((resolve) => setTimeout(resolve, 150));
			assert.equal(settled, false, "the route waits behind the audit, and behind the waiter that gave up");
			finishAudit();
			await run;
			const merged = await pending;
			assert.equal(merged.status, 200, JSON.stringify(merged.body));
			assert.equal(merged.body.merged, true);
		} finally {
			findingsLockWaitMs.current = wait;
			finishAudit();
		}
		const names = lines(read(LEDGER_FILES.nodes)).map((l) => l.name);
		assert.ok(names.indexOf("Limit (pipeline)") < names.indexOf("Limit (bot)"), `the pipeline merged first: ${names.join(", ")}`);
	});

	it("keeps waiting for a running audit when a pipeline job queued between them is aborted", async () => {
		resetToSeed();
		const first = ordinaryLessonWith(SHORT);
		const queued = ordinaryLessonWith(SHORT);
		const bot = botLessonWith("findings-lock-abort", SHORT);
		let auditing!: () => void;
		const auditStarted = new Promise<void>((resolve) => (auditing = resolve));
		let finishAudit!: () => void;
		const auditMayFinish = new Promise<void>((resolve) => (finishAudit = resolve));
		const pipelineFor = (name: string, audit: () => Promise<void>) =>
			createExtractionPipeline({
				...stores,
				engineFor: (role) =>
					role === "extractor"
						? fauxEngine(() =>
							submitCall("submit_findings", {
								propositions: [{ id: "p1", name, statement: "A limit is approached.", messageId: "t1" }],
								chains: [],
							}),
						)
						: fauxEngine(async () => {
							await audit();
							return submitCall("submit_review", { links: [] });
						}),
			});
		const run = pipelineFor("Limit (first)", async () => {
			auditing();
			await auditMayFinish;
		}).runExtraction(first);
		await auditStarted;
		// A second pipeline job, extracted and waiting for the audit lock.
		const queuedRun = pipelineFor("Limit (queued)", async () => {}).runExtraction(queued);
		for (let i = 0; i < 200 && !extractionStatuses().some((r) => r.chatId === queued && r.phase === "waiting"); i++) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.ok(extractionStatuses().some((r) => r.chatId === queued && r.phase === "waiting"), "the second job waits for the lock");
		let settled = false;
		const pending = submit(bot, {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (bot)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		}).finally(() => (settled = true));
		try {
			await new Promise((resolve) => setTimeout(resolve, 20));
			assert.equal(abortExtraction(queued), true);
			await queuedRun;
			await new Promise((resolve) => setTimeout(resolve, 150));
			assert.equal(settled, false, "the route still waits for the first audit");
			assert.deepEqual(lines(read(LEDGER_FILES.nodes)).filter((l) => l.source === "external"), [], "nothing merged during the audit");
		} finally {
			finishAudit();
		}
		await run;
		const merged = await pending;
		assert.equal(merged.body.merged, true, JSON.stringify(merged.body));
		const names = lines(read(LEDGER_FILES.nodes)).map((l) => l.name);
		assert.ok(names.indexOf("Limit (first)") < names.indexOf("Limit (bot)"), names.join(", "));
		assert.ok(!names.includes("Limit (queued)"), "the aborted job merged nothing");
	});
});

describe("a failed layout write after the merge", () => {
	it("still reports the merge, which a resend would only see as alreadyRead", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-layout", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (layout)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		// The positions file becomes a directory, so the settle's rename fails.
		fs.rmSync(POSITIONS_FILE, { force: true });
		fs.mkdirSync(path.join(POSITIONS_FILE, "blocker"), { recursive: true });
		try {
			const reply = await submit(bot, body);
			assert.equal(reply.status, 200, JSON.stringify(reply.body));
			assert.equal(reply.body.merged, true);
			assert.equal(lines(read(LEDGER_FILES.coverage)).filter((e) => e.chatId === bot).length, 1);
		} finally {
			fs.rmSync(POSITIONS_FILE, { recursive: true, force: true });
		}
	});
});

describe("an open graph view", () => {
	it("sees the graph's revision move after a bot merge, with no run row to announce it", async () => {
		const statusRoute = await import("../app/api/graph/status/route.ts");
		const status = async () => (await (await statusRoute.GET()).json()) as { runs: unknown[]; graphDataRevision: number };
		resetToSeed();
		const bot = botLessonWith("findings-revision", SHORT);
		const before = await status();
		// mtime-based: let the clock pass the seed's write.
		await new Promise((resolve) => setTimeout(resolve, 20));
		const reply = await submit(bot, {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (revision)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		});
		assert.equal(reply.body.merged, true);
		const after = await status();
		assert.deepEqual([before.runs, after.runs], [[], []], "no run row comes or goes");
		assert.notEqual(after.graphDataRevision, before.graphDataRevision, "the revision the view compares moved");
		// The view's own position commit is not a data change.
		await new Promise((resolve) => setTimeout(resolve, 20));
		stores.graphStore.writePositions({ n_any: { x: 1, y: 2 } });
		assert.equal((await status()).graphDataRevision, after.graphDataRevision, "a position commit does not move it");
	});

	it("sees the revision move even when another ledger's modification time is in the future", async () => {
		const statusRoute = await import("../app/api/graph/status/route.ts");
		const status = async () => (await (await statusRoute.GET()).json()) as { runs: unknown[]; graphDataRevision: number };
		resetToSeed();
		const bot = botLessonWith("findings-revision-future", SHORT);
		// A bot merge never writes sessions.jsonl; a clock step back leaves it ahead.
		if (!fs.existsSync(LEDGER_FILES.sessions)) fs.writeFileSync(LEDGER_FILES.sessions, "");
		const future = new Date(Date.now() + 3_600_000);
		fs.utimesSync(LEDGER_FILES.sessions, future, future);
		try {
			const before = await status();
			await new Promise((resolve) => setTimeout(resolve, 20));
			const reply = await submit(bot, {
				messageIds: ["t1"],
				findings: { propositions: [{ id: "p1", name: "Limit (future)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
				verdicts: { links: [] },
			});
			assert.equal(reply.body.merged, true);
			assert.notEqual((await status()).graphDataRevision, before.graphDataRevision);
		} finally {
			fs.utimesSync(LEDGER_FILES.sessions, new Date(), new Date());
		}
	});

	it("answers the status read when a ledger disappears as it is read", async () => {
		const statusRoute = await import("../app/api/graph/status/route.ts");
		resetToSeed();
		assert.ok(fs.existsSync(LEDGER_FILES.nodes));
		// The file is there when checked and gone when stat'd: statSync behaves
		// as it does for a missing path.
		const realStat = fs.statSync;
		const gone = (file: fs.PathLike, options?: { throwIfNoEntry?: boolean }) => {
			if (String(file) !== LEDGER_FILES.nodes) return (realStat as (f: fs.PathLike, o?: object) => fs.Stats)(file, options);
			if (options?.throwIfNoEntry === false) return undefined;
			throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${String(file)}'`), { code: "ENOENT" });
		};
		(fs as { statSync: unknown }).statSync = gone;
		syncBuiltinESMExports();
		try {
			const res = await statusRoute.GET();
			assert.equal(res.status, 200);
			assert.equal(typeof ((await res.json()) as { graphDataRevision: unknown }).graphDataRevision, "number");
		} finally {
			(fs as { statSync: unknown }).statSync = realStat;
			syncBuiltinESMExports();
		}
	});

	it("gets the graph with the stamp status returns, so a merge during the first load is not missed (ticket 31)", async () => {
		const statusRoute = await import("../app/api/graph/status/route.ts");
		const graphRoute = await import("../app/api/graph/route.ts");
		type Stamped = { graphDataRevision: number; nodes: Array<{ name: string }> };
		const graph = async () => (await (await graphRoute.GET()).json()) as Stamped;
		const status = async () => ((await (await statusRoute.GET()).json()) as { graphDataRevision: number }).graphDataRevision;
		resetToSeed();
		const bot = botLessonWith("findings-first-load", SHORT);
		const first = await graph();
		assert.equal(typeof first.graphDataRevision, "number");
		assert.equal(first.graphDataRevision, await status(), "a graph read and a status read with no write between agree");
		await new Promise((resolve) => setTimeout(resolve, 20));
		const reply = await submit(bot, {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (first load)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		});
		assert.equal(reply.body.merged, true);
		assert.notEqual(await status(), first.graphDataRevision, "the view sees its snapshot is older than the merge");
		const second = await graph();
		assert.equal(second.graphDataRevision, await status(), "the refetched snapshot carries the merged stamp");
		assert.ok(second.nodes.some((n) => n.name === "Limit (first load)"));
		assert.ok(!first.nodes.some((n) => n.name === "Limit (first load)"));
	});
});

describe("the graph master switch", () => {
	it("refuses findings with graph_disabled while the learner has the graph off, writing nothing", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-switch", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (switch)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		const saved = stores.settingsStore.readSettings();
		stores.settingsStore.writeSettings({ version: 1, graph: { enabled: false } });
		try {
			const before = files();
			const off = await submit(bot, body);
			assert.deepEqual([off.status, off.body.code], [409, "graph_disabled"]);
			assert.equal(typeof off.body.cursor, "string");
			assert.deepEqual(files(), before);
		} finally {
			stores.settingsStore.writeSettings(saved ?? { version: 1 });
		}
		assert.equal((await submit(bot, body)).body.merged, true, "merges once the graph is back on");
	});

	it("refuses a request that waited for the lock while the graph was switched off", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-switch-wait", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (switch wait)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		const saved = stores.settingsStore.readSettings();
		// Hold the audit lock the way a running audit does.
		const g = globalThis as typeof globalThis & { __lhAuditLock?: { tail: Promise<void> } };
		const lock = (g.__lhAuditLock ??= { tail: Promise.resolve() });
		const prev = lock.tail;
		let releaseHolder!: () => void;
		lock.tail = new Promise<void>((resolve) => (releaseHolder = resolve));
		await prev;
		try {
			const before = files();
			const pending = submit(bot, body);
			await new Promise((resolve) => setTimeout(resolve, 50));
			stores.settingsStore.writeSettings({ version: 1, graph: { enabled: false } });
			releaseHolder();
			const off = await pending;
			assert.deepEqual([off.status, off.body.code], [409, "graph_disabled"]);
			assert.deepEqual(files(), before);
		} finally {
			releaseHolder();
			stores.settingsStore.writeSettings(saved ?? { version: 1 });
		}
	});

	// A settings file that exists but cannot be read says nothing about the
	// switch, so the route refuses rather than reading it as on.
	const unreadable: Array<[string, () => void]> = [
		["a file that is not JSON", () => fs.writeFileSync(SETTINGS_FILE, "{ graph: off")],
		["a JSON array", () => fs.writeFileSync(SETTINGS_FILE, "[]")],
		["a graph section that is not an object", () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ version: 1, graph: "off" }))],
		["a switch that is not true or false", () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ version: 1, graph: { enabled: "no" } }))],
		["a path that is a directory", () => fs.mkdirSync(SETTINGS_FILE)],
		["a link to a missing file", () => fs.symlinkSync(path.join(path.dirname(SETTINGS_FILE), "missing-settings.json"), SETTINGS_FILE)],
	];
	for (const [label, corrupt] of unreadable) {
		it(`refuses findings with settings_unreadable for ${label}, writing nothing`, async () => {
			resetToSeed();
			const bot = botLessonWith(`findings-settings-${label.replaceAll(" ", "-")}`, SHORT);
			const body = {
				messageIds: ["t1"],
				findings: { propositions: [{ id: "p1", name: `Limit (${label})`, statement: "A limit is approached.", messageId: "t1" }], chains: [] },
				verdicts: { links: [] },
			};
			const saved = stores.settingsStore.readSettings();
			fs.rmSync(SETTINGS_FILE, { force: true });
			corrupt();
			try {
				const before = files();
				const refused = await submit(bot, body);
				assert.deepEqual([refused.status, refused.body.code], [500, "settings_unreadable"]);
				assert.equal(typeof refused.body.cursor, "string");
				assert.deepEqual(files(), before);
			} finally {
				fs.rmSync(SETTINGS_FILE, { force: true, recursive: true });
				stores.settingsStore.writeSettings(saved ?? { version: 1 });
			}
		});
	}

	it("refuses a request whose settings file became unreadable while it waited for the lock", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-settings-wait", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (settings wait)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		const saved = stores.settingsStore.readSettings();
		const g = globalThis as typeof globalThis & { __lhAuditLock?: { tail: Promise<void> } };
		const lock = (g.__lhAuditLock ??= { tail: Promise.resolve() });
		const prev = lock.tail;
		let releaseHolder!: () => void;
		lock.tail = new Promise<void>((resolve) => (releaseHolder = resolve));
		await prev;
		try {
			const before = files();
			const pending = submit(bot, body);
			await new Promise((resolve) => setTimeout(resolve, 50));
			fs.writeFileSync(SETTINGS_FILE, "not json");
			releaseHolder();
			const refused = await pending;
			assert.deepEqual([refused.status, refused.body.code], [500, "settings_unreadable"]);
			assert.deepEqual(files(), before);
		} finally {
			releaseHolder();
			stores.settingsStore.writeSettings(saved ?? { version: 1 });
		}
	});

	it("reads a missing settings file as the factory default, graph on", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-settings-missing", SHORT);
		const body = {
			messageIds: ["t1"],
			findings: { propositions: [{ id: "p1", name: "Limit (no settings)", statement: "A limit is approached.", messageId: "t1" }], chains: [] },
			verdicts: { links: [] },
		};
		const saved = stores.settingsStore.readSettings();
		fs.rmSync(SETTINGS_FILE, { force: true });
		try {
			assert.equal((await submit(bot, body)).body.merged, true);
		} finally {
			stores.settingsStore.writeSettings(saved ?? { version: 1 });
		}
	});
});
