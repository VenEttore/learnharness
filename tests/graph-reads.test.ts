/**
 * GRAPH READS FOR lh (fork, ADR 0001; external-teacher ticket 28). The Bot
 * Teacher reads what LearnHarness's extractor and auditor read:
 *
 *   extract-view   the same prompt the extractor model gets, checked against
 *                  the real pipeline's captured prompt, batch by batch
 *   graph routes   the same results as the auditor's and prober's
 *                  in-process tools over the same graph
 *
 * and no read calls a model or the network. Runs under an isolated
 * LH_DATA_DIR (never the home graph); every app-module import is dynamic so
 * the seam is set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type ToolCall } from "@earendil-works/pi-ai";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-graph-reads-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { createExtractionPipeline } = await import("../src/agent/subagents/extraction.ts");
const { prepareAuditorReview, proberGraphTools } = await import("../src/agent/tools/graph.ts");
const { graphSessionIndex } = await import("../src/core/graph.ts");
const { coverageSlots } = await import("../src/core/coverage.ts");
const { stores } = await import("../src/server/stores.ts");
const { extractViewOf } = await import("../src/server/graph-reads.ts");
const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const extractViewRoute = await import("../app/api/external/chats/[id]/extract-view/route.ts");
const sessionsRoute = await import("../app/api/external/graph/sessions/route.ts");
const propositionsRoute = await import("../app/api/external/graph/sessions/[id]/propositions/route.ts");
const findRoute = await import("../app/api/external/graph/find/route.ts");
type PiEngine = import("../src/agent/models.ts").PiEngine;
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type GraphNode = import("../src/core/contracts/graph.ts").GraphNode;
type AgentTool = import("@earendil-works/pi-agent-core").AgentTool<any>;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
	new Request(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
async function json(res: Response): Promise<{ status: number; body: Json }> {
	return { status: res.status, body: (await res.json()) as Json };
}

const extractView = async (id: string) => json(await extractViewRoute.GET(new Request(`http://test/api/external/chats/${id}/extract-view`), ctx(id)));
const sessions = async () => json(await sessionsRoute.GET(new Request("http://test/api/external/graph/sessions")));
const propositions = async (id: string) =>
	json(await propositionsRoute.GET(new Request(`http://test/api/external/graph/sessions/${id}/propositions`), ctx(id)));
const find = async (body: unknown) => json(await findRoute.POST(post("http://test/api/external/graph/find", body)));

/** A read must not reach a model: no fetch at all while it runs (a model
 *  call is an HTTP call, and no model is configured in this data dir). */
async function withoutNetwork<T>(read: () => Promise<T>): Promise<T> {
	const real = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = (async () => {
		calls++;
		throw new Error("a graph read reached the network");
	}) as typeof fetch;
	try {
		const out = await read();
		assert.equal(calls, 0, "no network call");
		return out;
	} finally {
		globalThis.fetch = real;
	}
}

async function toolText(tool: AgentTool, input: unknown): Promise<string> {
	const result = await tool.execute("test", input);
	const part = result.content[0];
	return part?.type === "text" ? part.text : "";
}

const graphDeps = () => ({ chatStore: stores.chatStore, graphStore: stores.graphStore });

// ─── the extraction view ────────────────────────────────────────────────────

let n = 0;
const teacher = (text: string) =>
	({ id: `t${++n}`, role: "assistant", content: [{ type: "text", text }], timestamp: Date.now() }) as unknown as LhMessage;
const learner = (text: string) => ({ id: `u${++n}`, role: "user", content: text, timestamp: Date.now() }) as unknown as LhMessage;

const LESSON = [
	learner("teach me derivatives"),
	teacher("A derivative measures the instantaneous rate of change of a function at a point."),
	learner("ok"),
	teacher("The chain rule differentiates a composition: (f∘g)' = f'(g)·g'."),
	teacher("The product rule: (fg)' = f'g + fg'. It follows from the definition of the derivative as a limit."),
	teacher("The quotient rule follows from the product rule and the chain rule together."),
];

function fauxEngine(step: Parameters<ReturnType<typeof createFauxCore>["setResponses"]>[0][number]): PiEngine {
	const faux = createFauxCore({});
	faux.setResponses([step]);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

function lastUserText(context: unknown): string {
	const messages = (context as { messages?: { role: string; content: unknown }[] }).messages ?? [];
	const last = [...messages].reverse().find((m) => m.role === "user");
	return typeof last?.content === "string" ? last.content : "";
}

describe("extract-view is the extractor's view", () => {
	it("matches the prompt the extractor model gets, batch after batch, and the anchors it accepts", async () => {
		// An ordinary lesson, so the real pipeline runs its extractor on it.
		const chat = stores.chatStore.createChat("Derivatives");
		stores.chatStore.saveMessages(chat.id, LESSON);
		const CHUNK = 30; // several batches
		const expected = extractViewOf(stores.chatStore.getChat(chat.id)!, CHUNK);
		assert.ok(expected.batches.length >= 3, `want several batches, got ${expected.batches.length}`);
		assert.equal(expected.digest, "", "nothing extracted yet");
		assert.equal(expected.prompt, expected.batches[0]!.view);

		const prompts: string[] = [];
		const views: Array<ReturnType<typeof extractViewOf>> = [];
		const pipeline = createExtractionPipeline({
			...stores,
			getChunkTokens: () => CHUNK,
			engineFor: (role) =>
				role === "extractor"
					? fauxEngine((context) => {
						const prompt = lastUserText(context);
						prompts.push(prompt);
						// What lh extract-view reads at this moment: earlier
						// batches are merged and covered.
						const view = extractViewOf(stores.chatStore.getChat(chat.id)!, CHUNK);
						views.push(view);
						const anchor = view.batches[0]!.messageIds[0]!;
						return fauxAssistantMessage(
							[fauxToolCall("submit_findings", {
								propositions: [{ id: "p1", name: `idea ${prompts.length}`, statement: `statement ${prompts.length}`, aliases: [], messageId: anchor }],
								chains: [],
							} as unknown as ToolCall["arguments"])],
							{ stopReason: "toolUse" },
						);
					})
					: fauxEngine(() =>
						fauxAssistantMessage([fauxToolCall("submit_review", { links: [] } as unknown as ToolCall["arguments"])], { stopReason: "toolUse" }),
					),
		});
		const stats = await pipeline.runExtraction(chat.id);

		assert.equal(prompts.length, expected.batches.length, "one extractor call per batch");
		assert.equal(stats.nodes, prompts.length, "every finding anchored to a view messageId merged");
		for (const [i, prompt] of prompts.entries()) {
			assert.equal(views[i]!.prompt, prompt, `batch ${i + 1}: extract-view's prompt is the extractor's prompt`);
			assert.equal(views[i]!.batches[0]!.view, expected.batches[i]!.view);
			assert.deepEqual(views[i]!.batches[0]!.messageIds, expected.batches[i]!.messageIds);
		}
		assert.ok(views.at(-1)!.digest.includes("idea 1"), "later batches carry what the lesson already added");
		const done = extractViewOf(stores.chatStore.getChat(chat.id)!, CHUNK);
		assert.deepEqual(done.batches, [], "nothing unread once every batch merged");
		assert.equal(done.prompt, null);
		assert.ok(done.digest.includes(`idea ${prompts.length}`));
	});

	it("shows a bot-run lesson's teacher text, without a model or the network", async () => {
		const created = await json(await createRoute.POST(post("http://test/api/external/chats", { title: "Bayes", key: "graph-reads-1", prompt: "Teach me Bayes" })));
		const id = created.body.id as string;
		const said = await json(await turnRoute.POST(
			post(`http://test/api/external/chats/${id}/turn`, { kind: "say", after: created.body.cursor, text: "Bayes' rule turns P(B|A) into P(A|B) using the priors." }),
			ctx(id),
		));
		assert.equal(said.status, 200, JSON.stringify(said.body));
		const saidId = stores.chatStore.getChat(id)!.messages.at(-1)!.id;

		const { status, body } = await withoutNetwork(() => extractView(id));
		assert.equal(status, 200);
		assert.equal(body.ok, true);
		assert.equal(body.digest, "");
		assert.equal(body.batches.length, 1);
		assert.deepEqual(body.batches[0].messageIds, [saidId]);
		assert.equal(body.batches[0].view, `# Bayes\n\nTEACHER [${saidId}] Bayes' rule turns P(B|A) into P(A|B) using the priors.`);
		assert.equal(body.prompt, body.batches[0].view);
		assert.ok(!body.prompt.includes("Teach me Bayes"), "learner text is not teacher text");
		assert.deepEqual(body, { ok: true, lesson: id, ...extractViewOf(stores.chatStore.getChat(id)!) });

		// A covered message drops out, as it does for the extractor.
		const slot = coverageSlots(stores.chatStore.getChat(id)!.messages).find((s) => s.message.id === saidId)!;
		stores.graphStore.appendCoverage({ chatId: id, fp: slot.fp, tokens: slot.tokens, foldedAt: new Date().toISOString() });
		const after = await extractView(id);
		assert.deepEqual(after.body.batches, []);
		assert.equal(after.body.uncoveredCount, 0);
	});

	it("refuses an ordinary lesson and an unknown one", async () => {
		const chat = stores.chatStore.createChat("Ordinary");
		assert.deepEqual(await extractView(chat.id), { status: 409, body: { ok: false, code: "not_bot_run" } });
		assert.deepEqual(await extractView("nope"), { status: 404, body: { ok: false, code: "not_found" } });
	});

	it("every read refuses a browser origin", async () => {
		const origin = { origin: "http://evil.example" };
		const replies = [
			await extractViewRoute.GET(new Request("http://test/x", { headers: origin }), ctx("x")),
			await sessionsRoute.GET(new Request("http://test/x", { headers: origin })),
			await propositionsRoute.GET(new Request("http://test/x", { headers: origin }), ctx("x")),
			await findRoute.POST(post("http://test/x", { propositions: [{ id: "q", name: "x" }] }, origin)),
		];
		for (const res of replies) assert.deepEqual(await json(res), { status: 403, body: { ok: false, code: "forbidden_origin" } });
	});
});

// ─── the graph tools ────────────────────────────────────────────────────────

describe("lh graph reads match the in-process tools", () => {
	// A graph of two sessions: a lesson with seven matching ideas (more than
	// one page of candidates) and an imported notes source.
	const lessonChat = stores.chatStore.createChat("Vectors lesson");
	const node = (id: string, name: string, statement: string, chatId: string, aliases: string[] = []): GraphNode => ({
		id, name, statement, aliases, createdAt: "2026-11-01T00:00:00.000Z", provenance: [{ chatId, messageId: "" }],
	});
	const seeded = [
		...Array.from({ length: 7 }, (_, i) => node(`n_vec${i}`, `Vector fact ${i}`, `A vector space axiom number ${i} about vector addition.`, lessonChat.id)),
		node("n_mat", "Matrix", "A matrix represents a linear map between vector spaces.", lessonChat.id, ["linear map table"]),
		node("n_vim", "Normal mode", "Vim starts in Normal mode, where keys are commands.", "src_vimnotes"),
	];
	for (const s of seeded) stores.graphStore.appendNode(s);

	it("graph sessions: the session index and both tools' text", async () => {
		const deps = graphDeps();
		const { status, body } = await withoutNetwork(sessions);
		assert.equal(status, 200);
		assert.deepEqual(body.sessions, JSON.parse(JSON.stringify(graphSessionIndex(deps))));
		assert.ok(body.sessions.some((s: Json) => s.id === lessonChat.id && s.propositions === 8));
		assert.equal(body.auditorText, await toolText(prepareAuditorReview(deps).tools.list_sessions!, {}));
		assert.equal(body.proberText, await toolText(proberGraphTools(deps).list_sessions!, {}));
	});

	it("graph propositions: one session's ideas with statements, and both tools' text", async () => {
		const deps = graphDeps();
		const { status, body } = await withoutNetwork(() => propositions(lessonChat.id));
		assert.equal(status, 200);
		assert.equal(body.propositions.length, 8);
		assert.deepEqual(body.propositions.find((p: Json) => p.nodeId === "n_mat"), {
			nodeId: "n_mat", name: "Matrix", statement: "A matrix represents a linear map between vector spaces.", aliases: ["linear map table"],
		});
		assert.equal(body.auditorText, await toolText(prepareAuditorReview(deps).tools.list_propositions!, { session: lessonChat.id }));
		assert.equal(body.proberText, await toolText(proberGraphTools(deps).list_propositions!, { session: lessonChat.id }));
		const unknown = await propositions("nope");
		assert.deepEqual(unknown.body.propositions, []);
		assert.equal(unknown.body.auditorText, await toolText(prepareAuditorReview(deps).tools.list_propositions!, { session: "nope" }));
	});

	it("graph find: the auditor's candidates, page by page", async () => {
		const deps = graphDeps();
		const proposed = { id: "p1", name: "Vector addition", statement: "Vector addition is commutative in a vector space.", aliases: [] as string[] };
		const review = prepareAuditorReview(deps, [proposed]);
		const first = await withoutNetwork(() => find({ propositions: [proposed] }));
		assert.equal(first.status, 200);
		const tool = review.initialCandidates;
		assert.deepEqual(first.body.candidates, tool.candidates, "same candidates, statements and aliases");
		assert.deepEqual(first.body.matches.map((m: Json) => m.candidateIds), tool.matches.map((m) => m.candidateIds));
		assert.equal(first.body.matches[0].candidateIds.length, 5);
		assert.ok(tool.matches[0]!.nextCursor !== null);
		assert.equal(first.body.matches[0].nextOffset, 5, "a second page, as the tool's cursor says");

		// The tool's continuation and the HTTP offset give the same page.
		const page2Tool = JSON.parse(await toolText(review.tools.find_candidates!, { propositions: [{ id: "p1", cursor: tool.matches[0]!.nextCursor! }] }));
		const page2 = await find({ propositions: [{ ...proposed, offset: 5 }] });
		assert.deepEqual(page2.body.candidates, page2Tool.candidates);
		assert.deepEqual(page2.body.matches[0].candidateIds, page2Tool.matches[0].candidateIds);
		assert.equal(page2.body.matches[0].nextOffset, null);
		assert.equal(page2Tool.matches[0].nextCursor, null);

		// Hints, as the tool takes them.
		const hinted = JSON.parse(await toolText(review.tools.find_candidates!, { propositions: [{ id: "p1", hints: ["linear map"] }] }));
		const hintedHttp = await find({ propositions: [{ ...proposed, hints: ["linear map"] }] });
		assert.deepEqual(hintedHttp.body.candidates, hinted.candidates);
		assert.ok(hintedHttp.body.candidates.some((c: Json) => c.id === "n_mat"));
	});

	it("graph find: a name alone (what `lh graph find <query>` sends) matches the tool, and a bad body is refused at the door", async () => {
		for (const name of ["Normal mode vim", "vector"]) {
			const { body } = await find({ propositions: [{ id: "query", name }] });
			const tool = prepareAuditorReview(graphDeps(), [{ id: "query", name, statement: "", aliases: [] }]).initialCandidates;
			assert.deepEqual(body.candidates, tool.candidates, name);
			assert.deepEqual(body.matches[0].candidateIds, tool.matches[0]!.candidateIds, name);
			assert.equal(body.matches[0].nextOffset === null, tool.matches[0]!.nextCursor === null, name);
		}
		const { body } = await find({ propositions: [{ id: "query", name: "Normal mode vim" }] });
		assert.equal(body.matches[0].candidateIds[0], "n_vim");
		for (const bad of [null, {}, { propositions: [] }, { propositions: [{ id: "a" }] }, { propositions: [{ id: "a", name: "x" }, { id: "a", name: "y" }] },
			{ propositions: [{ id: "a", name: "x", offset: -1 }] }, { propositions: [{ id: "a", name: "x", extra: 1 }] }, { propositions: [{ id: "a", name: "x", hints: [""] }] }]) {
			const res = await find(bad);
			assert.equal(res.status, 400, JSON.stringify(bad));
			assert.equal(res.body.code, "bad_find");
			assert.ok(res.body.problems.length > 0);
		}
	});
});
