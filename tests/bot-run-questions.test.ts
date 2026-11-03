/**
 * PROBE QUESTIONS (fork, ADR 0001; external-teacher ticket 06): a Bot
 * Teacher's `ask`, `probe` and `recall` turns, driven through the turn
 * route under an isolated LH_DATA_DIR. Asserts what a bot sees (the JSON
 * replies) and what the page sees (the saved record through the page's own
 * folds: the open question, the dock's parse, the phase). Every app-module
 * import is dynamic: the seam must be set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-questions-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { commitBotRun, newBotAssistantMessage } = await import("../src/server/bot-run.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { parseAskInput, parseExplainInput, parseQuizInput } = await import("../src/core/tool-parts.ts");
const { dismissedAnswer } = await import("../src/core/question-core.ts");
const { probeDoneSuccessResult } = await import("../src/core/teaching-tool-results.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response): Promise<{ status: number; body: Json }> {
	return { status: res.status, body: (await res.json()) as Json };
}

function postJson(url: string, body: unknown): Request {
	return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const turn = async (id: string, body: unknown) => json(await turnRoute.POST(postJson(`http://test/api/external/chats/${id}/turn`, body), ctx(id)));

let keys = 0;
/** A fresh bot-run lesson with the owner's request as its first message. */
async function lesson(): Promise<{ id: string; cursor: string }> {
	const { body } = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Probe", key: `q-${++keys}`, prompt: "Teach me Bayes" })));
	return { id: body.id, cursor: body.cursor };
}

const messages = (id: string) => chatStore.getChat(id)!.messages;

const ASK = { question: "What do you want from this?", options: [{ label: "Intuition" }, { label: "Exam prep" }] };
const PROBE = {
	question: "P(A|B) when A and B are independent?",
	options: [
		{ label: "P(A)", value: "pa" },
		{ label: "P(B)", value: "pb" },
	],
	explanation: "Independence means B tells you nothing about A.",
	correctAnswer: "pa",
};
const RECALL = { question: "Explain Bayes' rule in your own words.", correctAnswer: "Posterior is likelihood times prior, normalized." };

/** The learner answering the open ask on the page. */
async function learnerAnswers(chatId: string, toolCallId: string): Promise<void> {
	const answer = { kind: "ask", questionText: ASK.question, dontKnow: false, answers: ["Intuition"], answeredAt: new Date().toISOString() };
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId, input: { type: "answer", toolCallId, answer } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
}

async function learnerTypes(chatId: string, text: string): Promise<void> {
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId, input: { type: "text", text } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
}

/** The learner pressing Skip on the page. */
async function learnerSkips(chatId: string, toolCallId: string, kind: "ask" | "quiz" | "explain", question: string): Promise<void> {
	const res = await dismissRoute.POST(postJson(`http://test/api/chats/${chatId}/dismiss`, { input: { type: "dismiss", toolCallId, answer: dismissedAnswer(kind, question) } }), ctx(chatId));
	assert.equal(res.status, 200);
}

/** Moves a lesson past the probe the way probe_done's records do. */
function concludeProbe(chatId: string): void {
	const call = newBotAssistantMessage([{ type: "toolCall", id: "call_done", name: "probe_done", arguments: { strands: [] } }]);
	const done = probeDoneSuccessResult();
	commitBotRun(chatId, [
		...messages(chatId),
		call,
		{ id: "msg_done_result", role: "toolResult", toolCallId: "call_done", toolName: "probe_done", content: [{ type: "text", text: done.text }], details: { ...done.details }, isError: false, timestamp: Date.now() },
	]);
}

describe("question turns the page can show", () => {
	for (const [kind, tool, payload, parse] of [
		["ask", "ask_user_question", ASK, parseAskInput],
		["probe", "probe", PROBE, parseQuizInput],
		["recall", "recall", RECALL, parseExplainInput],
	] as const) {
		it(`${kind} saves a ${tool} call that is the open question, in the probe phase`, async () => {
			const { id, cursor } = await lesson();
			const res = await turn(id, { kind, after: cursor, ...payload });
			assert.equal(res.status, 200);
			assert.equal(res.body.ok, true);
			const saved = messages(id);
			assert.equal(saved.length, 2);
			assert.equal(res.body.cursor, saved[1]!.id);
			const open = pendingQuestionOf(saved)!;
			assert.equal(open.tool, tool);
			assert.deepEqual(open.input, payload);
			assert.deepEqual(parse(open.input), payload, "the dock parses the call");
			assert.equal(phaseAt3Lh(saved), "probe");
		});
	}

	it("puts lead-in text in the same assistant message, ahead of the call", async () => {
		const { id, cursor } = await lesson();
		const res = await turn(id, { kind: "probe", after: cursor, text: "Let's see where you are.\n", ...PROBE });
		assert.equal(res.status, 200);
		const saved = messages(id);
		assert.equal(saved.length, 2);
		const content = (saved[1] as { content: Array<{ type: string; text?: string; name?: string; arguments?: unknown }> }).content;
		assert.deepEqual(
			content.map((b) => b.type),
			["text", "toolCall"],
		);
		assert.equal(content[0]!.text, "Let's see where you are.");
		assert.deepEqual(content[1]!.arguments, PROBE, "the lead-in is not a tool argument");
		assert.equal(pendingQuestionOf(saved)!.tool, "probe");
	});

	it("allows ask after the probe; probe and recall are refused there with the kinds allowed", async () => {
		const { id } = await lesson();
		concludeProbe(id);
		const cursor = messages(id).at(-1)!.id;
		for (const [kind, payload] of [
			["probe", PROBE],
			["recall", RECALL],
		] as const) {
			const res = await turn(id, { kind, after: cursor, ...payload });
			assert.equal(res.status, 409);
			assert.deepEqual(res.body, { ok: false, code: "wrong_phase", phase: "plan", allowed: ["say", "ask", "plan", "quiz", "explain"], cursor });
		}
		assert.equal(messages(id).length, 3);
		const asked = await turn(id, { kind: "ask", after: cursor, ...ASK });
		assert.equal(asked.status, 200);
		assert.equal(pendingQuestionOf(messages(id))!.tool, "ask_user_question");
	});
});

describe("refusals save nothing", () => {
	it("refuses any turn while a question is open", async () => {
		const { id, cursor } = await lesson();
		const first = await turn(id, { kind: "ask", after: cursor, ...ASK });
		for (const body of [
			{ kind: "say", after: first.body.cursor, text: "Meanwhile..." },
			{ kind: "probe", after: first.body.cursor, ...PROBE },
		]) {
			const res = await turn(id, body);
			assert.equal(res.status, 409);
			assert.deepEqual(res.body, { ok: false, code: "open_question", cursor: first.body.cursor });
		}
		assert.equal(messages(id).length, 2);
	});

	it("checks unread input before the open question, and the open question before the phase", async () => {
		const { id } = await lesson();
		concludeProbe(id);
		const cursor = messages(id).at(-1)!.id;
		const asked = await turn(id, { kind: "ask", after: cursor, ...ASK });
		// Open question and wrong phase both apply: open question wins.
		const wrong = await turn(id, { kind: "probe", after: asked.body.cursor, ...PROBE });
		assert.equal(wrong.body.code, "open_question");
		// A stale cursor with a new turn: the bot's own question is not input.
		const stale = await turn(id, { kind: "probe", after: cursor, ...PROBE });
		assert.equal(stale.body.code, "open_question");
		// Learner input past the cursor: unread input wins over the open question.
		await learnerTypes(id, "wait, what?");
		const unread = await turn(id, { kind: "probe", after: asked.body.cursor, ...PROBE });
		assert.equal(unread.status, 409);
		assert.equal(unread.body.code, "unread_input");
		assert.equal(unread.body.items[0].text, "wait, what?");
	});

	it("refuses a payload that fails the tool's schema with problem text, not a crash", async () => {
		const { id, cursor } = await lesson();
		for (const body of [
			{ kind: "probe", after: cursor, question: "No options?", explanation: "x", correctAnswer: "a" },
			{ kind: "probe", after: cursor, ...PROBE, options: [{ label: "Only one" }] },
			{ kind: "recall", after: cursor, question: "Explain." },
			{ kind: "ask", after: cursor },
			{ kind: "ask", after: cursor, question: 42 },
			{ kind: "ask", after: cursor, ...ASK, multiSelect: "yes" },
			{ kind: "ask", after: cursor, ...ASK, options: [{ label: 7 }, { label: "B" }] },
			{ kind: "ask", after: cursor, ...ASK, text: 5 },
		]) {
			const res = await turn(id, body);
			assert.equal(res.status, 422, JSON.stringify(body));
			assert.equal(res.body.code, "invalid");
			assert.equal(res.body.cursor, cursor);
			assert.ok(res.body.problems.length > 0 && res.body.problems.every((p: unknown) => typeof p === "string" && p.length > 0));
		}
		assert.equal(messages(id).length, 1);
	});

	it("words a schema failure as one plain problem per field, without pi's validation dump", async () => {
		const { id } = await lesson();
		concludeProbe(id);
		const after = messages(id).at(-1)!.id;
		const cases: Array<[Record<string, unknown>, string[]]> = [
			[{ kind: "explain", type: "foo", nodeId: "n1", ...RECALL }, ['type must be "predict" or "check", not "foo"']],
			[{ kind: "quiz", type: "guess", nodeId: "n1", ...PROBE }, ['type must be "predict" or "check", not "guess"']],
			[{ kind: "explain", type: "check", nodeId: "n1", question: "Why?" }, ["correctAnswer is required"]],
		];
		for (const [body, problems] of cases) {
			const res = await turn(id, { ...body, after });
			assert.equal(res.status, 422, JSON.stringify(body));
			assert.equal(res.body.code, "invalid");
			assert.deepEqual(res.body.problems, problems);
		}
		const probing = await lesson();
		const res = await turn(probing.id, { kind: "probe", after: probing.cursor, ...PROBE, options: [{ label: "Only one", value: "pa" }] });
		assert.equal(res.status, 422);
		assert.deepEqual(res.body.problems, ["options needs at least 2 items, not 1"]);
		assert.ok(!JSON.stringify(res.body).includes("Received arguments"));
		// An optional null gets the route's own wording, alone or beside
		// another schema failure.
		for (const [body, problems] of [
			[{ ...PROBE, details: null }, ["details must not be null; leave it out"]],
			[{ ...PROBE, details: null, options: [{ label: "Only one", value: "pa" }] }, ["options needs at least 2 items, not 1", "details must not be null; leave it out"]],
		] as const) {
			const nulled = await turn(probing.id, { kind: "probe", after: probing.cursor, ...body });
			assert.equal(nulled.status, 422);
			assert.deepEqual([...nulled.body.problems].sort(), [...problems].sort());
		}
	});

	it("refuses a type field on probe or recall, which the dock could not read", async () => {
		const { id, cursor } = await lesson();
		for (const body of [
			{ kind: "probe", after: cursor, ...PROBE, type: { a: 1 } },
			{ kind: "recall", after: cursor, ...RECALL, type: ["x"] },
			{ kind: "probe", after: cursor, ...PROBE, type: 42 },
			{ kind: "recall", after: cursor, ...RECALL, type: null },
		]) {
			const res = await turn(id, body);
			assert.equal(res.status, 422, JSON.stringify(body));
			assert.equal(res.body.code, "invalid");
			assert.ok(res.body.problems.some((p: string) => /^type is not a field/.test(p)), res.body.problems.join("; "));
		}
		assert.equal(messages(id).length, 1);
	});

	it("refuses fields the tool does not define, at any depth, naming them", async () => {
		const { id, cursor } = await lesson();
		const cases: Array<[Record<string, unknown>, RegExp]> = [
			[{ kind: "probe", ...PROBE, detials: "typo" }, /detials/],
			[{ kind: "ask", ...ASK, options: [{ label: "A", desc: "x" }, { label: "B" }] }, /options\[0\]\.desc/],
			[{ kind: "say", text: "Hi", extra: 1 }, /extra/],
		];
		for (const [body, problem] of cases) {
			const res = await turn(id, { ...body, after: cursor });
			assert.equal(res.status, 422, JSON.stringify(body));
			assert.equal(res.body.code, "invalid");
			assert.ok(res.body.problems.some((p: string) => problem.test(p)), res.body.problems.join("; "));
		}
		// A deep unknown value is refused at its top, never walked: no stack
		// overflow. Sent as raw JSON, which JSON.stringify could not write.
		const deep = "[".repeat(5000) + "]".repeat(5000);
		const raw = `{"kind":"say","after":${JSON.stringify(cursor)},"text":"Hi","deep":${deep}}`;
		const res = await json(
			await turnRoute.POST(new Request(`http://test/api/external/chats/${id}/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw }), ctx(id)),
		);
		assert.equal(res.status, 422);
		assert.deepEqual(res.body.problems, ["deep is not a field of this kind; fields: text"]);
		assert.equal(messages(id).length, 1);
	});

	it("refuses a payload that fails the tool's refinement with its problem text", async () => {
		const { id, cursor } = await lesson();
		const cases: Array<[Record<string, unknown>, RegExp]> = [
			[{ kind: "probe", ...PROBE, correctAnswer: "nope" }, /does not match any option value/],
			[{ kind: "probe", ...PROBE, correctAnswer: ["pa", "pb"] }, /multiSelect is not true/],
			[{ kind: "ask", ...ASK, options: [{ label: "Same" }, { label: "Same" }] }, /same value/],
			[{ kind: "ask", ...ASK, options: [{ label: "  " }, { label: "B" }] }, /label is empty/],
			[{ kind: "recall", ...RECALL, correctAnswer: "   " }, /correctAnswer is required/],
		];
		for (const [body, problem] of cases) {
			const res = await turn(id, { ...body, after: cursor });
			assert.equal(res.status, 422, JSON.stringify(body));
			assert.equal(res.body.code, "invalid");
			assert.ok(res.body.problems.some((p: string) => problem.test(p)), res.body.problems.join("; "));
		}
		assert.equal(messages(id).length, 1);
	});
});

describe("repeats", () => {
	it("a rerun with the same after is a repeat, while open and after the learner answered", async () => {
		const { id, cursor } = await lesson();
		const first = await turn(id, { kind: "ask", after: cursor, text: "Quick check.", ...ASK });
		const again = await turn(id, { kind: "ask", after: cursor, text: "Quick check.", ...ASK });
		assert.deepEqual(again.body, { ok: true, repeat: true, items: [], cursor: first.body.cursor });
		await learnerAnswers(id, pendingQuestionOf(messages(id))!.toolCallId);
		const count = messages(id).length;
		const afterAnswer = await turn(id, { kind: "ask", after: cursor, text: "Quick check.", ...ASK });
		assert.equal(afterAnswer.status, 200);
		assert.equal(afterAnswer.body.repeat, true);
		assert.equal(messages(id).length, count);
	});

	it("a rerun whose JSON lists the same keys in another order is a repeat, after the learner answered", async () => {
		const { id, cursor } = await lesson();
		const options = [
			{ label: "Intuition", value: "intuition" },
			{ label: "Exam prep", value: "exam" },
		];
		await turn(id, { kind: "ask", after: cursor, question: ASK.question, options });
		// Top-level and nested keys both reordered.
		const reordered = { options: options.map(({ label, value }) => ({ value, label })), question: ASK.question, after: cursor, kind: "ask" };
		const open = await turn(id, reordered);
		assert.equal(open.body.repeat, true, "while the question is open");
		await learnerAnswers(id, pendingQuestionOf(messages(id))!.toolCallId);
		const count = messages(id).length;
		const answered = await turn(id, reordered);
		assert.equal(answered.status, 200);
		assert.equal(answered.body.repeat, true, "after the learner answered");
		assert.equal(messages(id).length, count);
	});

	it("a rerun that rewords only the lead-in is a repeat, after the learner answered", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "ask", after: cursor, text: "First wording.", ...ASK });
		await learnerAnswers(id, pendingQuestionOf(messages(id))!.toolCallId);
		const count = messages(id).length;
		const reworded = await turn(id, { kind: "ask", after: cursor, text: "Second wording.", ...ASK });
		assert.equal(reworded.body.repeat, true);
		assert.equal(messages(id).length, count);
	});

	it("the same question asked again after a skip, with the newer after, is saved", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "probe", after: cursor, ...PROBE });
		await learnerSkips(id, pendingQuestionOf(messages(id))!.toolCallId, "quiz", PROBE.question);
		const skipped = messages(id);
		assert.equal(pendingQuestionOf(skipped), null);
		const newer = skipped.at(-1)!.id;
		const rerun = await turn(id, { kind: "probe", after: cursor, ...PROBE });
		assert.equal(rerun.body.repeat, true, "the old after still names the first ask");
		const reasked = await turn(id, { kind: "probe", after: newer, ...PROBE });
		assert.equal(reasked.status, 200);
		assert.equal(reasked.body.repeat, undefined);
		const saved = messages(id);
		assert.equal(saved.length, skipped.length + 1);
		const open = pendingQuestionOf(saved)!;
		assert.equal(open.tool, "probe");
		assert.notEqual(open.toolCallId, pendingQuestionOf(skipped.slice(0, 2))!.toolCallId, "a new call id");
	});
});
