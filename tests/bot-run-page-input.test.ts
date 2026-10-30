/**
 * BOT-RUN PAGE INPUT (fork, ADR 0001): a lesson with driver "external" is
 * taught by an outside Bot Teacher, so page input is saved and LearnHarness
 * calls no model — whether or not a model and key are configured. Drives
 * the chat handler directly (the chat-flow seam) under an isolated
 * LH_DATA_DIR, so "no model configured" is a fact of this process, not of
 * whatever the shared data/ holds. Every app-module import is dynamic: the
 * seam must be set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-page-input-"));
process.env.LH_DATA_DIR = TMP_DATA;
process.env.OPENROUTER_API_KEY ??= "test-key-presence-gate";

const { handleChatInput, handleChatRequest } = await import("../src/server/chat-handler.ts");
const { settledTurnResponse } = await import("../src/server/turn-runs.ts");
const { projectedContextTokens } = await import("../src/server/compaction.ts");
const { compactionCutIndex } = await import("../src/core/compaction.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { subscribe } = await import("../src/core/events.ts");
const { danglingQuestionOf, newUserMessage } = await import("../src/core/native-messages.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type ServerEvent = import("../src/core/events.ts").ServerEvent;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

const SETTLED = await settledTurnResponse().text();

/** The agent builder a bot-run lesson must never reach. */
let agentBuilds = 0;
const throwingBuilder: Parameters<typeof handleChatRequest>[1] = () => {
	agentBuilds++;
	throw new Error("a bot-run lesson asked for a model agent");
};

function post(chatId: string, input: unknown): Request {
	return new Request("http://test/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, input }),
	});
}

/** A bot-run lesson; `configured` pins a model the way the setup flow does,
 *  so the ordinary path would get past the model and key gates. */
function botLesson(title: string, configured: boolean) {
	const chat = chatStore.createChat(title, undefined, { driver: "external", externalKey: `key-${title}` });
	if (configured) chatStore.saveSettings(chat.id, { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } });
	return chat;
}

/** Collect server events for the duration of `run`. */
async function eventsDuring(run: () => Promise<Response>): Promise<{ res: Response; events: ServerEvent[] }> {
	const events: ServerEvent[] = [];
	const off = subscribe((e) => events.push(e));
	try {
		const res = await run();
		return { res, events };
	} finally {
		off();
	}
}

const ASK = { question: "What do you want to learn?", options: [{ label: "Algebra" }, { label: "Geometry" }] };

function seedOpenAsk(chatId: string, callId: string): LhMessage[] {
	const ask = {
		...fauxAssistantMessage([fauxText("First, your goal."), fauxToolCall("ask_user_question", ASK, { id: callId })], { stopReason: "toolUse" }),
		id: `msg-${callId}`,
	} as LhMessage;
	const seeded = [newUserMessage("teach me maths"), ask];
	chatStore.saveMessages(chatId, seeded);
	return seeded;
}

describe("the bot-run flag on the lesson record", () => {
	it("createChat's third argument stamps driver and key; without it the record carries neither", () => {
		const bot = chatStore.createChat("Flagged", undefined, { driver: "external", externalKey: "k1" });
		assert.equal(chatStore.getChat(bot.id)!.driver, "external");
		assert.equal(chatStore.getChat(bot.id)!.externalKey, "k1");
		const plain = chatStore.createChat("Plain");
		assert.equal("driver" in chatStore.getChat(plain.id)!, false);
		assert.equal("externalKey" in chatStore.getChat(plain.id)!, false);
	});
});

describe("page input on a bot-run lesson saves and calls no model", () => {
	it("typed text is saved and settles, with a model and key configured, and no agent is built", async () => {
		const chat = botLesson("Typed text", true);
		agentBuilds = 0;
		const { res, events } = await eventsDuring(() =>
			handleChatRequest(post(chat.id, { type: "text", text: "can we slow down?" }), throwingBuilder),
		);
		assert.equal(res.status, 200);
		assert.equal(await res.text(), SETTLED, "the parallel-question path's settled-turn response");
		assert.equal(agentBuilds, 0, "no model agent was asked for");
		const saved = chatStore.getChat(chat.id)!;
		assert.equal(saved.messages.length, 1);
		assert.equal(saved.messages[0]!.role, "user");
		assert.match(JSON.stringify(saved.messages[0]), /can we slow down\?/);
		assert.ok(events.some((e) => e.type === "record-changed" && (e as { chatId?: string }).chatId === chat.id));
		assert.ok(events.some((e) => e.type === "chats-changed"), "the sidebar hears about a bot-run write");
		assert.ok(!events.some((e) => e.type === "turn-started"), "no turn starts");
	});

	it("an answer to an open question is saved and closes the question", async () => {
		const chat = botLesson("Answer", true);
		seedOpenAsk(chat.id, "call-ask");
		agentBuilds = 0;
		const answer = { kind: "ask", questionText: ASK.question, dontKnow: false, answers: ["Algebra"], answeredAt: new Date().toISOString() };
		const res = await handleChatRequest(post(chat.id, { type: "answer", toolCallId: "call-ask", answer }), throwingBuilder);
		assert.equal(res.status, 200);
		assert.equal(await res.text(), SETTLED);
		assert.equal(agentBuilds, 0);
		const saved = chatStore.getChat(chat.id)!;
		assert.equal(saved.messages.length, 3);
		const result = saved.messages[2]!;
		assert.equal(result.role, "toolResult");
		assert.equal((result as { toolCallId: string }).toolCallId, "call-ask");
		assert.equal(danglingQuestionOf(saved.messages), null, "the dock has nothing left to show");
	});

	it("with no model configured, typed text is saved (no 503)", async () => {
		const chat = botLesson("No model", false);
		const res = await handleChatRequest(post(chat.id, { type: "text", text: "hello bot" }), throwingBuilder);
		assert.equal(res.status, 200);
		assert.equal(await res.text(), SETTLED);
		assert.match(JSON.stringify(chatStore.getChat(chat.id)!.messages), /hello bot/);
	});

	it("an ordinary lesson with no model still gets the 503 (the contrast)", async () => {
		const chat = chatStore.createChat("Ordinary, no model");
		const res = await handleChatRequest(post(chat.id, { type: "text", text: "hello model" }), throwingBuilder);
		assert.equal(res.status, 503);
		assert.equal(chatStore.getChat(chat.id)!.messages.length, 0);
	});

	it("an over-threshold record is not compacted: no compaction starts and nothing is summarized", async () => {
		const chat = botLesson("Long lesson", true);
		const seeded: LhMessage[] = [];
		for (let i = 0; i < 12; i++) {
			seeded.push(newUserMessage(`question ${i} ${"x".repeat(60_000)}`));
			seeded.push({ ...fauxAssistantMessage([fauxText(`answer ${i} ${"y".repeat(60_000)}`)]), id: `long-${i}` } as LhMessage);
		}
		chatStore.saveMessages(chat.id, seeded);
		// Preconditions: the ordinary path would compact this record.
		assert.ok(projectedContextTokens(seeded, 0) > 150_000, "over the default threshold");
		assert.ok(compactionCutIndex(seeded) > 0, "there is history to cut");

		// The compaction gate skips itself under NODE_ENV=test; lift that
		// for this one request so only the bot-run return can skip it.
		const env: Record<string, string | undefined> = process.env;
		const nodeEnv = env.NODE_ENV;
		env.NODE_ENV = "development";
		agentBuilds = 0;
		let outcome: Awaited<ReturnType<typeof eventsDuring>>;
		try {
			outcome = await eventsDuring(() => handleChatRequest(post(chat.id, { type: "text", text: "next" }), throwingBuilder));
		} finally {
			env.NODE_ENV = nodeEnv;
		}
		assert.equal(outcome.res.status, 200);
		assert.equal(agentBuilds, 0);
		assert.ok(!outcome.events.some((e) => e.type === "compaction-changed"), "no compaction ran");
		const saved = chatStore.getChat(chat.id)!.messages;
		assert.equal(saved.length, seeded.length + 1, "only the typed text was added: no compaction marker");
		assert.equal(saved.at(-1)!.role, "user");
	});
});

describe("page input a bot-run lesson refuses", () => {
	for (const type of ["continue", "retry"] as const) {
		it(`${type} is 422 bot_run_lesson (not 409, which the page resends) and saves nothing`, async () => {
			const chat = botLesson(`Refuse ${type}`, true);
			chatStore.saveMessages(chat.id, [newUserMessage("hi")]);
			const res = await handleChatRequest(post(chat.id, { type }), throwingBuilder);
			assert.equal(res.status, 422);
			assert.equal(((await res.json()) as { code: string }).code, "bot_run_lesson");
			assert.equal(chatStore.getChat(chat.id)!.messages.length, 1);
		});
	}

	it("an internal wake input is 400 bot_run_lesson and saves nothing", async () => {
		const chat = botLesson("Wake", true);
		const steer = newUserMessage("a steer marker");
		const res = await handleChatInput(chat.id, { type: "steers", steers: [steer] }, throwingBuilder);
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { code: string }).code, "bot_run_lesson");
		assert.equal(chatStore.getChat(chat.id)!.messages.length, 0);
	});

	it("an answer with no open question is 400 with the append error, as for ordinary lessons", async () => {
		const chat = botLesson("Stray answer", true);
		const answer = { kind: "ask", questionText: "?", dontKnow: false, answers: [], answeredAt: new Date().toISOString() };
		const res = await handleChatRequest(post(chat.id, { type: "answer", toolCallId: "nope", answer }), throwingBuilder);
		assert.equal(res.status, 400);
		assert.match(((await res.json()) as { error: string }).error, /no pending question/);
		assert.equal(chatStore.getChat(chat.id)!.messages.length, 0);
	});
});
