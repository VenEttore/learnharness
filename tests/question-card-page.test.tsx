/**
 * QUESTION CARD PAGE (fork, external-teacher ticket 22): the read-only
 * phone card at /chat/<id>/card. A Bot Teacher posts turns through the
 * turn route under an isolated LH_DATA_DIR; the test renders the card
 * page's server component to static markup and reads what a learner sees
 * in the screenshot: kind, lead-in, question, numbered options (math
 * rendered by the page's renderer), teaching text, phase and plan. Option
 * numbers must match the order the lesson page's question dock shows.
 * Every app-module import is dynamic: the seam must be set before
 * config.ts loads.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-question-card-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { default: CardPage } = await import("../app/chat/[id]/card/page.tsx");
const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const { QuestionDock } = await import("../components/question-dock.tsx");
const { chatStore } = await import("../src/store/chats.ts");
const { pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { parseQuizInput } = await import("../src/core/tool-parts.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postJson = (url: string, body: unknown) =>
	new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function turn(id: string, body: unknown): Promise<string> {
	const res = await turnRoute.POST(postJson(`http://test/api/external/chats/${id}/turn`, body), ctx(id));
	const json = (await res.json()) as Json;
	assert.equal(res.status, 200, JSON.stringify(json));
	return json.cursor as string;
}

let keys = 0;
async function lesson(): Promise<{ id: string; cursor: string }> {
	const res = await createRoute.POST(
		postJson("http://test/api/external/chats", { title: "Halving", key: `card-${++keys}`, prompt: "Teach me logarithms" }),
	);
	const body = (await res.json()) as Json;
	return { id: body.id, cursor: body.cursor };
}

async function card(id: string): Promise<Document> {
	const el = (await CardPage({ params: Promise.resolve({ id }) })) as React.ReactElement;
	return parseHTML(`<html><body>${renderToStaticMarkup(el)}</body></html>`).document as unknown as Document;
}

const byTestId = (doc: Document, id: string) => doc.querySelector(`[data-testid="${id}"]`);
const tex = (root: ParentNode | null) =>
	[...(root?.querySelectorAll('annotation[encoding="application/x-tex"]') ?? [])].map((n) => n.textContent);
const optionNumbers = (doc: Document) =>
	[...doc.querySelectorAll('[data-testid="card-option"]')].map((li) => li.getAttribute("data-number"));
const optionTex = (doc: Document) => [...doc.querySelectorAll('[data-testid="card-option"]')].map((li) => tex(li).join(" "));

// Ticket 20's bench repro: inline math a shell once ate.
const MATH_QUESTION = "After $k$ halvings starting from $n$ items, about how many items remain?";
const MATH_OPTIONS = [
	{ label: "$n/2^k$", value: "a" },
	{ label: "$n-k$", value: "b" },
	{ label: "$n/k$", value: "c" },
];
const PROBE = { question: MATH_QUESTION, options: MATH_OPTIONS, explanation: "Each halving divides by 2: $n/2^k$.", correctAnswer: "a" };
const ASSESSMENT = {
	assessment: {
		strands: [{ strand: "halving", assessment: "Floor: halves once. Ceiling: unsure about repeated halving." }],
		summary: "Start from repeated halving.",
	},
};
const PLAN = "graph TD\n  halving[Repeated halving] --> logs[Logarithms] --> search[Binary search]";
const QUIZ = { type: "predict", nodeId: "halving", ...PROBE };

/** The learner answering the open probe on the page; returns the new cursor. */
async function learnerAnswers(id: string, question: string): Promise<string> {
	const toolCallId = pendingQuestionOf(chatStore.getChat(id)!.messages)!.toolCallId;
	const answer = { kind: "quiz", questionText: question, dontKnow: true, answers: [], answeredAt: new Date().toISOString() };
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId: id, input: { type: "answer", toolCallId, answer } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
	return chatStore.getChat(id)!.messages.at(-1)!.id;
}

/** The labels in the order the lesson page's question dock shows them. */
function dockOrder(id: string): string[] {
	const pending = pendingQuestionOf(chatStore.getChat(id)!.messages)!;
	const markup = renderToStaticMarkup(
		<QuestionDock
			toolName={pending.tool as "probe" | "quiz"}
			toolCallId={pending.toolCallId}
			input={parseQuizInput(pending.input)!}
			expanded
			onExpand={() => {}}
			onSubmit={() => {}}
		/>,
	);
	const doc = parseHTML(`<html><body>${markup}</body></html>`).document;
	return [...doc.querySelectorAll('[role="radio"]')].map((b) => tex(b).join(" "));
}

describe("question card page", () => {
	it("a probe shows its kind, lead-in, math question and numbered options in the dock's order", async () => {
		const { id, cursor } = await lesson();
		const said = await turn(id, { kind: "say", after: cursor, text: "Let's warm up with $\\log_2 8 = 3$." });
		await turn(id, { kind: "probe", after: said, text: "Quick check first.", ...PROBE });
		const doc = await card(id);

		assert.equal(byTestId(doc, "card-phase")?.textContent, "Phase · Probe");
		assert.equal(byTestId(doc, "card-kind")?.textContent, "Probe");
		assert.match(byTestId(doc, "card-lead-in")?.textContent ?? "", /Quick check first\./);
		assert.deepEqual(tex(byTestId(doc, "card-teaching")), ["\\log_2 8 = 3"]);
		assert.deepEqual(tex(byTestId(doc, "card-question-text")), ["k", "n"]);
		assert.deepEqual(optionNumbers(doc), ["1", "2", "3"]);
		assert.deepEqual(optionTex(doc).toSorted(), ["n-k", "n/2^k", "n/k"]);
		assert.deepEqual(optionTex(doc), dockOrder(id));
		assert.match(byTestId(doc, "card-reply-hint")?.textContent ?? "", /confidence/);
		assert.equal(byTestId(doc, "card-no-question"), null);
		// The probe phase has no plan map.
		assert.equal(byTestId(doc, "card-plan"), null);
	});

	it("a teaching quiz shows the plan with the current node, the prediction role and math options", async () => {
		const { id, cursor } = await lesson();
		const done = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		const planned = await turn(id, { kind: "plan", after: done, mermaid: PLAN });
		await turn(id, { kind: "quiz", after: planned, ...QUIZ });
		const doc = await card(id);

		assert.equal(byTestId(doc, "card-kind")?.textContent, "Quiz · prediction");
		assert.notEqual(byTestId(doc, "card-phase")?.textContent, "Phase · Probe");
		assert.ok(byTestId(doc, "card-plan")?.querySelector("svg"), "the plan map renders");
		assert.equal(byTestId(doc, "card-current-node")?.textContent, "Repeated halving");
		assert.deepEqual(tex(byTestId(doc, "card-question-text")), ["k", "n"]);
		assert.deepEqual(optionNumbers(doc), ["1", "2", "3"]);
		assert.deepEqual(optionTex(doc), dockOrder(id));
	});

	it("a recall says a typed answer is expected and shows no options", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "recall", after: cursor, question: "Explain what $\\log_2 n$ counts.", correctAnswer: "Halvings to reach 1." });
		const doc = await card(id);
		assert.equal(byTestId(doc, "card-kind")?.textContent, "Recall");
		assert.ok(byTestId(doc, "card-typed-answer"));
		assert.deepEqual(optionNumbers(doc), []);
		assert.deepEqual(tex(byTestId(doc, "card-question-text")), ["\\log_2 n"]);
	});

	it("a teaching explain says a typed answer is expected", async () => {
		const { id, cursor } = await lesson();
		const done = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		const planned = await turn(id, { kind: "plan", after: done, mermaid: PLAN });
		await turn(id, { kind: "explain", after: planned, type: "check", nodeId: "logs", question: "Why is $\\log_2 n$ the number of halvings?", correctAnswer: "Each halving divides by 2." });
		const doc = await card(id);
		assert.equal(byTestId(doc, "card-kind")?.textContent, "Explain");
		assert.ok(byTestId(doc, "card-typed-answer"));
		assert.deepEqual(optionNumbers(doc), []);
		assert.equal(byTestId(doc, "card-current-node")?.textContent, "Logarithms");
	});

	it("numbers six probe options in the dock's shuffled order, not the authored order", async () => {
		// A fixed call id makes the seeded shuffle deterministic (random ids keep
		// the authored order about 1 run in 720, which would hide a card that
		// skips the shuffle).
		const authored = ["n/2^k", "n-k", "n/k", "2^k", "k/n", "n^k"];
		const options = authored.map((tex, i) => ({ label: `$${tex}$`, value: `o${i}` }));
		const chat = chatStore.createChat("six options");
		chatStore.saveMessages(chat.id, [
			{ id: "msg_six_user", role: "user", content: [{ type: "text", text: "Teach me logs" }], timestamp: Date.now() },
			{
				id: "msg_six_probe", role: "assistant", api: "x", provider: "x", model: "x", stopReason: "toolUse", timestamp: Date.now(),
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				content: [{ type: "toolCall", id: "call_card_fixed_order", name: "probe", arguments: { question: MATH_QUESTION, options, explanation: "Halve $k$ times.", correctAnswer: "o0" } }],
			},
		] as never);
		const doc = await card(chat.id);
		assert.deepEqual(optionNumbers(doc), ["1", "2", "3", "4", "5", "6"]);
		assert.deepEqual(optionTex(doc), dockOrder(chat.id));
		assert.notDeepEqual(optionTex(doc), authored);
	});

	it("the teaching text is the latest text before the open question's own lead-in", async () => {
		const { id, cursor } = await lesson();
		const said = await turn(id, { kind: "say", after: cursor, text: "Halving teaches logarithms." });
		await turn(id, { kind: "probe", after: said, text: "First probe lead-in.", ...PROBE });
		const answered = await learnerAnswers(id, MATH_QUESTION);
		const feedback = await turn(id, { kind: "say", after: answered, text: "Not quite: each halving divides by two." });
		await turn(id, { kind: "probe", after: feedback, text: "Try again.", ...PROBE, question: "Second: after $k$ halvings?" });
		const doc = await card(id);
		assert.match(byTestId(doc, "card-teaching")?.textContent ?? "", /Not quite: each halving divides by two\./);
		assert.equal(byTestId(doc, "card-lead-in")?.textContent?.trim(), "Try again.");
	});

	describe("ordinary lesson record shapes", () => {
		let n = 0;
		const mid = () => `msg_card_shape_${++n}`;
		const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const asst = (content: unknown[]) => ({ id: mid(), role: "assistant", content, api: "x", provider: "x", model: "x", usage, stopReason: "toolUse", timestamp: Date.now() });
		const user = (text: string) => ({ id: mid(), role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
		const sendToUser = (cid: string, message: string) => ({ type: "toolCall", id: cid, name: "send_to_user", arguments: { message } });
		const sendResult = (cid: string) => ({ id: mid(), role: "toolResult", toolCallId: cid, toolName: "send_to_user", content: [{ type: "text", text: "shown" }], details: null, isError: false, timestamp: Date.now() });
		const probe = (cid: string, question: string) => ({ type: "toolCall", id: cid, name: "probe", arguments: { question, options: [{ label: "2", value: "a" }, { label: "3", value: "b" }, { label: "4", value: "c" }], correctAnswer: "b", explanation: "x" } });
		const answered = (cid: string, q: string) => ({ id: mid(), role: "toolResult", toolCallId: cid, toolName: "probe", content: [{ type: "text", text: "answered" }], details: { kind: "quiz", questionText: q, dontKnow: true, answers: [], answeredAt: new Date().toISOString() }, isError: false, timestamp: Date.now() });
		async function ordinary(messages: unknown[]): Promise<Document> {
			const chat = chatStore.createChat("ordinary shapes");
			chatStore.saveMessages(chat.id, messages as never);
			return card(chat.id);
		}

		it("two questions in one message: the open one's lead-in is only its own text", async () => {
			const doc = await ordinary([
				user("Teach me logs"),
				asst([{ type: "text", text: "First question: the base." }, probe("call_q1", "What base does $\\log_2 8$ use?"), { type: "text", text: "Second question: the value." }, probe("call_q2", "What is $\\log_2 8$?")]),
				answered("call_q1", "What base?"),
			]);
			assert.equal(byTestId(doc, "card-lead-in")?.textContent?.trim(), "Second question: the value.");
			assert.match(byTestId(doc, "card-teaching")?.textContent ?? "", /First question: the base\./);
		});

		it("teaching sent beside an earlier question still counts as the latest teaching", async () => {
			const doc = await ordinary([
				user("Teach me logs"),
				asst([sendToUser("call_s0", "Welcome! We will start with a warm-up.")]),
				sendResult("call_s0"),
				asst([sendToUser("call_s1", "A logarithm counts halvings."), probe("call_q1", "What is $\\log_2 4$?")]),
				sendResult("call_s1"),
				answered("call_q1", "What is log 4?"),
				asst([sendToUser("call_s2", "Correct! One more."), probe("call_q2", "What is $\\log_2 8$?")]),
			]);
			assert.match(byTestId(doc, "card-teaching")?.textContent ?? "", /A logarithm counts halvings\./);
			assert.equal(byTestId(doc, "card-lead-in")?.textContent?.trim(), "Correct! One more.");
		});
	});

	it("an unknown lesson is not found", async () => {
		await assert.rejects(card("chat_missing_card"), (e: Error) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(e.message ?? (e as { digest?: string }).digest ?? ""));
	});

	it("an ask keeps its authored option order and offers Other", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "ask", after: cursor, question: "What do you want?", options: [{ label: "Intuition" }, { label: "Exam prep" }, { label: "Both" }] });
		const doc = await card(id);
		assert.equal(byTestId(doc, "card-kind")?.textContent, "Ask");
		const labels = [...doc.querySelectorAll('[data-testid="card-option"]')].map((li) => li.textContent?.replace(/^\d+/, "").trim());
		assert.deepEqual(labels, ["Intuition", "Exam prep", "Both"]);
		assert.match(byTestId(doc, "card-question")?.textContent ?? "", /Other/);
	});

	it("with no open question it shows the latest teaching text and No open question", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "say", after: cursor, text: "Halving $n$ items $k$ times leaves $n/2^k$." });
		const doc = await card(id);
		assert.equal(byTestId(doc, "card-no-question")?.textContent, "No open question");
		assert.deepEqual(tex(byTestId(doc, "card-teaching")), ["n", "k", "n/2^k"]);
		assert.equal(byTestId(doc, "card-question"), null);
	});

	it("has no inputs, buttons or forms", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "probe", after: cursor, ...PROBE });
		const doc = await card(id);
		assert.equal(doc.querySelectorAll("input, textarea, button, form, select, [contenteditable]").length, 0);
	});

	it("an ordinary lesson renders the same card", async () => {
		const chat = chatStore.createChat("plain");
		const doc = await card(chat.id);
		assert.equal(byTestId(doc, "card-no-question")?.textContent, "No open question");
	});
});
