/**
 * READING ANSWERS AND SKIPS (fork, ADR 0001; external-teacher ticket 07):
 * what `answer` gives a Bot Teacher after the learner answers or skips on
 * the page, how the turn route's unread-input check reads the same input,
 * and the dismiss route's sidebar event. Driven through the real routes
 * under an isolated LH_DATA_DIR; every app-module import is dynamic, so the
 * seam is set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-answers-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { commitBotRun, newBotAssistantMessage } = await import("../src/server/bot-run.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { pendingQuestionOf, newHandoffMessage } = await import("../src/core/native-messages.ts");
const { dismissedAnswer } = await import("../src/core/question-core.ts");
const { probeDoneSuccessResult } = await import("../src/core/teaching-tool-results.ts");
const { subscribe } = await import("../src/core/events.ts");
type ServerEvent = import("../src/core/events.ts").ServerEvent;

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
const answer = async (id: string) => json(await answerRoute.GET(new Request(`http://test/api/external/chats/${id}/answer`), ctx(id)));
const show = async (id: string) => json(await showRoute.GET(new Request(`http://test/api/external/chats/${id}`), ctx(id)));
const messages = (id: string) => chatStore.getChat(id)!.messages;

let keys = 0;
async function lesson(): Promise<{ id: string; cursor: string }> {
	const { body } = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Answers", key: `a-${++keys}`, prompt: "Teach me Bayes" })));
	return { id: body.id, cursor: body.cursor };
}

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

/** The page's send route, as the dock posts an answer (ticket 02). */
async function learnerAnswers(chatId: string, answer: Json): Promise<void> {
	const toolCallId = pendingQuestionOf(messages(chatId))!.toolCallId;
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

/** The page's Skip button. */
async function learnerSkips(chatId: string, kind: "ask" | "quiz" | "explain", question: string): Promise<Response> {
	const toolCallId = pendingQuestionOf(messages(chatId))!.toolCallId;
	return dismissRoute.POST(postJson(`http://test/api/chats/${chatId}/dismiss`, { input: { type: "dismiss", toolCallId, answer: dismissedAnswer(kind, question) } }), ctx(chatId));
}

/** Asks `payload` as `kind` and returns the new cursor. */
async function asks(id: string, after: string, kind: string, payload: object): Promise<string> {
	const res = await turn(id, { kind, after, ...payload });
	assert.equal(res.status, 200, JSON.stringify(res.body));
	return res.body.cursor;
}

const answeredAt = new Date().toISOString();

describe("answer items", () => {
	it("a probe answer saved through the page carries every field it had", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "probe", PROBE);
		const call = pendingQuestionOf(messages(id))!;
		await learnerAnswers(id, {
			kind: "quiz",
			tool: "probe",
			questionText: PROBE.question,
			options: [
				{ index: 1, label: "P(A)" },
				{ index: 2, label: "P(B)" },
			],
			dontKnow: false,
			answers: [{ index: 1, label: "P(A)", value: "pa" }],
			thinking: "B carries no information",
			readingThinking: "the lead-in made sense",
			confidence: 80,
			correct: true,
			correctIndices: [1],
			explanation: PROBE.explanation,
			answeredAt,
		});
		const result = messages(id).at(-1)!;
		const { status, body } = await answer(id);
		assert.equal(status, 200);
		assert.deepEqual(body.items, [
			{
				type: "answer",
				id: result.id,
				toolCallId: call.toolCallId,
				kind: "quiz",
				question: PROBE.question,
				answers: [{ index: 1, label: "P(A)" }],
				dontKnow: false,
				thinking: "B carries no information",
				readingThinking: "the lead-in made sense",
				confidence: 80,
				correct: true,
			},
		]);
		assert.equal(body.openQuestion, null);
		assert.equal(body.cursor, result.id);
		assert.deepEqual((await answer(id)).body, body, "reading twice returns the same items");
	});

	it("an ask answer carries its Other text and free text; a recall answer its text and old-style note", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "ask", ASK);
		await learnerAnswers(id, { kind: "ask", questionText: ASK.question, dontKnow: false, answers: [], other: "Both, really", text: "for work", answeredAt });
		const [askItem] = (await answer(id)).body.items;
		assert.equal(askItem.kind, "ask");
		assert.equal(askItem.other, "Both, really");
		assert.equal(askItem.text, "for work");
		assert.deepEqual(askItem.answers, []);

		const recallCursor = await asks(id, askItem.id, "recall", RECALL);
		await learnerAnswers(id, { kind: "explain", tool: "recall", questionText: RECALL.question, dontKnow: true, answers: [], text: "not sure", note: "an old record's reasoning", answeredAt });
		const items = (await answer(id)).body.items;
		assert.equal(items.length, 1, "only the input after the bot's last message");
		assert.notEqual(items[0].id, recallCursor);
		assert.deepEqual(
			{ kind: items[0].kind, question: items[0].question, dontKnow: items[0].dontKnow, text: items[0].text, thinking: items[0].thinking },
			{ kind: "explain", question: RECALL.question, dontKnow: true, text: "not sure", thinking: "an old record's reasoning" },
		);
	});

	it("a skip comes back as a skip", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "probe", PROBE);
		const call = pendingQuestionOf(messages(id))!;
		assert.equal((await learnerSkips(id, "quiz", PROBE.question)).status, 200);
		const result = messages(id).at(-1)!;
		assert.deepEqual((await answer(id)).body.items, [{ type: "skip", id: result.id, toolCallId: call.toolCallId, kind: "quiz" }]);
	});

	it("leaves out the bot's own tool results and markers", async () => {
		const { id } = await lesson();
		const call = newBotAssistantMessage([{ type: "toolCall", id: "call_done", name: "probe_done", arguments: { strands: [] } }]);
		const done = probeDoneSuccessResult();
		commitBotRun(id, [
			...messages(id),
			call,
			{ id: "msg_done_result", role: "toolResult", toolCallId: "call_done", toolName: "probe_done", content: [{ type: "text", text: done.text }], details: { ...done.details }, isError: false, timestamp: Date.now() },
			newHandoffMessage(id),
		]);
		assert.deepEqual((await answer(id)).body.items, []);
		await learnerTypes(id, "ok");
		assert.deepEqual((await answer(id)).body.items.map((i: Json) => [i.type, i.text]), [["message", "ok"]]);
	});
});

describe("unread input in turns", () => {
	it("counts an answer and a skip as unread input", async () => {
		const { id, cursor } = await lesson();
		const asked = await asks(id, cursor, "ask", ASK);
		await learnerAnswers(id, { kind: "ask", questionText: ASK.question, dontKnow: false, answers: [{ index: 1, label: "Intuition", value: "Intuition" }], answeredAt });
		const refused = await turn(id, { kind: "say", after: asked, text: "Great." });
		assert.equal(refused.status, 409);
		assert.equal(refused.body.code, "unread_input");
		assert.deepEqual(refused.body.items, (await answer(id)).body.items);
		assert.equal(refused.body.items[0].type, "answer");

		const probed = await asks(id, refused.body.cursor, "probe", PROBE);
		await learnerSkips(id, "quiz", PROBE.question);
		const skipped = await turn(id, { kind: "say", after: probed, text: "Fine." });
		assert.equal(skipped.status, 409);
		assert.deepEqual(skipped.body.items.map((i: Json) => i.type), ["skip"]);
	});

	it("a stale after lists only input the bot has not replied to", async () => {
		const { id, cursor } = await lesson();
		const first = (await turn(id, { kind: "say", after: cursor, text: "One." })).body.cursor;
		await learnerTypes(id, "replied to");
		const read = (await answer(id)).body.cursor;
		assert.equal((await turn(id, { kind: "say", after: read, text: "Two." })).status, 200);
		await learnerTypes(id, "not yet");
		const stale = await turn(id, { kind: "say", after: first, text: "Three." });
		assert.equal(stale.status, 409);
		assert.equal(stale.body.code, "unread_input");
		assert.deepEqual(stale.body.items.map((i: Json) => i.text), ["not yet"]);
	});

	it("a stale after with nothing new since the bot's last message is not refused for input it replied to", async () => {
		const { id, cursor } = await lesson();
		const first = (await turn(id, { kind: "say", after: cursor, text: "One." })).body.cursor;
		await learnerTypes(id, "replied to");
		const read = (await answer(id)).body.cursor;
		assert.equal((await turn(id, { kind: "say", after: read, text: "Two." })).status, 200);
		const res = await turn(id, { kind: "say", after: first, text: "Three." });
		assert.equal(res.status, 200, JSON.stringify(res.body));
	});

	it("show's cursor passes unread input, so show carries those items", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "say", after: cursor, text: "One." });
		await learnerTypes(id, "a question");
		const shown = await show(id);
		assert.deepEqual(shown.body.items, (await answer(id)).body.items);
		assert.deepEqual(shown.body.items.map((i: Json) => i.text), ["a question"]);
		await turn(id, { kind: "say", after: shown.body.cursor, text: "Answer." });
		assert.deepEqual((await show(id)).body.items, []);
	});
});

describe("a skip racing an answer", () => {
	it("is checked against the record as it is once its body arrives, so the answer stays", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "ask", ASK);
		const toolCallId = pendingQuestionOf(messages(id))!.toolCallId;
		const body = JSON.stringify({ input: { type: "dismiss", toolCallId, answer: dismissedAnswer("ask", ASK.question) } });
		// The skip's body is still on the wire when the answer lands.
		let send!: () => void;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				send = () => {
					controller.enqueue(new TextEncoder().encode(body));
					controller.close();
				};
			},
		});
		const skipping = dismissRoute.POST(
			new Request(`http://test/api/chats/${id}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit),
			ctx(id),
		);
		await learnerAnswers(id, { kind: "ask", questionText: ASK.question, dontKnow: false, answers: [{ index: 1, label: "Intuition", value: "Intuition" }], answeredAt });
		send();
		assert.equal((await skipping).status, 400, "nothing is left to skip");
		assert.deepEqual((await answer(id)).body.items.map((i: Json) => i.type), ["answer"]);
	});
});

describe("skip refreshes the sidebar", () => {
	/** Events emitted while `act` runs. */
	async function eventsDuring(act: () => Promise<Response>): Promise<{ status: number; events: ServerEvent["type"][] }> {
		const events: ServerEvent["type"][] = [];
		const stop = subscribe((e: ServerEvent) => events.push(e.type));
		try {
			const res = await act();
			return { status: res.status, events };
		} finally {
			stop();
		}
	}

	it("emits chats-changed for a bot-run lesson", async () => {
		const { id, cursor } = await lesson();
		await asks(id, cursor, "ask", ASK);
		const { status, events } = await eventsDuring(() => learnerSkips(id, "ask", ASK.question));
		assert.equal(status, 200);
		assert.ok(events.includes("record-changed"));
		assert.ok(events.includes("chats-changed"));
	});

	it("emits chats-changed for an ordinary lesson", async () => {
		const chat = chatStore.createChat("Ordinary");
		const call = { ...newBotAssistantMessage([{ type: "toolCall", id: "call_ord", name: "ask_user_question", arguments: ASK }]), provider: "openai", model: "gpt" };
		chatStore.saveMessages(chat.id, [call]);
		const { status, events } = await eventsDuring(() => learnerSkips(chat.id, "ask", ASK.question));
		assert.equal(status, 200);
		assert.ok(events.includes("record-changed"));
		assert.ok(events.includes("chats-changed"));
		assert.equal(pendingQuestionOf(messages(chat.id)), null);
	});
});
