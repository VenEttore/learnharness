/**
 * THE BOT TEACHER'S API (fork, ADR 0001; external-teacher ticket 03):
 * create, say, answer and show, driven through the route handlers under an
 * isolated LH_DATA_DIR. Asserts what a bot and the page see: the JSON
 * replies, and the saved record as the page's own folds read it. Every
 * app-module import is dynamic: the seam must be set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-api-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { titleFromPrompt } = await import("../src/core/contracts.ts");
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

const create = async (body: unknown) => json(await createRoute.POST(postJson("http://test/api/external/chats", body)));
const show = async (id: string) => json(await showRoute.GET(new Request(`http://test/api/external/chats/${id}`), ctx(id)));
const turn = async (id: string, body: unknown) => json(await turnRoute.POST(postJson(`http://test/api/external/chats/${id}/turn`, body), ctx(id)));
const answer = async (id: string) => json(await answerRoute.GET(new Request(`http://test/api/external/chats/${id}/answer`), ctx(id)));

/** The learner typing on the page: the ordinary chat route. */
async function learnerTypes(chatId: string, text: string): Promise<void> {
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId, input: { type: "text", text } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
}

let keys = 0;
const newKey = () => `key-${++keys}`;

describe("create", () => {
	it("makes a bot-run lesson with the prompt as its first user message", async () => {
		const { status, body } = await create({ title: "Learn   probability", key: newKey(), prompt: "Teach me Bayes" });
		assert.equal(status, 200);
		assert.equal(body.ok, true);
		assert.equal(body.existing, false);
		assert.equal(body.title, "Learn probability");
		const record = chatStore.getChat(body.id)!;
		assert.equal(record.driver, "external");
		assert.equal(record.messages.length, 1);
		assert.equal(record.messages[0]!.role, "user");
		assert.equal((record.messages[0] as { content: unknown }).content, "Teach me Bayes");
		assert.equal(body.cursor, record.messages[0]!.id);
		assert.deepEqual(body.items, [{ type: "message", id: body.cursor, text: "Teach me Bayes" }], "its cursor passes the prompt, so the reply carries it");
	});

	it("shortens a long title the way the normal create route does", async () => {
		const long = "word ".repeat(40);
		const { body } = await create({ title: long, key: newKey() });
		assert.ok(body.title.length < long.trim().length);
		assert.equal(body.title, titleFromPrompt(long));
	});

	it("returns the same lesson for the same key and saves nothing", async () => {
		const key = newKey();
		const first = await create({ title: "Once", key, prompt: "hello" });
		const before = chatStore.listChats().length;
		const second = await create({ title: "Twice", key, prompt: "hello again" });
		assert.equal(second.status, 200);
		assert.deepEqual(second.body, {
			ok: true,
			id: first.body.id,
			title: "Once",
			existing: true,
			items: [{ type: "message", id: first.body.cursor, text: "hello" }],
			cursor: first.body.cursor,
		});
		assert.equal(chatStore.listChats().length, before);
		assert.equal(chatStore.getChat(first.body.id)!.messages.length, 1);
	});

	it("a same-key rerun with a prompt saves nothing on a lesson created without one", async () => {
		const key = newKey();
		const first = await create({ title: "Bare", key });
		const second = await create({ title: "Bare", key, prompt: "now a prompt" });
		assert.deepEqual(second.body, { ok: true, id: first.body.id, title: "Bare", existing: true, items: [], cursor: first.body.id });
		assert.equal(chatStore.getChat(first.body.id)!.messages.length, 0);
	});

	it("refuses a create with no key", async () => {
		for (const body of [{ title: "No key" }, { title: "Blank", key: "  " }, null]) {
			const res = await create(body);
			assert.equal(res.status, 400);
			assert.deepEqual(res.body, { ok: false, code: "key_required" });
		}
	});

	it("gives an empty lesson its own id as the cursor; a say accepts it, and its retry is a repeat", async () => {
		const { body } = await create({ title: "Empty", key: newKey() });
		assert.equal(body.cursor, body.id);
		const said = await turn(body.id, { kind: "say", after: body.cursor, text: "Welcome." });
		assert.equal(said.status, 200);
		assert.equal(said.body.ok, true);
		const retry = await turn(body.id, { kind: "say", after: body.cursor, text: "Welcome." });
		assert.deepEqual(retry, { status: 200, body: { ok: true, repeat: true, items: [], cursor: said.body.cursor } });
		assert.equal(chatStore.getChat(body.id)!.messages.length, 1);
	});

	it("refuses a title or prompt that is not a string, saving nothing", async () => {
		const before = chatStore.listChats().length;
		const bodies = [{ title: { x: 1 }, key: newKey() }, { title: "T", key: newKey(), prompt: 42 }, { title: null, key: newKey() }, { title: "T", key: newKey(), prompt: null }];
		for (const body of bodies) {
			const res = await create(body);
			assert.equal(res.status, 422);
			assert.equal(res.body.code, "invalid");
			assert.ok(res.body.problems.length > 0);
		}
		assert.equal(chatStore.listChats().length, before);
	});
});

describe("say", () => {
	it("saves assistant text the page reads, announces it, and moves the cursor", async () => {
		const lesson = await create({ title: "Say", key: newKey(), prompt: "Teach me" });
		const events: ServerEvent[] = [];
		const off = subscribe((e) => events.push(e));
		const { status, body } = await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: "Here is **Bayes**." });
		off();
		assert.equal(status, 200);
		const record = chatStore.getChat(lesson.body.id)!;
		const said = record.messages.at(-1)!;
		assert.equal(body.cursor, said.id);
		assert.equal(said.role, "assistant");
		assert.ok(said.role === "assistant");
		assert.deepEqual(said.content, [{ type: "text", text: "Here is **Bayes**." }]);
		assert.equal(said.stopReason, "stop");
		assert.equal(phaseAt3Lh(record.messages), "probe");
		assert.ok(events.some((e) => e.type === "record-changed"));
		assert.ok(events.some((e) => e.type === "chats-changed"));
	});

	it("drops trailing newlines and keeps a Markdown hard break", async () => {
		const lesson = await create({ title: "Break", key: newKey(), prompt: "Teach me" });
		await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: "See below.  \n\n" });
		const said = chatStore.getChat(lesson.body.id)!.messages.at(-1) as { content: unknown };
		assert.deepEqual(said.content, [{ type: "text", text: "See below.  " }]);
		// The stored text says back to itself: a resume that re-sends what show returned is a repeat.
		const shown = (await show(lesson.body.id)).body.messages.at(-1).text;
		const again = await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: shown });
		assert.equal(again.body.repeat, true);
	});

	it("drops a trailing carriage return with the newlines, so a rerun with one more newline is a repeat", async () => {
		const lesson = await create({ title: "CR", key: newKey(), prompt: "Teach me" });
		await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: "line\n\n\r" });
		const count = chatStore.getChat(lesson.body.id)!.messages.length;
		const again = await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: "line\n\n\r\n" });
		assert.equal(again.body.repeat, true);
		assert.equal(chatStore.getChat(lesson.body.id)!.messages.length, count);
	});

	it("trims in linear time when a long run of newlines sits mid-text", async () => {
		const lesson = await create({ title: "Long", key: newKey(), prompt: "Teach me" });
		const text = `a${"\n".repeat(100_000)}b`;
		const started = performance.now();
		const res = await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text });
		assert.equal(res.status, 200);
		assert.ok(performance.now() - started < 1000, "a quadratic trim takes seconds here");
		const said = chatStore.getChat(lesson.body.id)!.messages.at(-1) as { content: unknown };
		assert.deepEqual(said.content, [{ type: "text", text }]);
	});

	it("drops a rerun with the same after, even after learner input arrived", async () => {
		const lesson = await create({ title: "Repeat", key: newKey(), prompt: "Teach me" });
		const id = lesson.body.id;
		const first = await turn(id, { kind: "say", after: lesson.body.cursor, text: "Step one." });
		await learnerTypes(id, "ok, and then?");
		const count = chatStore.getChat(id)!.messages.length;
		const rerun = await turn(id, { kind: "say", after: lesson.body.cursor, text: "Step one.\n" });
		assert.equal(rerun.status, 200);
		assert.equal(rerun.body.repeat, true);
		assert.notEqual(rerun.body.cursor, first.body.cursor, "the cursor is the newest message, the learner's");
		assert.deepEqual(rerun.body.items.map((i: Json) => i.text), ["ok, and then?"], "a cursor past unread input comes with it");
		assert.equal(chatStore.getChat(id)!.messages.length, count);
	});

	it("refuses a say past unread learner input with those items", async () => {
		const lesson = await create({ title: "Unread", key: newKey(), prompt: "Teach me" });
		const id = lesson.body.id;
		const said = await turn(id, { kind: "say", after: lesson.body.cursor, text: "First point." });
		await learnerTypes(id, "wait, why?");
		await learnerTypes(id, "and how?");
		const count = chatStore.getChat(id)!.messages.length;
		const { status, body } = await turn(id, { kind: "say", after: said.body.cursor, text: "Second point." });
		assert.equal(status, 409);
		assert.equal(body.code, "unread_input");
		assert.deepEqual(body.items.map((i: Json) => [i.type, i.text]), [["message", "wait, why?"], ["message", "and how?"]]);
		assert.equal(body.cursor, chatStore.getChat(id)!.messages.at(-1)!.id);
		assert.equal(chatStore.getChat(id)!.messages.length, count);

		const caughtUp = await turn(id, { kind: "say", after: body.cursor, text: "Because." });
		assert.equal(caughtUp.status, 200);
		assert.equal(caughtUp.body.repeat, undefined);
	});

	it("refuses a missing or unknown after with the cursor", async () => {
		const lesson = await create({ title: "After", key: newKey(), prompt: "Teach me" });
		for (const after of [undefined, "msg_nope", 7]) {
			const { status, body } = await turn(lesson.body.id, { kind: "say", after, text: "Hi." });
			assert.equal(status, 400);
			assert.deepEqual(body, { ok: false, code: "bad_after", items: [{ type: "message", id: lesson.body.cursor, text: "Teach me" }], cursor: lesson.body.cursor });
		}
		const notObject = await json(await turnRoute.POST(new Request(`http://test/api/external/chats/${lesson.body.id}/turn`, { method: "POST", body: "[1]" }), ctx(lesson.body.id)));
		assert.equal(notObject.status, 400);
		assert.equal(notObject.body.code, "bad_after");
		assert.equal(chatStore.getChat(lesson.body.id)!.messages.length, 1);
	});

	it("refuses empty text and unknown kinds with problem text", async () => {
		const lesson = await create({ title: "Invalid", key: newKey(), prompt: "Teach me" });
		for (const body of [
			{ kind: "say", after: lesson.body.cursor, text: "   " },
			{ kind: "say", after: lesson.body.cursor },
			{ kind: "say", after: lesson.body.cursor, text: { not: "text" } },
			{ kind: "say", after: lesson.body.cursor, text: null },
			{ kind: "say", after: lesson.body.cursor, text: 42 },
			{ kind: "dance", after: lesson.body.cursor },
		]) {
			const res = await turn(lesson.body.id, body);
			assert.equal(res.status, 422);
			assert.equal(res.body.code, "invalid");
			assert.equal(res.body.cursor, lesson.body.cursor);
			assert.ok(res.body.problems.length > 0 && res.body.problems.every((p: unknown) => typeof p === "string" && p.length > 0));
		}
		assert.equal(chatStore.getChat(lesson.body.id)!.messages.length, 1);
	});
});

describe("save failures", () => {
	it("a turn whose save fails is a JSON 500 with the cursor, and nothing changes", async () => {
		const lesson = await create({ title: "Locked", key: newKey(), prompt: "Teach me" });
		const save = chatStore.saveMessages;
		chatStore.saveMessages = () => {
			throw new Error("disk full");
		};
		try {
			const { status, body } = await turn(lesson.body.id, { kind: "say", after: lesson.body.cursor, text: "Lost?" });
			assert.equal(status, 500);
			assert.deepEqual(body, { ok: false, code: "save_failed", cursor: lesson.body.cursor });
		} finally {
			chatStore.saveMessages = save;
		}
		assert.equal(chatStore.getChat(lesson.body.id)!.messages.length, 1);
	});
});

describe("request guard", () => {
	it("refuses a browser Origin or a non-loopback Host on every external route, saving nothing", async () => {
		const lesson = await create({ title: "Guarded", key: newKey(), prompt: "Teach me" });
		const id = lesson.body.id;
		const before = chatStore.listChats().length;
		for (const [headers, code] of [[{ Origin: "https://evil.example" }, "forbidden_origin"], [{ Host: "evil.example:3000" }, "forbidden_host"]] as const) {
			const sayBody = JSON.stringify({ kind: "say", after: lesson.body.cursor, text: "injected" });
			const replies = [
				await createRoute.POST(new Request("http://test/api/external/chats", { method: "POST", headers, body: JSON.stringify({ title: "x", key: newKey() }) })),
				await turnRoute.POST(new Request(`http://test/api/external/chats/${id}/turn`, { method: "POST", headers, body: sayBody }), ctx(id)),
				await showRoute.GET(new Request(`http://test/api/external/chats/${id}`, { headers }), ctx(id)),
				await answerRoute.GET(new Request(`http://test/api/external/chats/${id}/answer`, { headers }), ctx(id)),
			];
			for (const res of replies) assert.deepEqual(await json(res), { status: 403, body: { ok: false, code } });
		}
		assert.equal(chatStore.listChats().length, before);
		assert.equal(chatStore.getChat(id)!.messages.length, 1);
		const local = await json(await showRoute.GET(new Request(`http://127.0.0.1:3000/api/external/chats/${id}`, { headers: { Host: "127.0.0.1:3000" } }), ctx(id)));
		assert.equal(local.status, 200);
	});
});

describe("lesson refusals", () => {
	it("404s an unknown lesson and 409s an ordinary one on show, turn and answer", async () => {
		const ordinary = chatStore.createChat("Ordinary");
		for (const [id, status, code] of [["chat_missing", 404, "not_found"], [ordinary.id, 409, "not_bot_run"]] as const) {
			for (const res of [await show(id), await turn(id, { kind: "say", after: id, text: "x" }), await answer(id)]) {
				assert.equal(res.status, status);
				assert.deepEqual(res.body, { ok: false, code });
			}
		}
		assert.equal(chatStore.getChat(ordinary.id)!.messages.length, 0);
	});
});

describe("answer", () => {
	it("returns the learner's messages after the bot's last message, the same on a second read", async () => {
		const lesson = await create({ title: "Answer", key: newKey(), prompt: "Teach me" });
		const id = lesson.body.id;
		const first = await answer(id);
		assert.deepEqual(first.body.items.map((i: Json) => i.text), ["Teach me"], "the prompt is input the bot has not answered");

		await turn(id, { kind: "say", after: lesson.body.cursor, text: "Point." });
		assert.deepEqual((await answer(id)).body.items, []);

		await learnerTypes(id, "one");
		await learnerTypes(id, "two");
		const read = await answer(id);
		const reread = await answer(id);
		assert.equal(read.status, 200);
		assert.deepEqual(read.body, reread.body);
		const record = chatStore.getChat(id)!;
		assert.deepEqual(read.body.items, record.messages.slice(-2).map((m) => ({ type: "message", id: m.id, text: (m as { content: string }).content })));
		assert.equal(read.body.openQuestion, null);
		assert.equal(read.body.cursor, record.messages.at(-1)!.id);
	});
});

describe("show", () => {
	it("reads an empty lesson", async () => {
		const lesson = await create({ title: "Blank", key: newKey() });
		const { body } = await show(lesson.body.id);
		assert.deepEqual(body, { ok: true, id: lesson.body.id, title: "Blank", phase: "probe", plan: null, openQuestion: null, messages: [], items: [], cursor: lesson.body.id });
	});

	it("returns phase, a null plan, no open question, compact messages, the unread items and the cursor", async () => {
		const lesson = await create({ title: "Show", key: newKey(), prompt: "Teach me" });
		const id = lesson.body.id;
		await turn(id, { kind: "say", after: lesson.body.cursor, text: "Point." });
		await learnerTypes(id, "thanks");
		const { status, body } = await show(id);
		const record = chatStore.getChat(id)!;
		assert.equal(status, 200);
		assert.deepEqual(body, {
			ok: true,
			id,
			title: "Show",
			phase: "probe",
			plan: null,
			openQuestion: null,
			messages: [
				{ id: record.messages[0]!.id, role: "user", text: "Teach me" },
				{ id: record.messages[1]!.id, role: "assistant", text: "Point." },
				{ id: record.messages[2]!.id, role: "user", text: "thanks" },
			],
			items: [{ type: "message", id: record.messages[2]!.id, text: "thanks" }],
			cursor: record.messages[2]!.id,
		});
	});

	it("keeps a question's call id, and reports it as the open question", async () => {
		const lesson = await create({ title: "Question", key: newKey() });
		const id = lesson.body.id;
		const { newBotAssistantMessage, commitBotRun } = await import("../src/server/bot-run.ts");
		const input = { question: "Which?", options: [{ label: "A" }, { label: "B" }] };
		const asked = newBotAssistantMessage([{ type: "toolCall", id: "call_ask_1", name: "ask_user_question", arguments: input }]);
		commitBotRun(id, [asked]);
		const { body } = await show(id);
		assert.deepEqual(body.messages, [{ id: asked.id, role: "assistant", text: "", calls: [{ toolCallId: "call_ask_1", tool: "ask_user_question", input }] }]);
		assert.deepEqual(body.openQuestion, { toolCallId: "call_ask_1", tool: "ask_user_question", text: "", input });
	});

	it("reports the open question's lead-in text, in show and in answer", async () => {
		const lesson = await create({ title: "Lead-in", key: newKey() });
		const id = lesson.body.id;
		const input = { question: "Which?", options: [{ label: "A" }, { label: "B" }] };
		const asked = await turn(id, { kind: "ask", after: lesson.body.cursor, text: "Before you pick: A is the classic answer.\n", ...input });
		assert.equal(asked.status, 200);
		const { body } = await show(id);
		assert.equal(body.openQuestion.text, "Before you pick: A is the classic answer.");
		assert.deepEqual(body.openQuestion.input, input);
		const read = await answer(id);
		assert.deepEqual(read.body.openQuestion, body.openQuestion);
	});
});
