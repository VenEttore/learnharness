/**
 * LATEX SURVIVES QUESTION PRESENTATION (fork; external-teacher ticket 20).
 *
 * On ticket 15's bench the learner answered on a phone, so the Bot Teacher
 * hand-built the page's answer request (POST /api/chat) in a double-quoted
 * shell string. The shell expanded `$n` and `$k` to nothing, and the server
 * stored the request's copy of the question text, option labels and
 * explanation as sent: `$n/2^k$` became `/2^k$`. The call's own arguments
 * kept the authored text.
 *
 * The answer record's model-authored text now comes from the question call,
 * for bot-run and ordinary lessons alike; the learner's part (picks, grade,
 * confidence, thinking) still comes from the request. Driven through the
 * real routes under an isolated LH_DATA_DIR; app modules load dynamically
 * so the seam is set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-answer-authored-text-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { inputAppends } = await import("../src/core/input-events.ts");
const { buildAnswer, dismissedAnswer, normalizeOptions, seededRandom, shuffleOptions } = await import("../src/core/question-core.ts");
type QuestionAnswerData = import("../src/core/question-core.ts").QuestionAnswerData;
type LhMessage = import("../src/core/native-messages.ts").LhMessage;

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
const show = async (id: string) => json(await showRoute.GET(new Request(`http://test/api/external/chats/${id}`), ctx(id)));
const answer = async (id: string) => json(await answerRoute.GET(new Request(`http://test/api/external/chats/${id}/answer`), ctx(id)));
const messages = (id: string) => chatStore.getChat(id)!.messages;
const lastDetails = (id: string) => (messages(id).at(-1) as { details: QuestionAnswerData }).details;

/** What bash does to `$name` inside double quotes when no such variable is set. */
const shell = (text: string) => text.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "");

// The bench lesson's probe (chat_mvxc52d6_582ae133), as the bot authored it.
const PROBE = {
	question: "After $k$ halvings starting from $n$ items, about how many items remain?",
	options: [
		{ label: "$n/2^k$", value: "halved" },
		{ label: "$n-k$", value: "minus" },
		{ label: "$n/k$", value: "divided" },
	],
	explanation: "Each halving keeps about half: ~$n/2$ after one, so after $k$ steps $n/2^k$ remain.",
	correctAnswer: "halved",
};
// Mixed labels (plain text plus math) and a display-math lead-in.
const LEAD_IN = "Recall the halving rule:\n\n$$\\frac{n}{2^k}$$\n\nNow count the steps.";
const QUIZ = {
	type: "check",
	nodeId: "count",
	question: "How many halvings take $n$ items down to one?",
	options: [
		{ label: "About $\\log_2 n$ steps", value: "log" },
		{ label: "Exactly $n$ steps", value: "linear" },
		{ label: "One step", value: "one" },
	],
	explanation: "Halving $k$ times leaves $n/2^k$; that is 1 when $k = \\log_2 n$.",
	correctAnswer: "log",
};
const RECALL = { question: "Why is $n/2^k$ the count after $k$ halvings?", correctAnswer: "Each step multiplies $n$ by $1/2$." };

const ASSESSMENT = {
	assessment: { strands: [{ strand: "halving", assessment: "Floor: halves once. Ceiling: no log yet." }], summary: "Start from halving." },
};
const PLAN = "graph TD\n  halve[Halving] --> count[Counting halvings]";

let keys = 0;
async function lesson(): Promise<{ id: string; cursor: string }> {
	const { body } = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Binary search", key: `latex-${++keys}`, prompt: "Teach me binary search" })));
	return { id: body.id, cursor: body.cursor };
}
async function teachingLesson(): Promise<{ id: string; cursor: string }> {
	const { id, cursor } = await lesson();
	const done = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
	assert.equal(done.status, 200, JSON.stringify(done.body));
	const planned = await turn(id, { kind: "plan", after: done.body.cursor, mermaid: PLAN });
	assert.equal(planned.status, 200, JSON.stringify(planned.body));
	return { id, cursor: planned.body.cursor };
}
async function asks(id: string, after: string, kind: string, payload: object): Promise<void> {
	const res = await turn(id, { kind, after, ...payload });
	assert.equal(res.status, 200, JSON.stringify(res.body));
}

/** The order the page's dock shows a quiz's options in. */
function pageOrder(toolCallId: string, options: { label: string; value: string }[]) {
	return shuffleOptions(normalizeOptions(options), seededRandom(toolCallId));
}

/** POST /api/chat with an answer, as the page sends it. */
async function postAnswer(chatId: string, toolCallId: string, answer: Json): Promise<void> {
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId, input: { type: "answer", toolCallId, answer } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
}

/** A quiz answer built in `order`, every string run through `mangle`. */
function quizAnswer(
	tool: string,
	payload: typeof PROBE,
	order: { label: string; value: string }[],
	pick: string,
	mangle: (s: string) => string,
): QuestionAnswerData {
	const index = order.findIndex((o) => o.value === pick) + 1;
	const correctIndex = order.findIndex((o) => o.value === payload.correctAnswer) + 1;
	return {
		kind: "quiz",
		tool,
		questionText: mangle(payload.question),
		options: order.map((o, i) => ({ index: i + 1, label: mangle(o.label) })),
		dontKnow: false,
		answers: [{ index, label: mangle(order[index - 1]!.label), value: pick }],
		thinking: "it halves each time",
		confidence: 70,
		correct: index === correctIndex,
		correctIndices: [correctIndex],
		explanation: mangle(payload.explanation),
		answeredAt: new Date().toISOString(),
	};
}

describe("an answer's question text, labels and explanation are the call's", () => {
	it("a probe answer hand-built in a shell keeps the authored LaTeX (the bench repro)", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "probe", PROBE);
		const call = pendingQuestionOf(messages(id))!;
		const order = pageOrder(call.toolCallId, PROBE.options);
		const sent = quizAnswer("probe", PROBE, order, "halved", shell);
		assert.equal(sent.options![order.findIndex((o) => o.value === "halved")]!.label, "/2^k$", "the request is mangled as on the bench");
		await postAnswer(id, call.toolCallId, sent);

		const details = lastDetails(id);
		assert.equal(details.questionText, PROBE.question);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: sent.answers[0]!.index, label: "$n/2^k$", value: "halved" }]);
		assert.equal(details.explanation, PROBE.explanation);
		// The learner's part is the request's.
		assert.equal(details.correct, true);
		assert.equal(details.confidence, 70);
		assert.equal(details.thinking, "it halves each time");

		const [item] = (await answer(id)).body.items;
		assert.equal(item.question, PROBE.question);
		assert.deepEqual(item.answers, [{ index: sent.answers[0]!.index, label: "$n/2^k$" }]);
		// What the model reads in ordinary lessons rides the same record.
		const modelText = JSON.parse(((messages(id).at(-1) as { content: { text: string }[] }).content[0]!).text);
		assert.deepEqual(modelText.answers, [{ index: sent.answers[0]!.index, label: "$n/2^k$" }]);
	});

	it("a hand-built answer in the authored order gets the authored labels in that order", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "probe", PROBE);
		const call = pendingQuestionOf(messages(id))!;
		const authored = normalizeOptions(PROBE.options);
		const sent = quizAnswer("probe", PROBE, authored, "minus", shell);
		await postAnswer(id, call.toolCallId, sent);
		const details = lastDetails(id);
		assert.deepEqual(details.options, authored.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: 2, label: "$n-k$", value: "minus" }]);
		assert.equal(details.correct, false);
	});

	it("a teach quiz with mixed labels and a $$ lead-in round-trips unchanged from the page", async () => {
		const { id, cursor } = await teachingLesson();
		await asks(id, cursor, "quiz", { ...QUIZ, text: LEAD_IN });
		const call = pendingQuestionOf(messages(id))!;
		// The lead-in is stored and shown as authored.
		const shown = (await show(id)).body;
		assert.equal(JSON.stringify(shown).includes(JSON.stringify(LEAD_IN)), true, "lh show carries the lead-in unchanged");
		const assistant = messages(id).at(-1) as { content: { type: string; text?: string }[] };
		assert.equal(assistant.content[0]!.text, LEAD_IN);

		// The page's own answer (the dock's builder) is stored unchanged.
		const order = pageOrder(call.toolCallId, QUIZ.options);
		const qd = {
			id: call.toolCallId, kind: "quiz" as const, questionType: "check" as const, question: QUIZ.question,
			mode: "single-select" as const, options: order, createdAt: new Date().toISOString(),
			correctIndices: [order.findIndex((o) => o.value === "log") + 1], explanation: QUIZ.explanation,
		};
		const fromPage = buildAnswer(qd, { values: ["log"], confidence: 90 }, "quiz");
		await postAnswer(id, call.toolCallId, fromPage);
		assert.deepEqual(lastDetails(id), JSON.parse(JSON.stringify(fromPage)), "stored as the page sent it");
		const [item] = (await answer(id)).body.items;
		assert.deepEqual(item.answers, [{ index: fromPage.answers[0]!.index, label: "About $\\log_2 n$ steps" }]);
	});

	it("a shell-mangled teach quiz answer gets the mixed labels back", async () => {
		const { id, cursor } = await teachingLesson();
		await asks(id, cursor, "quiz", QUIZ);
		const call = pendingQuestionOf(messages(id))!;
		const order = pageOrder(call.toolCallId, QUIZ.options);
		await postAnswer(id, call.toolCallId, quizAnswer("quiz", QUIZ as unknown as typeof PROBE, order, "linear", shell));
		const details = lastDetails(id);
		assert.equal(details.questionText, QUIZ.question);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers.map((a) => a.label), ["Exactly $n$ steps"]);
		assert.equal(details.explanation, QUIZ.explanation);
	});

	it("a recall answer and a skip keep the authored question and commitment", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "recall", RECALL);
		let call = pendingQuestionOf(messages(id))!;
		await postAnswer(id, call.toolCallId, {
			kind: "explain", tool: "recall", questionText: shell(RECALL.question), dontKnow: false, answers: [],
			text: "each step halves it", committed: shell(RECALL.correctAnswer), answeredAt: new Date().toISOString(),
		});
		assert.equal(lastDetails(id).questionText, RECALL.question);
		assert.equal(lastDetails(id).committed, RECALL.correctAnswer);
		assert.equal(lastDetails(id).text, "each step halves it");

		const next = (await answer(id)).body.cursor;
		await asks(id, next, "probe", PROBE);
		call = pendingQuestionOf(messages(id))!;
		const res = await dismissRoute.POST(
			postJson(`http://test/api/chats/${id}/dismiss`, { input: { type: "dismiss", toolCallId: call.toolCallId, answer: dismissedAnswer("quiz", shell(PROBE.question)) } }),
			ctx(id),
		);
		assert.equal(res.status, 200);
		assert.equal(lastDetails(id).questionText, PROBE.question);
		assert.equal(lastDetails(id).dismissed, true);
	});
});

describe("ordinary lessons", () => {
	it("an answer to the model's quiz keeps the authored LaTeX too", () => {
		const toolCallId = "call_ordinary_1";
		const record = {
			messages: [
				{ id: "u1", role: "user", content: "teach me", timestamp: 1 },
				{
					id: "a1", role: "assistant", api: "anthropic-messages", provider: "anthropic", model: "m", stopReason: "toolUse", timestamp: 2,
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					content: [{ type: "toolCall", id: toolCallId, name: "quiz", arguments: { ...PROBE, type: "check" } }],
				},
			] as unknown as LhMessage[],
		};
		const order = pageOrder(toolCallId, PROBE.options);
		const [result] = inputAppends(record, { type: "answer", toolCallId, answer: quizAnswer("quiz", PROBE, order, "halved", shell) });
		const details = (result as { details: QuestionAnswerData }).details;
		assert.equal(details.questionText, PROBE.question);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers.map((a) => a.label), ["$n/2^k$"]);
		assert.equal(details.explanation, PROBE.explanation);
	});
});
