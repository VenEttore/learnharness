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
import { spawnSync } from "node:child_process";
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
const { inputAppends, dismissAppends } = await import("../src/core/input-events.ts");
const { parseExplainInput } = await import("../src/core/tool-parts.ts");
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

/** What bash does to `$name` and `$1`..`$9` inside double quotes when they are unset. */
const shell = (text: string) => text.replace(/\$(?:[A-Za-z_][A-Za-z0-9_]*|[1-9])/g, "");

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
	payload: { question: string; explanation: string; correctAnswer: string },
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
		// A pick the shuffle moved, so its value tells the two orders apart
		// (an identity shuffle makes them one order).
		const authoredValues = PROBE.options.map((o) => o.value);
		const pick = order.find((o, i) => authoredValues[i] !== o.value)?.value ?? "halved";
		const sent = quizAnswer("probe", PROBE, order, pick, shell);
		assert.equal(sent.questionText, "After $ halvings starting from $ items, about how many items remain?", "the request is mangled as on the bench");
		await postAnswer(id, call.toolCallId, sent);
		const pickedLabel = PROBE.options.find((o) => o.value === pick)!.label;

		const details = lastDetails(id);
		assert.equal(details.questionText, PROBE.question);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: sent.answers[0]!.index, label: pickedLabel, value: pick }]);
		assert.equal(details.explanation, PROBE.explanation);
		// The learner's part is the request's.
		assert.equal(details.correct, sent.correct);
		assert.equal(details.confidence, 70);
		assert.equal(details.thinking, "it halves each time");

		const [item] = (await answer(id)).body.items;
		assert.equal(item.question, PROBE.question);
		assert.deepEqual(item.answers, [{ index: sent.answers[0]!.index, label: pickedLabel }]);
		// What the model reads in ordinary lessons rides the same record.
		const modelText = JSON.parse(((messages(id).at(-1) as { content: { text: string }[] }).content[0]!).text);
		assert.deepEqual(modelText.answers, [{ index: sent.answers[0]!.index, label: pickedLabel }]);
	});

	it("a hand-built answer in the authored order gets the authored labels in that order", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "probe", PROBE);
		const call = pendingQuestionOf(messages(id))!;
		const authored = normalizeOptions(PROBE.options);
		const order = pageOrder(call.toolCallId, PROBE.options);
		const pick = authored.find((o, i) => order[i]!.value !== o.value)?.value ?? "minus";
		const sent = quizAnswer("probe", PROBE, authored, pick, shell);
		await postAnswer(id, call.toolCallId, sent);
		const details = lastDetails(id);
		const index = authored.findIndex((o) => o.value === pick) + 1;
		assert.deepEqual(details.options, authored.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index, label: authored[index - 1]!.label, value: pick }]);
		assert.equal(details.correct, pick === "halved");
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
		const pick = order.find((o, i) => QUIZ.options[i]!.value !== o.value)?.value ?? "linear";
		await postAnswer(id, call.toolCallId, quizAnswer("quiz", QUIZ, order, pick, shell));
		const details = lastDetails(id);
		assert.equal(details.questionText, QUIZ.question);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers.map((a) => a.label), [QUIZ.options.find((o) => o.value === pick)!.label]);
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
		assert.equal(lastDetails(id).explanation, undefined, "a skip stays the minimal record the page sends");
	});
});

/** A record ending in the model's own question call: an ordinary lesson. */
function ordinaryRecord(toolCallId: string, name: string, args: object) {
	return {
		messages: [
			{ id: "u1", role: "user", content: "teach me", timestamp: 1 },
			{
				id: "a1", role: "assistant", api: "anthropic-messages", provider: "anthropic", model: "m", stopReason: "toolUse", timestamp: 2,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				content: [{ type: "toolCall", id: toolCallId, name, arguments: args }],
			},
		] as unknown as LhMessage[],
	};
}
function stored(toolCallId: string, name: string, args: object, answer: unknown): QuestionAnswerData {
	const [result] = inputAppends(ordinaryRecord(toolCallId, name, args), { type: "answer", toolCallId, answer: answer as QuestionAnswerData });
	return (result as { details: QuestionAnswerData }).details;
}

// "call_0" shows PROBE as minus, halved, divided: not the authored order.
const CALL = "call_0";
const AUTHORED = normalizeOptions(PROBE.options);
const PAGE = pageOrder(CALL, PROBE.options);

describe("ordinary lessons, and which order a hand-built answer used", () => {
	it("precondition: the page order and the authored order differ", () => {
		assert.deepEqual(PAGE.map((o) => o.value), ["minus", "halved", "divided"]);
	});

	it("an answer to the model's quiz keeps the authored LaTeX too", () => {
		const details = stored(CALL, "quiz", { ...PROBE, type: "check" }, quizAnswer("quiz", PROBE, PAGE, "halved", shell));
		assert.equal(details.questionText, PROBE.question);
		assert.deepEqual(details.options, PAGE.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: 2, label: "$n/2^k$", value: "halved" }]);
		assert.equal(details.explanation, PROBE.explanation);
	});

	it("a pick with no value in the authored order gets its own option's label, not the page order's", () => {
		const sent = quizAnswer("quiz", PROBE, AUTHORED, "halved", shell);
		delete (sent.answers[0] as { value?: string }).value;
		const details = stored(CALL, "quiz", PROBE, sent);
		assert.equal(details.questionText, PROBE.question);
		assert.deepEqual(details.options, AUTHORED.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: 1, label: "$n/2^k$" }], "never another option's label next to the grade");
		assert.equal(details.correct, true);
	});

	it("an answer in a third order (the bot's own widget), values mangled too, keeps each row's own option", () => {
		const OPTS = [{ label: "$n/2^k$" }, { label: "$n-k$" }, { label: "It depends on the order" }];
		const seen = ["$n/2^k$", "It depends on the order", "$n-k$"];
		const sent = {
			kind: "quiz", tool: "probe", questionText: shell(PROBE.question), dontKnow: false,
			options: seen.map((label, i) => ({ index: i + 1, label: shell(label) })),
			answers: [{ index: 1, label: shell(seen[0]!), value: shell(seen[0]!) }],
			correct: true, correctIndices: [1], answeredAt: new Date().toISOString(),
		};
		const details = stored("call_bot_00000000000000000000000000000002", "probe", { question: PROBE.question, options: OPTS, explanation: PROBE.explanation, correctAnswer: "$n/2^k$" }, sent);
		assert.deepEqual(details.options, seen.map((label, i) => ({ index: i + 1, label })));
		assert.deepEqual(details.answers, [{ index: 1, label: "$n/2^k$", value: "/2^k$" }]);
		assert.equal(details.correct, true);
	});

	it("rows whose mangled labels could be more than one option stay as sent", () => {
		const OPTS = [{ label: "$n$", value: "n" }, { label: "$k$", value: "k" }, { label: "$2$", value: "two" }];
		const sent = {
			kind: "quiz", tool: "quiz", questionText: "q", dontKnow: false,
			options: [{ index: 1, label: "$" }, { index: 2, label: "$" }, { index: 3, label: "$2$" }],
			answers: [{ index: 2, label: "$" }],
			correct: false, correctIndices: [3], answeredAt: new Date().toISOString(),
		};
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "two" }, sent);
		assert.equal(details.questionText, "Which?", "the call parsed");
		assert.deepEqual(details.options, sent.options);
		assert.deepEqual(details.answers, sent.answers);
	});

	it("a pick's value settles the authored order", () => {
		const details = stored(CALL, "quiz", PROBE, quizAnswer("quiz", PROBE, AUTHORED, "halved", shell));
		assert.deepEqual(details.options, AUTHORED.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers, [{ index: 1, label: "$n/2^k$", value: "halved" }]);
	});

	it("multi-select picks each get their authored label", () => {
		const sent = quizAnswer("quiz", PROBE, PAGE, "halved", shell);
		sent.answers = [
			{ index: 2, label: "/2^k$", value: "halved" },
			{ index: 3, label: "/k$", value: "divided" },
		];
		const details = stored(CALL, "quiz", { ...PROBE, multiSelect: true, correctAnswer: ["halved", "divided"] }, sent);
		assert.deepEqual(details.answers.map((a) => a.label), ["$n/2^k$", "$n/k$"]);
		assert.deepEqual(details.options, PAGE.map((o, i) => ({ index: i + 1, label: o.label })));
	});

	it("the page's explain answer is stored as sent when the model wrote the commitment as a number", () => {
		// The dock mounts with the parsed call, so it commits "42", not 42 (code-review round 5).
		for (const tool of ["explain", "recall"]) {
			const call = { question: "What is 6 x 7?", correctAnswer: 42 };
			const parsed = parseExplainInput(call)!;
			const qd = { id: `call_${tool}_n`, kind: "explain" as const, question: parsed.question, mode: "text" as const, options: [], createdAt: "", committedAnswer: parsed.correctAnswer };
			const fromPage = buildAnswer(qd, { text: "6 sevens" }, tool);
			assert.equal(fromPage.committed, "42", "what the page sends");
			const details = stored(`call_${tool}_n`, tool, call, fromPage);
			assert.deepEqual(JSON.parse(JSON.stringify(details)), JSON.parse(JSON.stringify(fromPage)), tool);
		}
	});

	it("the page's skip of a call whose question is not a string is stored as sent", () => {
		// Interrogate round 5, seat A: the page's skip copies the raw call's question (chat.tsx).
		const record = ordinaryRecord("call_skip_n", "quiz", { ...PROBE, question: 1729 });
		const skip = dismissedAnswer("quiz", 1729 as unknown as string);
		const [result] = dismissAppends(record, { type: "dismiss", toolCallId: "call_skip_n", answer: skip });
		assert.deepEqual((result as { details: QuestionAnswerData }).details, skip);
	});

	it("a hand-built answer without the explanation or commitment gets the call's", () => {
		const sent = quizAnswer("quiz", PROBE, PAGE, "halved", shell) as unknown as Json;
		delete sent.explanation;
		assert.equal(stored(CALL, "quiz", PROBE, sent).explanation, PROBE.explanation);
		const recall = stored("call_recall", "recall", RECALL, { kind: "explain", tool: "recall", questionText: "q", dontKnow: false, answers: [], text: "t", answeredAt: "" });
		assert.equal(recall.committed, RECALL.correctAnswer);
	});

	it("an ask with no values (each value is its label, mangled too) gets its labels back", () => {
		const ASK = { question: "Which is $n/2$ when $n = 8$?", options: [{ label: "$4$ items" }, { label: "$n$ halves" }] };
		const details = stored("call_ask", "ask_user_question", ASK, {
			kind: "ask", questionText: shell(ASK.question), dontKnow: false,
			options: ASK.options.map((o, i) => ({ index: i + 1, label: shell(o.label) })),
			answers: [{ index: 2, label: shell("$n$ halves"), value: shell("$n$ halves") }],
			answeredAt: new Date().toISOString(),
		});
		assert.equal(details.questionText, ASK.question);
		assert.deepEqual(details.options, [{ index: 1, label: "$4$ items" }, { index: 2, label: "$n$ halves" }]);
		assert.deepEqual(details.answers, [{ index: 2, label: "$n$ halves", value: "$ halves" }], "the value is the learner's part and stays as sent");
	});
	it("a request not shaped like the page's keeps its rows and picks as sent, and never throws", () => {
		// Ticket 21's lh submit (still open) is to refuse these before they reach the server; the
		// guard only restores the question text and must not make them worse.
		// (A null pick entry throws in upstream compactAnswerForModel, before and
		// after this guard, so no case sends one.)
		const base = () => quizAnswer("quiz", PROBE, AUTHORED, "halved", shell) as unknown as Json;
		const cases: Record<string, (sent: Json) => void> = {
			"a hand-added row": (sent) => sent.options.push({ index: 4, label: "I don't know" }),
			"a null row": (sent) => sent.options.push(null),
			"a row with no label": (sent) => delete sent.options[1].label,
			"a pick with no index": (sent) => { sent.answers = [{ label: "/2^k$", value: "halved" }]; },
			"a pick at index 0": (sent) => { sent.answers[0].index = 0; },
			"a pick past the rows": (sent) => { sent.answers[0].index = 4; },
			"rows sharing an index": (sent) => { sent.options[1].index = 1; },
			"16,000 rows": (sent) => { sent.options = Array.from({ length: 16_000 }, (_, i) => ({ index: i + 1, label: "/2^k$" })); },
		};
		for (const [name, spoil] of Object.entries(cases)) {
			const sent = base();
			spoil(sent);
			const details = stored(CALL, "quiz", PROBE, sent) as unknown as Json;
			assert.equal(details.questionText, PROBE.question, name);
			assert.deepEqual(details.options, sent.options, name);
			assert.deepEqual(details.answers, sent.answers, name);
		}
	});

	it("the page's answer to an 8,000-option quiz stores in linear time", () => {
		// Interrogate round 3: pairwise matching took 15.7 s here (1 run, load under 12).
		const OPTS = Array.from({ length: 8_000 }, (_, i) => ({ label: `$x_{${i}}$`, value: `v${i}` }));
		const order = pageOrder("call_big", OPTS);
		const qd = {
			id: "call_big", kind: "quiz" as const, question: "Which?", mode: "single-select" as const, options: order,
			createdAt: "", correctIndices: [1], explanation: "e",
		};
		const fromPage = buildAnswer(qd, { values: [order[0]!.value], confidence: 50 }, "quiz");
		const started = performance.now();
		const details = stored("call_big", "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: order[0]!.value }, fromPage);
		const ms = performance.now() - started;
		assert.ok(ms < 3_000, `took ${Math.round(ms)} ms`);
		assert.deepEqual(JSON.parse(JSON.stringify(details)), JSON.parse(JSON.stringify(fromPage)), "stored as the page sent it");
	});

	it("a page-shaped request built to chain eliminations stores in linear time", () => {
		// Code-review round 4: a repeated elimination pass took 4.6-6.4 s here (2 runs, load 11-13).
		// Chain options A_k = "$"*k + "1"*(k-1) + "c": bash makes A_k of A_{k+1}. Plus options `$aN$`, all sent as `$`.
		const chain = Array.from({ length: 200 }, (_, i) => ({ label: "$".repeat(i + 1) + "1".repeat(i) + "c", value: `c${i}` }));
		const big = Array.from({ length: 4_000 }, (_, i) => ({ label: `$a${i}$`, value: `b${i}` }));
		const options = [...chain, ...big];
		const labels = [...chain.map((_, i) => (i === 0 ? "" : chain[i - 1]!.label)), ...big.map(() => "$")];
		const sent = {
			kind: "quiz", tool: "quiz", questionText: "q", dontKnow: false,
			options: labels.map((label, i) => ({ index: i + 1, label })),
			answers: [], correct: false, correctIndices: [1], answeredAt: new Date().toISOString(),
		};
		const started = performance.now();
		const details = stored(CALL, "quiz", { question: "Which?", options, explanation: "e", correctAnswer: "c0" }, sent);
		const ms = performance.now() - started;
		assert.ok(ms < 3_000, `took ${Math.round(ms)} ms`);
		assert.deepEqual(details.options!.slice(200), sent.options.slice(200), "4,000 rows sharing `$` settle nothing");
	});

	it("a pick's value binds its own row even when the row's label could be two options, and settles the other", () => {
		const OPTS = [{ label: "$n$", value: "n" }, { label: "$k$", value: "k" }, { label: "$2$", value: "two" }];
		const sent = {
			kind: "quiz", tool: "quiz", questionText: "q", dontKnow: false,
			options: [{ index: 1, label: "$" }, { index: 2, label: "$" }, { index: 3, label: "$2$" }],
			answers: [{ index: 2, label: "$", value: "k" }],
			correct: false, correctIndices: [3], answeredAt: new Date().toISOString(),
		};
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "two" }, sent);
		// Row 1's `$` could be `$n$`, `$k$` or `$2$`; the pick takes `$k$` and row 3 is `$2$`.
		assert.deepEqual(details.options, [{ index: 1, label: "$n$" }, { index: 2, label: "$k$" }, { index: 3, label: "$2$" }]);
		assert.deepEqual(details.answers, [{ index: 2, label: "$k$", value: "k" }]);
	});

	it("two rows left with the same option contradict each other, so neither binds", () => {
		const OPTS = [{ label: "$n$", value: "n" }, { label: "$k$", value: "k" }, { label: "plain", value: "p" }];
		const sent = {
			kind: "quiz", tool: "quiz", questionText: "q", dontKnow: false,
			options: [{ index: 1, label: "$" }, { index: 2, label: "$" }, { index: 3, label: "$k$" }],
			answers: [], correct: false, correctIndices: [3], answeredAt: new Date().toISOString(),
		};
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "p" }, sent);
		assert.deepEqual(details.options, [{ index: 1, label: "$" }, { index: 2, label: "$" }, { index: 3, label: "$k$" }]);
	});

	it("two rows naming the same option both stay as sent; the rest still bind", () => {
		const sent = quizAnswer("quiz", PROBE, AUTHORED, "divided", shell);
		sent.options = [{ index: 1, label: "/2^k$" }, { index: 2, label: "/2^k$" }, { index: 3, label: "/k$" }];
		const details = stored(CALL, "quiz", PROBE, sent);
		assert.deepEqual(details.options, [{ index: 1, label: "/2^k$" }, { index: 2, label: "/2^k$" }, { index: 3, label: "$n/k$" }]);
	});

	it("a row whose label names another option than the pick's value stays as sent", () => {
		const sent = quizAnswer("quiz", PROBE, AUTHORED, "halved", shell);
		sent.answers = [{ index: 1, label: "-k$", value: "minus" }];
		const details = stored(CALL, "quiz", PROBE, sent);
		assert.deepEqual(details.options![0], { index: 1, label: "/2^k$" }, "row 1's label says halved, the pick says minus");
		assert.deepEqual(details.answers, [{ index: 1, label: "$n-k$", value: "minus" }], "the pick's value is its identity");

		// A label that could be two options still rules out a third.
		const OPTS = [{ label: "$n$", value: "n" }, { label: "$k$", value: "k" }, { label: "plain", value: "p" }];
		const odd = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "p" }, {
			kind: "quiz", tool: "quiz", questionText: "q", dontKnow: false,
			options: [{ index: 1, label: "$" }, { index: 2, label: "$" }, { index: 3, label: "(blank)" }],
			answers: [{ index: 1, label: "$", value: "p" }],
			correct: true, correctIndices: [1], answeredAt: new Date().toISOString(),
		});
		assert.deepEqual(odd.options![0], { index: 1, label: "$" }, "row 1 reads `$`, which cannot be `plain`");
	});
});

/** The request body a bot writes inside a double-quoted bash string (its
 *  JSON with each `"` escaped for the shell), as bash hands it on. */
function viaBash(body: unknown): unknown {
	const text = JSON.stringify(body).replaceAll('"', '\\"');
	const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "/usr/bin:/bin" }; // no $n, $k
	const out = spawnSync("bash", ["-c", `printf '%s' "${text}"`], { env, encoding: "utf8" });
	assert.equal(out.status, 0, out.stderr);
	return JSON.parse(out.stdout);
}

describe("backslash TeX through a real double-quoted bash string", () => {
	const TEX = {
		question: "After $k$ halvings, which is $\\frac{n}{2^k}$?",
		options: [
			{ label: "$\\frac{n}{2^k}$", value: "frac" },
			{ label: "$n \\times k$", value: "times" },
			{ label: "$\\theta$ items", value: "theta" },
		],
		explanation: "Halving $k$ times divides by $2^k$: $\\frac{n}{2^k}$.",
		correctAnswer: "frac",
	};

	it("bash mangles the labels as the review found (form feed, tab, lost $n)", () => {
		const sent = viaBash({ labels: TEX.options.map((o) => o.label) }) as { labels: string[] };
		// "\f" and "\t" here are the form feed and tab JSON made of `\frac`, `\times`, `\theta`.
		assert.deepEqual(sent.labels, ["$\frac{n}{2^k}$", " \times k$", "$\theta$ items"]);
	});

	it("a bash-mangled answer whose picked value settles the last ambiguous row gets every row back", () => {
		const OPTS = [{ label: "$n/2^k$", value: "halved" }, { label: "$n$", value: "n" }, { label: "$k$", value: "k" }];
		const call = { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "halved" };
		const answer = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: OPTS.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 3, label: "$k$", value: "k" }],
			correct: false, correctIndices: [1], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.deepEqual(answer.options!.map((o) => o.label), ["/2^k$", "$", "$"], "what bash sent");
		const details = stored(CALL, "quiz", call, answer);
		assert.deepEqual(details.options!.map((o) => o.label), ["$n/2^k$", "$n$", "$k$"]);
	});

	it("through the bot-run route: a probe with the bench strings and backslash TeX, sent through bash", async () => {
		const { id, cursor } = await lesson();
		const BENCH = { ...PROBE, options: [...PROBE.options, { label: "$\\frac{n}{2^k}$ rounded", value: "frac" }] };
		await asks(id, cursor, "probe", BENCH);
		const pending = pendingQuestionOf(messages(id))!;
		const order = pageOrder(pending.toolCallId, BENCH.options);
		const sent = viaBash(quizAnswer("probe", BENCH, order, "frac", (x) => x)) as Json;
		assert.equal(sent.questionText, "After $ halvings starting from $ items, about how many items remain?", "bash mangled it");
		assert.equal(sent.answers[0].label, "$\frac{n}{2^k}$ rounded", "a form feed where \\f was");
		await postAnswer(id, pending.toolCallId, sent);
		const details = lastDetails(id);
		assert.equal(details.questionText, PROBE.question);
		assert.equal(details.explanation, PROBE.explanation);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers.map((a) => a.label), ["$\\frac{n}{2^k}$ rounded"]);
		const [item] = (await answer(id)).body.items;
		assert.deepEqual(item.answers.map((a: Json) => a.label), ["$\\frac{n}{2^k}$ rounded"]);
	});

	it("a call with a shell form the guard does not model keeps rows and picks as sent", () => {
		// Interrogate round 4, seat A: bash makes `$*$` into `$`, which looked like `$x$`'s bash form,
		// so the record said the learner picked `$x$` (and was correct).
		const OPTS = [{ label: "$\\times$", value: "times" }, { label: "$x$", value: "x" }, { label: "$*$", value: "star" }];
		const call = { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "star" };
		const order = [OPTS[1]!, OPTS[0]!, OPTS[2]!];
		const sent = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: order.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 3, label: "$*$", value: "$*$" }],
			correct: true, correctIndices: [3], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.deepEqual([sent.options![0]!.label, sent.options![2]!.label, sent.answers[0]!.value], ["$", "$", "$"], "what bash sent");
		const details = stored(CALL, "quiz", call, sent);
		assert.deepEqual(details.options, sent.options, "rows as sent");
		assert.deepEqual(details.answers, sent.answers, "the pick as sent, not `$x$`");

		// Seat A's fuzz: a modeled form elsewhere in such a call (`$_n$` -> `$`) can equal another option's verbatim value.
		const MIXED = [{ label: "\\neq" }, { label: "$" }, { label: "\\times 2 $$", value: "$_n$" }];
		const mixed = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: MIXED.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 3, label: MIXED[2]!.label, value: "$_n$" }],
			correct: false, correctIndices: [1], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.equal(mixed.answers[0]!.value, "$", "bash made `$_n$` into the other option's value");
		const kept = stored(CALL, "quiz", { question: "Which?", options: MIXED, explanation: "e", correctAnswer: "\\neq" }, mixed);
		assert.deepEqual(kept.answers, mixed.answers, "not the `$` option's label");
		assert.deepEqual(kept.options, mixed.options);
	});

	it("bash's `$[..]` arithmetic form counts as unmodeled: rows and picks stay as sent", () => {
		// Interrogate round 5, seat A: `$[2]$` and `$12$` both reach the server as `2$`.
		const OPTS = [{ label: "$[2]$" }, { label: "$12$" }, { label: "$[7]$" }];
		const sent = viaBash({
			kind: "quiz", tool: "probe", questionText: "Working mod 10, what is [3]x[4]?", dontKnow: false,
			options: OPTS.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 1, label: "$[2]$", value: "$[2]$" }],
			correct: true, correctIndices: [1], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.equal(sent.answers[0]!.value, "2$", "what bash made of `$[2]$`");
		const details = stored(CALL, "probe", { question: "Working mod 10, what is [3]x[4]?", options: OPTS, explanation: "e", correctAnswer: "$[2]$" }, sent);
		assert.deepEqual(details.answers, sent.answers, "not `$12$`");
		assert.deepEqual(details.options, sent.options);
	});

	it("a bare `$_` counts as unmodeled (bash always sets it): rows and picks stay as sent", () => {
		// Code-review round 6: `$_` is bash's last-argument parameter, never empty.
		const OPTS = [{ label: "$_$" }, { label: "$_n$" }, { label: "plain" }];
		const sent = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: OPTS.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 2, label: "$_n$", value: "$_n$" }],
			correct: false, correctIndices: [3], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.notEqual(sent.options![0]!.label, "$", "bash filled in `$_`");
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "plain" }, sent);
		assert.deepEqual(details.options, sent.options);
		assert.deepEqual(details.answers, sent.answers);
	});

	it("a pick keeps its sent label when its own value rules out its row's option", () => {
		// Interrogate round 5, seat A: rows in the authored order, the pick's index from another order.
		const OPTS = [{ label: "$k$" }, { label: "$n$" }, { label: "the step count" }];
		const sent = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: OPTS.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 3, label: "$n$", value: "$n$" }],
			correct: false, correctIndices: [3], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "the step count" }, sent);
		assert.deepEqual(details.options![2], { index: 3, label: "the step count" });
		assert.deepEqual(details.answers, sent.answers, "its value `$` can only be `$k$` or `$n$`");
	});

	it("a bot copying the call's edge spaces still gets the rows back", () => {
		// Interrogate round 5, seat C: the page trims labels; the call kept " $n/2^k$".
		const OPTS = [{ label: " $n/2^k$", value: "halved " }, { label: "$n-k$", value: "minus" }, { label: "$n/k$ ", value: "divided" }];
		const sent = viaBash({
			kind: "quiz", tool: "quiz", questionText: "Which?", dontKnow: false,
			options: OPTS.map((o, i) => ({ index: i + 1, label: o.label })),
			answers: [{ index: 1, label: OPTS[0]!.label, value: "halved " }],
			correct: true, correctIndices: [1], answeredAt: new Date().toISOString(),
		}) as QuestionAnswerData;
		assert.equal(sent.options![0]!.label, " /2^k$", "what bash sent");
		const details = stored(CALL, "quiz", { question: "Which?", options: OPTS, explanation: "e", correctAnswer: "halved" }, sent);
		assert.deepEqual(details.options!.map((o) => o.label), ["$n/2^k$", "$n-k$", "$n/k$"]);
		assert.deepEqual(details.answers.map((a) => [a.label, a.value]), [["$n/2^k$", "halved "]]);
	});

	it("an answer sent that way gets every row and the pick back", () => {
		const order = pageOrder(CALL, TEX.options);
		const answer = viaBash(quizAnswer("quiz", TEX, order, "times", (x) => x)) as QuestionAnswerData;
		const details = stored(CALL, "quiz", TEX, answer);
		assert.equal(details.questionText, TEX.question);
		assert.equal(details.explanation, TEX.explanation);
		assert.deepEqual(details.options, order.map((o, i) => ({ index: i + 1, label: o.label })));
		assert.deepEqual(details.answers.map((a) => [a.label, a.value]), [["$n \\times k$", "times"]]);
	});
});
