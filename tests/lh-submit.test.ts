/**
 * `lh submit` (external-teacher ticket 21): a learner's answer given
 * outside the page (a chat widget on a phone) is saved through the page's
 * own routes and stored as the page stores it. Picks are option numbers in
 * the order the question card shows. A pick without a confidence, a null
 * pick or a pick out of range is refused before anything is sent, and a
 * retried submit is a repeat.
 *
 * lh runs as a real child process against LearnHarness's real route
 * handlers (the external routes, POST /api/chat, and the dismiss route)
 * behind a plain HTTP server, under an isolated LH_DATA_DIR set before any
 * app module loads.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-submit-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const chatRoute = await import("../app/api/chat/route.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { questionCardOf } = await import("../src/core/question-card.ts");

const LH = path.join(import.meta.dirname, "..", "scripts", "lh.mjs");

type Json = Record<string, any>;

/** Every request the app served, as `METHOD path`. */
const served: string[] = [];

const app = http.createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk: Buffer) => chunks.push(chunk));
	req.on("end", async () => {
		const pathname = new URL(req.url!, "http://x").pathname;
		served.push(`${req.method} ${pathname}`);
		const request = new Request(`http://${req.headers.host}${req.url}`, {
			method: req.method,
			headers: req.headers as Record<string, string>,
			body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
		});
		const ext = /^\/api\/external\/chats(?:\/([^/]+)(\/turn|\/answer)?)?$/.exec(pathname);
		const dismiss = /^\/api\/chats\/([^/]+)\/dismiss$/.exec(pathname);
		const ctx = (id: string) => ({ params: Promise.resolve({ id: decodeURIComponent(id) }) });
		let reply: Response;
		if (ext && !ext[1] && req.method === "POST") reply = await createRoute.POST(request);
		else if (ext && ext[1] && !ext[2] && req.method === "GET") reply = await showRoute.GET(request, ctx(ext[1]));
		else if (ext && ext[2] === "/turn" && req.method === "POST") reply = await turnRoute.POST(request, ctx(ext[1]!));
		else if (ext && ext[2] === "/answer" && req.method === "GET") reply = await answerRoute.GET(request, ctx(ext[1]!));
		else if (pathname === "/api/chat" && req.method === "POST") reply = await chatRoute.POST(request);
		else if (dismiss && req.method === "POST") reply = await dismissRoute.POST(request, ctx(dismiss[1]!));
		else reply = new Response("not found", { status: 404 });
		res.writeHead(reply.status, { "Content-Type": reply.headers.get("content-type") ?? "text/plain" });
		res.end(await reply.text());
	});
});
let url = "";
before(async () => {
	await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
	url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(async () => {
	app.closeAllConnections();
	await new Promise<void>((resolve) => app.close(() => resolve()));
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

function lh(args: string[], stdin = ""): Promise<{ code: number; json: Json }> {
	return new Promise((resolve) => {
		const child = execFile(process.execPath, [LH, ...args], { env: { ...process.env, LH_URL: url } }, (err, stdout) => {
			const lines = stdout.split("\n").filter(Boolean);
			resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0, json: lines[0] ? JSON.parse(lines[0]) : undefined });
		});
		child.stdin!.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code !== "EPIPE") throw err;
		});
		child.stdin!.end(stdin);
	});
}

const PROBE = {
	question: "With $n$ items, how many comparisons does binary search need?",
	options: [
		{ label: "About $\\log_2 n$", value: "log" },
		{ label: "About $n/2$", value: "half" },
		{ label: "About $n$", value: "n" },
		{ label: "About $k$", value: "k" },
	],
	explanation: "Each comparison halves the range, so $\\log_2 n$ halvings reach one item.",
	correctAnswer: "log",
};
const ASK = { question: "Where are you headed?", options: [{ label: "Intuition", value: "intuition" }, { label: "Exam prep", value: "exam" }, { label: "Both", value: "both" }] };
const RECALL = { question: "Why must the list be sorted?", correctAnswer: "Each step throws away the half that cannot hold the target." };

let keys = 0;
/** A bot-run lesson with `payload` asked as `kind`: its id, the cursor
 *  after the question, and the question's call id. */
async function asked(kind: string, payload: object): Promise<{ id: string; cursor: string; toolCallId: string }> {
	const created = await lh(["lesson", "new", "--title", "Submit", "--key", `submit-${++keys}`]);
	assert.equal(created.code, 0, JSON.stringify(created.json));
	const turn = await lh([kind, created.json.id, "--after", created.json.cursor], JSON.stringify(payload));
	assert.equal(turn.code, 0, JSON.stringify(turn.json));
	return { id: created.json.id, cursor: turn.json.cursor, toolCallId: turn.json.openQuestion?.toolCallId ?? (await lh(["show", created.json.id])).json.openQuestion.toolCallId };
}

/** The card's number for the option labelled `label`. */
function cardNumber(id: string, label: string): number {
	const question = questionCardOf(chatStore.getChat(id)!.messages).question!;
	return question.options.find((o) => o.label === label)!.number;
}

/** The stored answer record (the question result's details). */
function storedAnswers(id: string): Json[] {
	return chatStore.getChat(id)!.messages.flatMap((m) => (m.role === "toolResult" && m.toolName !== "plan_init" ? [m.details as Json] : []));
}

function chatPosts(): number {
	return served.filter((s) => s === "POST /api/chat" || s.endsWith("/dismiss")).length;
}

describe("lh submit", () => {
	it("one shot: a pick by card number, confidence and thinking store the page's record", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const card = questionCardOf(chatStore.getChat(id)!.messages).question!;
		const pick = cardNumber(id, "About $\\log_2 n$");
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [pick], confidence: 70, thinking: "  each step halves $n$  " }));
		assert.equal(res.code, 0, JSON.stringify(res.json));
		assert.equal(res.json.ok, true);
		assert.equal(res.json.repeat, false);
		// Read back as lh answer returns it.
		const item = res.json.items.at(-1);
		assert.deepEqual(
			{ type: item.type, answers: item.answers, confidence: item.confidence, correct: item.correct, thinking: item.thinking, dontKnow: item.dontKnow },
			{ type: "answer", answers: [{ index: pick, label: "About $\\log_2 n$" }], confidence: 70, correct: true, thinking: "each step halves $n$", dontKnow: false },
		);
		assert.equal(res.json.openQuestion, null);
		// The record the page's dock stores for the same selection
		// (tests/bot-run-answers.test.ts), options in the card's order.
		const [stored] = storedAnswers(id);
		const { answeredAt, ...rest } = stored!;
		assert.equal(typeof answeredAt, "string");
		assert.deepEqual(rest, {
			kind: "quiz",
			tool: "probe",
			questionText: PROBE.question,
			options: card.options.map((o) => ({ index: o.number, label: o.label })),
			dontKnow: false,
			answers: [{ index: pick, label: "About $\\log_2 n$", value: "log" }],
			thinking: "each step halves $n$",
			confidence: 70,
			correct: true,
			correctIndices: [pick],
			explanation: PROBE.explanation,
		});
	});

	it("grades a wrong pick wrong", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [cardNumber(id, "About $k$")], confidence: 90 }));
		assert.equal(res.code, 0, JSON.stringify(res.json));
		assert.equal(storedAnswers(id)[0]!.correct, false);
		assert.equal(storedAnswers(id)[0]!.answers[0].value, "k");
	});

	it("refuses a pick without a confidence, or with one off the page's scale, before sending anything", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const before = chatStore.getChat(id)!.messages.length;
		const posts = chatPosts();
		for (const payload of [{ picks: [1] }, { picks: [1], confidence: 150 }, { picks: [1], confidence: 60 }]) {
			const res = await lh(["submit", id, "--after", cursor], JSON.stringify(payload));
			assert.equal(res.code, 1);
			assert.equal(res.json.code, "invalid", JSON.stringify(res.json));
			assert.match(res.json.problems.join(" "), /confidence/);
		}
		const typed = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [1], confidence: "high" }));
		assert.equal(typed.json.code, "usage");
		assert.equal(chatPosts(), posts, "nothing reached the page route");
		assert.equal(chatStore.getChat(id)!.messages.length, before);
	});

	it("refuses a null, out-of-range or doubled pick before sending anything", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const posts = chatPosts();
		const nulls = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [null], confidence: 50 }));
		assert.equal(nulls.json.code, "usage");
		for (const picks of [[0], [5], [1, 1], [1, 2]]) {
			const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks, confidence: 50 }));
			assert.equal(res.code, 1);
			assert.equal(res.json.code, "invalid", JSON.stringify(res.json));
		}
		const out = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [5], confidence: 50 }));
		assert.deepEqual(out.json.options.map((o: Json) => o.number), [1, 2, 3, 4], "the refusal lists the card's options");
		assert.equal(chatPosts(), posts);
	});

	it("accepts \"I don't know\" without a confidence", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ dontKnow: true }));
		assert.equal(res.code, 0, JSON.stringify(res.json));
		const [stored] = storedAnswers(id);
		assert.equal(stored!.dontKnow, true);
		assert.equal(stored!.correct, false);
		assert.equal("confidence" in stored!, false);
		assert.deepEqual(stored!.answers, []);
	});

	it("skips the way the page's Skip does", async () => {
		const { id, cursor, toolCallId } = await asked("probe", PROBE);
		const res = await lh(["submit", id, "--after", cursor, "--skip"]);
		assert.equal(res.code, 0, JSON.stringify(res.json));
		assert.deepEqual(res.json.items.at(-1), { type: "skip", id: res.json.cursor, toolCallId, kind: "quiz" });
		const { answeredAt, ...rest } = storedAnswers(id)[0]!;
		assert.equal(typeof answeredAt, "string");
		assert.deepEqual(rest, { kind: "quiz", questionText: PROBE.question, dontKnow: false, answers: [], dismissed: true });
	});

	it("a retry is a repeat; a different answer afterwards is refused", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const payload = JSON.stringify({ picks: [2], confidence: 30, thinking: "guess" });
		const first = await lh(["submit", id, "--after", cursor], payload);
		assert.equal(first.code, 0, JSON.stringify(first.json));
		const posts = chatPosts();
		const again = await lh(["submit", id, "--after", cursor], payload);
		assert.equal(again.code, 0, JSON.stringify(again.json));
		assert.equal(again.json.repeat, true);
		assert.equal(again.json.cursor, first.json.cursor);
		assert.equal(chatPosts(), posts, "a repeat sends nothing");
		assert.equal(storedAnswers(id).length, 1);
		const other = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [3], confidence: 30, thinking: "guess" }));
		assert.equal(other.code, 1);
		assert.equal(other.json.code, "answered");
		const skip = await lh(["submit", id, "--after", cursor, "--skip"]);
		assert.equal(skip.json.code, "answered");
		assert.equal(storedAnswers(id).length, 1);
	});

	it("a retried skip and a retried \"I don't know\" are repeats", async () => {
		const skipped = await asked("probe", PROBE);
		assert.equal((await lh(["submit", skipped.id, "--after", skipped.cursor, "--skip"])).code, 0);
		assert.equal((await lh(["submit", skipped.id, "--after", skipped.cursor, "--skip"])).json.repeat, true);
		const declined = await asked("probe", PROBE);
		assert.equal((await lh(["submit", declined.id, "--after", declined.cursor], '{"dontKnow":true}')).code, 0);
		assert.equal((await lh(["submit", declined.id, "--after", declined.cursor], '{"dontKnow":true}')).json.repeat, true);
		assert.equal(storedAnswers(declined.id).length, 1);
	});

	it("ask options keep their authored order; Other carries the learner's own answer", async () => {
		const { id, cursor } = await asked("ask", ASK);
		assert.equal(cardNumber(id, "Exam prep"), 2);
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [2], thinking: "test on Friday" }));
		assert.equal(res.code, 0, JSON.stringify(res.json));
		assert.deepEqual(storedAnswers(id)[0]!.answers, [{ index: 2, label: "Exam prep", value: "exam" }]);
		const other = await asked("ask", ASK);
		const own = await lh(["submit", other.id, "--after", other.cursor], JSON.stringify({ other: "  just curious  " }));
		assert.equal(own.code, 0, JSON.stringify(own.json));
		assert.equal(storedAnswers(other.id)[0]!.other, "just curious");
		const both = await asked("ask", ASK);
		const mixed = await lh(["submit", both.id, "--after", both.cursor], JSON.stringify({ picks: [1], other: "my own" }));
		assert.equal(mixed.json.code, "invalid", "a single-select pick and Other never ride together on the page");
		assert.equal(storedAnswers(both.id).length, 0);
		const multi = await asked("ask", { ...ASK, multiSelect: true });
		const beside = await lh(["submit", multi.id, "--after", multi.cursor], JSON.stringify({ picks: [1, 3], other: "my own" }));
		assert.equal(beside.code, 0, JSON.stringify(beside.json));
		assert.deepEqual(storedAnswers(multi.id)[0]!.answers.map((a: Json) => a.index), [1, 3]);
		assert.equal(storedAnswers(multi.id)[0]!.other, "my own");
		const conf = await lh(["submit", other.id, "--after", other.cursor], JSON.stringify({ picks: [1] }));
		assert.equal(conf.json.code, "answered");
	});

	it("a recall takes the typed answer in text, and nothing else", async () => {
		const { id, cursor } = await asked("recall", RECALL);
		const picked = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [1] }));
		assert.equal(picked.json.code, "invalid");
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ text: "Sorted order lets you drop $n/2$ items." }));
		assert.equal(res.code, 0, JSON.stringify(res.json));
		const stored = storedAnswers(id)[0]!;
		assert.equal(stored.text, "Sorted order lets you drop $n/2$ items.");
		assert.equal(stored.committed, RECALL.correctAnswer);
	});

	it("refuses when the learner typed after --after, and accepts with the new cursor", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		await chatRoute.POST(new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: id, input: { type: "text", text: "what does log mean?" } }) })).then((r) => r.text());
		const stale = await lh(["submit", id, "--after", cursor], JSON.stringify({ dontKnow: true }));
		assert.equal(stale.code, 1);
		assert.equal(stale.json.code, "unread_input");
		assert.deepEqual(stale.json.items.map((i: Json) => i.text), ["what does log mean?"]);
		const ok = await lh(["submit", id, "--after", stale.json.cursor], JSON.stringify({ dontKnow: true }));
		assert.equal(ok.code, 0, JSON.stringify(ok.json));
	});

	it("refuses with no open question, a bad --after, or unknown fields", async () => {
		const created = await lh(["lesson", "new", "--title", "Empty", "--key", `submit-${++keys}`]);
		const none = await lh(["submit", created.json.id, "--after", created.json.cursor], '{"dontKnow":true}');
		assert.equal(none.json.code, "no_open_question");
		const { id } = await asked("probe", PROBE);
		const bad = await lh(["submit", id, "--after", "msg_nope"], '{"dontKnow":true}');
		assert.equal(bad.json.code, "bad_after");
		const unknown = await lh(["submit", id, "--after", "x"], '{"pick":1}');
		assert.equal(unknown.json.code, "usage");
		assert.match(unknown.json.error, /unknown field "pick"/);
		const noAfter = await lh(["submit", id], '{"dontKnow":true}');
		assert.equal(noAfter.json.code, "usage");
	});
});
