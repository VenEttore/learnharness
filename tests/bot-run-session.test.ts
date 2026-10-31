/**
 * BOT-RUN SESSION MODEL (fork, ADR 0001; external-teacher ticket 04): a
 * bot-run lesson's page never answers a record with its own `continue` —
 * an outside teacher writes the next turn. Typed input still sends.
 * Ordinary lessons keep their automatic continuation (the control).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { newAnswerResult } from "../src/core/native-messages.ts";
import { buildAnswer } from "../src/core/question-core.ts";

const question = {
	id: "a1",
	role: "assistant",
	content: [{ type: "toolCall", id: "q1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse",
	usage: { input: 0, output: 0, total: 0, cacheReads: 0, cacheWrites: 0 },
	timestamp: 0,
	provider: "external",
	model: "bot",
} as unknown as LhMessage;
const answer = buildAnswer({ id: "q1", kind: "quiz", question: "Q?", mode: "single-select", options: [], createdAt: "fixture" }, { dontKnow: true });
/** An answered question: an ordinary lesson owes a `continue` here. */
const answered = [question, newAnswerResult("q1", "quiz", answer)];

function session(botRun: boolean, initialMessages: LhMessage[] = answered) {
	const posts: string[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url === "/api/chat") {
			posts.push(String(init?.body));
			return Response.json({ ok: true });
		}
		if (url === "/api/chats/chat_x") return Response.json({ messages: initialMessages });
		if (url === "/api/chats/chat_x/stream") return new Response("data: [DONE]\n\n", { status: 200 });
		throw new Error(`unexpected fetch: ${url}`);
	}) as typeof globalThis.fetch;
	const model = new SessionModel({ chatId: "chat_x", initialMessages, botRun, fetch });
	return { model, posts };
}

describe("bot-run lesson: no automatic continue", () => {
	it("on mount: an owed record sends nothing", async () => {
		assert.equal(SessionModel.needsContinuation(answered), true, "the fixture is owed a continuation");
		const { model, posts } = session(true);
		await model.continueIfOwed(answered);
		assert.deepEqual(posts, []);
	});

	it("after a sync: the synced owed record sends nothing", async () => {
		const { model, posts } = session(true, []);
		model.setMessages(answered);
		await model.continueIfOwed(answered);
		assert.deepEqual(posts, []);
	});

	it("typed text still sends", async () => {
		const { model, posts } = session(true);
		await model.send({ type: "text", text: "my answer" });
		assert.equal(posts.length, 1);
		assert.equal(JSON.parse(posts[0]!).input.type, "text");
	});

	it("control: an ordinary lesson still continues once", async () => {
		const { model, posts } = session(false);
		await model.continueIfOwed(answered);
		assert.equal(posts.length, 1);
		assert.equal(JSON.parse(posts[0]!).input.type, "continue");
	});
});
