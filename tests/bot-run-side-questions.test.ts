/**
 * BOT-RUN SIDE QUESTIONS (fork, ADR 0001; external-teacher ticket 36):
 * upstream 0.6.0's side questions are answered by LearnHarness's model, so
 * a bot-run lesson refuses them before compaction, the engine lookup or any
 * stream. Driven at the service seam (counting fakes) and through the real
 * route with the production engine lookup, each with an ordinary lesson as
 * the control. Every app-module import is dynamic: the data folder must be
 * set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createAssistantMessageEventStream, createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { PiEngine } from "../src/agent/models.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-side-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_AUTH_FILE = path.join(TMP, "auth.json");
// A regression that reaches the model path must hit a fake key, never a real one.
process.env.OPENROUTER_API_KEY = "test-key-presence-gate";
fs.writeFileSync(process.env.LH_AUTH_FILE, "{}");

const { chatStore } = await import("../src/store/chats.ts");
const { createSideChatService } = await import("../src/server/side-chat.ts");
const { newBotAssistantMessage } = await import("../src/server/bot-run.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { POST: sideAskRoute } = await import("../app/api/chats/[id]/side-chats/route.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const PINNED = { model: { provider: "openrouter", id: "z-ai/glm-5.3-flash" } } as const;

/** A lesson with one teacher explanation to anchor a side question on.
 *  `bot` makes it bot-run; the model is pinned either way, so the
 *  ordinary path would get past the model and key gates. */
function lesson(title: string, bot: boolean) {
	const chat = bot
		? chatStore.createChat(title, undefined, { driver: "external", externalKey: `key-${title}` })
		: chatStore.createChat(title);
	chatStore.saveSettings(chat.id, PINNED);
	const explanation = bot
		? newBotAssistantMessage([{ type: "text", text: "A limit is the value a function approaches." }])
		: { ...fauxAssistantMessage("A limit is the value a function approaches."), id: "explanation" };
	chatStore.saveMessages(chat.id, [newUserMessage("Teach me limits"), explanation]);
	const anchor = { messageId: explanation.id, partId: `${explanation.id}-t0`, blockIndex: 0, blockText: "A limit" };
	return { chatId: chat.id, anchor };
}

/** A side-chat service whose every model-facing step is counted. */
function countingService() {
	const counts = { beforeAsk: 0, engineFor: 0, stream: 0 };
	const faux = createFauxCore({});
	const engine: PiEngine = {
		model: faux.getModel(),
		streamFn: () => {
			counts.stream++;
			const stream = createAssistantMessageEventStream();
			stream.push({ type: "done", reason: "stop", message: fauxAssistantMessage("A side answer.") });
			return stream;
		},
	};
	const service = createSideChatService({
		chatStore,
		engineFor: async () => { counts.engineFor++; return engine; },
		beforeAsk: async () => { counts.beforeAsk++; },
		instructions: () => "Side helper",
	});
	return { service, counts };
}

async function refusalOf(res: Response) {
	assert.equal(res.status, 422);
	const body = (await res.json()) as { code?: string; error?: string };
	assert.equal(body.code, "bot_run_lesson");
	return body;
}

describe("side questions in a bot-run lesson", () => {
	it("a first question on teacher text is refused before compaction, engine lookup or stream", async () => {
		const { service, counts } = countingService();
		const { chatId, anchor } = lesson("side-first", true);
		await refusalOf(await service.ask(chatId, { anchor, text: "Why approaches?", quotes: [] }));
		assert.deepEqual(counts, { beforeAsk: 0, engineFor: 0, stream: 0 });
		assert.equal(chatStore.getChat(chatId)?.sideChats, undefined, "no side thread is saved");
	});

	it("a follow-up and a retry on a thread id are refused the same way", async () => {
		const { service, counts } = countingService();
		const { chatId } = lesson("side-follow", true);
		await refusalOf(await service.ask(chatId, { threadId: "side_x", text: "And then?", quotes: [] }));
		await refusalOf(await service.ask(chatId, { threadId: "side_x", text: "", quotes: [], retry: true }));
		assert.deepEqual(counts, { beforeAsk: 0, engineFor: 0, stream: 0 });
	});

	// The guard acts on the record the engine lookup receives: a first read
	// that fails (getChat reads an unreadable file as absent, e.g. one another
	// program holds on Windows) must not let a bot-run lesson through.
	it("a failed first read still refuses before the engine lookup", async () => {
		const { chatId, anchor } = lesson("side-flaky-read", true);
		let reads = 0;
		const flakyStore = { ...chatStore, getChat: (id: string) => (++reads === 1 ? null : chatStore.getChat(id)) };
		const seen: (string | undefined)[] = [];
		const service = createSideChatService({
			chatStore: flakyStore,
			engineFor: async (record) => { seen.push(record.driver); return Response.json({ error: "engine lookup reached" }, { status: 599 }); },
			beforeAsk: async () => {},
			instructions: () => "Side helper",
		});
		await refusalOf(await service.ask(chatId, { anchor, text: "Why approaches?", quotes: [] }));
		assert.deepEqual(seen, [], "engineFor never saw the lesson");
	});

	it("control: an ordinary lesson's question reaches the engine and the model", async () => {
		const { service, counts } = countingService();
		const { chatId, anchor } = lesson("side-control", false);
		const res = await service.ask(chatId, { anchor, text: "Why approaches?", quotes: [] });
		assert.equal(res.status, 200);
		await res.text();
		await service.settled(chatId, chatStore.getChat(chatId)!.sideChats![0]!.id);
		assert.deepEqual(counts, { beforeAsk: 1, engineFor: 1, stream: 1 });
	});

	it("the real route refuses with the production engine lookup and saves nothing", async () => {
		const { chatId, anchor } = lesson("side-route", true);
		const before = fs.readFileSync(path.join(process.env.LH_DATA_DIR!, "chats", `${chatId}.json`), "utf8");
		const res = await sideAskRoute(
			new Request(`http://test/api/chats/${chatId}/side-chats`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ anchor, text: "Why approaches?" }),
			}),
			{ params: Promise.resolve({ id: chatId }) },
		);
		await refusalOf(res);
		const now = fs.readFileSync(path.join(process.env.LH_DATA_DIR!, "chats", `${chatId}.json`), "utf8");
		assert.equal(now, before, "the chat file is unchanged");
	});

	it("the real route refuses a follow-up and a retry on a thread id the same way", async () => {
		const { chatId } = lesson("side-route-follow", true);
		for (const body of [{ threadId: "side_x", text: "And then?" }, { threadId: "side_x", retry: true }]) {
			const res = await sideAskRoute(
				new Request(`http://test/api/chats/${chatId}/side-chats`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				{ params: Promise.resolve({ id: chatId }) },
			);
			await refusalOf(res);
		}
		assert.equal(chatStore.getChat(chatId)?.sideChats, undefined, "no side thread is saved");
	});

	it("control: the real route on an ordinary lesson with no model gets the model gate's 503", async () => {
		const chat = chatStore.createChat("side-route-control");
		const explanation = { ...fauxAssistantMessage("A limit is the value a function approaches."), id: "explanation-c" };
		chatStore.saveMessages(chat.id, [newUserMessage("Teach me limits"), explanation]);
		const res = await sideAskRoute(
			new Request(`http://test/api/chats/${chat.id}/side-chats`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ anchor: { messageId: explanation.id, partId: `${explanation.id}-t0`, blockIndex: 0, blockText: "A limit" }, text: "Why?" }),
			}),
			{ params: Promise.resolve({ id: chat.id }) },
		);
		assert.equal(res.status, 503, "the ordinary path reaches the engine lookup this refusal skips");
	});
});
