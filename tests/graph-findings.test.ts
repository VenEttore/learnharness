/**
 * BOT FINDINGS INTO THE GRAPH (fork, ADR 0001; external-teacher ticket 29).
 * POST /api/external/chats/:id/findings takes the extractor's and the
 * auditor's output from a Bot Teacher and writes it the way LearnHarness's
 * own pipeline does:
 *
 *   parity    the same findings through the route and through the real
 *             pipeline (scripted models) leave the same ledgers, apart
 *             from the source tag, ids and timestamps
 *   refusals  bad shapes and stale batches are refused and write nothing
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
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type ToolCall } from "@earendil-works/pi-ai";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-graph-findings-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { LEDGER_FILES, POSITIONS_FILE } = await import("../config.ts");
const { createExtractionPipeline } = await import("../src/agent/subagents/extraction.ts");
const { getGraph, mergeFindings } = await import("../src/core/graph.ts");
const { stores } = await import("../src/server/stores.ts");
const { extractViewOf, unreadBatches } = await import("../src/server/graph-reads.ts");
const { findingsLockWaitMs } = await import("../src/server/graph-findings.ts");
const findingsRoute = await import("../app/api/external/chats/[id]/findings/route.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;
type LhMessage = import("../src/core/native-messages.ts").LhMessage;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** A route call must not reach a model: no fetch at all while it runs. */
async function submit(id: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Json }> {
	const real = globalThis.fetch;
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
		globalThis.fetch = real;
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

/** What an extractor and an auditor would send for batch `i`: new ideas, a
 *  link to a seed node, a chain the simplification drops, and in batch 2 a
 *  chain from an idea batch 1 added (by its id in the graph now). */
function planFor(i: number, messageIds: string[]): { findings: Json; verdicts: Json } {
	if (i === 0) {
		return {
			findings: {
				propositions: [
					{ id: "p1", name: "Chain rule", statement: "(f∘g)' = f'(g)·g'.", aliases: ["composition rule"], messageId: messageIds[0] },
					{ id: "p2", name: "Derivative", statement: "A derivative is the limit of difference quotients.", messageId: messageIds[1] },
				],
				chains: [
					{ premises: ["p1"], conclusion: "p2" },
					{ premises: ["p1", seedId("Limit")], conclusion: "p2" },
				],
			},
			verdicts: { links: [{ id: "p2", linkTo: seedId("Derivative") }] },
		};
	}
	const chainRule = getGraph(stores.graphStore).nodes.find((n) => n.name === "Chain rule")!.id;
	return {
		findings: {
			propositions: [{ id: "p1", name: "Quotient rule", statement: "(f/g)' = (f'g − fg')/g².", aliases: [], messageId: messageIds[0] }],
			chains: [{ premises: [chainRule, seedId("Limit")], conclusion: "p1" }],
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
		assert.deepEqual(stats, { nodes: 2, chains: 3, droppedChains: 1 }, "batch 1 appends two chains and drops one; batch 2 appends one");
		const viaPipeline = normalized(files(), ordinary, false);
		assert.ok(viaPipeline.positions.length > 0, "the layout settled");

		// Run 2: the same messages in a bot-run lesson, through the route.
		resetToSeed();
		const bot = botLessonWith("findings-parity", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		const r1 = await submit(bot, { messageIds: first.messageIds, ...planFor(0, first.messageIds) });
		assert.equal(r1.status, 200, JSON.stringify(r1.body));
		assert.equal(r1.body.merged, true);
		assert.deepEqual([r1.body.nodes, r1.body.chains, r1.body.droppedChains, r1.body.remaining], [1, 2, 1, 1]);
		assert.deepEqual(r1.body.read, ["t1", "t2"]);
		const second = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		assert.deepEqual(second.messageIds, ["t3"]);
		const r2 = await submit(bot, { messageIds: second.messageIds, ...planFor(1, second.messageIds) });
		assert.equal(r2.status, 200, JSON.stringify(r2.body));
		assert.deepEqual([r2.body.merged, r2.body.nodes, r2.body.chains, r2.body.remaining], [true, 1, 1, 0]);
		const viaRoute = normalized(files(), bot, true);

		assert.deepEqual(viaRoute, viaPipeline);
		assert.ok(viaRoute.nodes.some((n: Json) => n.id === seedId("Derivative") && n.provenance[0].chatId === "LESSON"), "the link line is there");
		assert.equal(viaRoute.coverage.length, 3, "every passage is read");
		assert.deepEqual(extractViewOf(stores.chatStore.getChat(bot)!).batches, [], "nothing left unread");
	});

	it("marks every bot line so a cleanup can find them: new nodes, link lines and chains", async () => {
		resetToSeed();
		const bot = botLessonWith("findings-tag", LESSON);
		const first = extractViewOf(stores.chatStore.getChat(bot)!).batches[0]!;
		await submit(bot, { messageIds: first.messageIds, ...planFor(0, first.messageIds) });
		const tagged = (l: Json) => l.source === "external";
		const fromBot = (l: Json) => l.provenance.some((pt: Json) => pt.chatId === bot);
		const nodeLines = lines(read(LEDGER_FILES.nodes));
		const chainLines = lines(read(LEDGER_FILES.chains));
		assert.deepEqual(nodeLines.filter(tagged), nodeLines.filter(fromBot));
		assert.deepEqual(chainLines.filter(tagged), chainLines.filter(fromBot));
		assert.equal(nodeLines.filter(tagged).length, 2, "one new node and one link line");
		assert.equal(chainLines.filter(tagged).length, 1, "the chain the simplification kept");
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
			chains: [{ premises: ["p1"], conclusion: "p2" }],
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
		["no chains", (b) => ({ ...b, findings: { propositions: b.findings.propositions } }), 400, "bad_findings", /chains/],
		["an unknown proposition field", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], weight: 1 }] } }), 400, "bad_findings", /weight is not a field/],
		["no messageId", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ id: "p1", name: "x", statement: "y" }] } }), 400, "bad_findings", /messageId/],
		["an anchor outside the batch", (b) => ({ ...b, findings: { ...b.findings, propositions: [{ ...b.findings.propositions[0], messageId: "t3" }] } }), 400, "bad_findings", /not a passage of THIS stretch/],
		["an unknown chain endpoint", (b) => ({ ...b, findings: { ...b.findings, chains: [{ premises: ["p9"], conclusion: "p2" }] } }), 400, "bad_findings", /"p9" is neither/],
		["a conclusion that is its own premise", (b) => ({ ...b, findings: { ...b.findings, chains: [{ premises: ["p1", "p2"], conclusion: "p2" }] } }), 400, "bad_findings", /its own premise/],
		["no premises", (b) => ({ ...b, findings: { ...b.findings, chains: [{ premises: [], conclusion: "p2" }] } }), 400, "bad_findings", /premises/],
		["a repeated proposition id", (b) => ({ ...b, findings: { ...b.findings, propositions: [b.findings.propositions[0], { ...b.findings.propositions[1], id: "p1" }] } }), 400, "bad_findings", /"p1" repeats/],
		["no verdicts", (b) => ({ messageIds: b.messageIds, findings: b.findings }), 400, "bad_findings", /verdicts is required/],
		["links of the wrong type", (b) => ({ ...b, verdicts: { links: "none" } }), 400, "bad_findings", /verdicts\.links/],
		["a link to an unknown node", (b) => ({ ...b, verdicts: { links: [{ id: "p1", linkTo: "n_missing" }] } }), 400, "bad_findings", /"n_missing" is not a node/],
		["a link from an unknown proposition", (b) => ({ ...b, verdicts: { links: [{ id: "p9", linkTo: seedId("Limit") }] } }), 400, "bad_findings", /"p9" is not a proposition id/],
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
});
