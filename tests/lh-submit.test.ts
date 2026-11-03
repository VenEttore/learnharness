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
/** Runs before the app serves a POST /api/chat; a Response replaces the
 *  route's own reply. Lets a test make the save fail, or let the page
 *  answer first. */
let beforeChatPost: (() => Promise<Response | void>) | null = null;

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
		else if (pathname === "/api/chat" && req.method === "POST") reply = (await beforeChatPost?.()) || (await chatRoute.POST(request));
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
		const mixed = await lh(["submit", id, "--after", cursor], JSON.stringify({ skip: true, picks: [1], confidence: 70 }));
		assert.equal(mixed.json.code, "usage", "an answer beside a skip is refused, never turned into a skip");
		const flag = await lh(["submit", id, "--after", cursor, "--skip"], "{}");
		assert.equal(flag.json.code, "usage");
		assert.equal(storedAnswers(id).length, 0);
		const res = await lh(["submit", id, "--after", cursor], '{"skip":true}');
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
		const later = await lh(["submit", id, "--after", first.json.cursor], payload);
		assert.equal(later.json.repeat, true, "a retry with the cursor from a later reply is a repeat too");
		const other = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [3], confidence: 30, thinking: "guess" }));
		assert.equal(other.code, 1);
		assert.equal(other.json.code, "answered");
		assert.deepEqual(other.json.saved.answers.map((a: Json) => a.index), [2]);
		assert.equal(other.json.saved.confidence, 30);
		const skip = await lh(["submit", id, "--after", cursor], '{"skip":true}');
		assert.equal(skip.json.code, "answered");
		const replied = await lh(["say", id, "--after", first.json.cursor], "Noted.");
		assert.equal(replied.code, 0, JSON.stringify(replied.json));
		const afterReply = await lh(["submit", id, "--after", replied.json.cursor], payload);
		assert.equal(afterReply.json.code, "no_open_question", "once the bot replied, the question is behind it");
		assert.equal(storedAnswers(id).length, 1);
	});

	it("a stale --after from before the next question is refused, and the open question still takes its answer", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const payload = JSON.stringify({ picks: [1], confidence: 50 });
		const first = await lh(["submit", id, "--after", cursor], payload);
		assert.equal(first.code, 0, JSON.stringify(first.json));
		const next = await lh(["probe", id, "--after", first.json.cursor], JSON.stringify({ ...PROBE, text: "One more." }));
		assert.equal(next.code, 0, JSON.stringify(next.json));
		const posts = chatPosts();
		for (const body of [payload, JSON.stringify({ picks: [2], confidence: 50 })]) {
			const stale = await lh(["submit", id, "--after", first.json.cursor], body);
			assert.equal(stale.code, 1, JSON.stringify(stale.json));
			assert.equal(stale.json.code, "no_open_question");
			assert.equal(stale.json.cursor, next.json.cursor);
		}
		assert.equal(chatPosts(), posts);
		// An answer that would not fit either question still gets the stale-cursor refusal.
		const invalid = await lh(["submit", id, "--after", first.json.cursor], JSON.stringify({ picks: [9] }));
		assert.equal(invalid.json.code, "no_open_question", JSON.stringify(invalid.json));
		const fresh = await lh(["submit", id, "--after", next.json.cursor], payload);

		assert.equal(fresh.code, 0, JSON.stringify(fresh.json));
		assert.equal(fresh.json.repeat, false);
		assert.equal(storedAnswers(id).length, 2);
	});

	it("a save the page route refuses twice is refused with its status and the cursor, and saves nothing", async () => {
		const { id, cursor } = await asked("probe", PROBE);
		const posts = chatPosts();
		beforeChatPost = async () => Response.json({ error: "busy" }, { status: 503 });
		try {
			const res = await lh(["submit", id, "--after", cursor], '{"dontKnow":true}');
			assert.equal(res.code, 1);
			assert.deepEqual(res.json, { ok: false, code: "refused", status: 503, error: "busy", cursor });
		} finally {
			beforeChatPost = null;
		}
		assert.equal(chatPosts() - posts, 2, "one resend after the first refusal");
		assert.equal(storedAnswers(id).length, 0);
	});

	it("when the page answers between lh's read and its save, a different answer is refused as answered", async () => {
		const { id, cursor, toolCallId } = await asked("probe", PROBE);
		beforeChatPost = async () => {
			beforeChatPost = null;
			// The learner answers on the page first: the dock's record for "I don't know".
			const page = await lh(["submit", id, "--after", cursor], '{"dontKnow":true}');
			assert.equal(page.code, 0, JSON.stringify(page.json));
		};
		const res = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [1], confidence: 50 }));
		assert.equal(res.code, 1, JSON.stringify(res.json));
		assert.equal(res.json.code, "answered");
		assert.equal(res.json.toolCallId, toolCallId);
		assert.equal(res.json.saved.dontKnow, true);
		assert.equal(storedAnswers(id).length, 1);
		const unfit = await lh(["submit", id, "--after", cursor], JSON.stringify({ picks: [1] }));
		assert.equal(unfit.json.code, "answered", "an answer missing its confidence is still told the question is answered");
		assert.equal(unfit.json.saved.dontKnow, true);
	});

	it("a retried skip and a retried \"I don't know\" are repeats", async () => {
		const skipped = await asked("probe", PROBE);
		assert.equal((await lh(["submit", skipped.id, "--after", skipped.cursor], '{"skip":true}')).code, 0);
		assert.equal((await lh(["submit", skipped.id, "--after", skipped.cursor], '{"skip":true}')).json.repeat, true);
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

/** External-teacher ticket 26: `lh show` and `lh answer` report the open
 *  question's options as the card numbers them, so a bot never needs the
 *  card to learn the order. */
describe("openQuestion.options", () => {
	const QUIZ = {
		type: "predict",
		nodeId: "halving",
		question: "You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?",
		options: [
			{ label: "7 or 8", value: "half" },
			{ label: "15", value: "all-but-one" },
			{ label: "16", value: "all" },
			{ label: "1", value: "one" },
			{ label: "0", value: "none" },
		],
		explanation: "Everything from the middle up is larger, so only the lower half is left.",
		correctAnswer: "half",
	};

	/** A lesson in the plan phase with QUIZ asked as its first teaching question. */
	async function quizAsked(): Promise<{ id: string; cursor: string }> {
		const created = await lh(["lesson", "new", "--title", "Quiz", "--key", `submit-${++keys}`]);
		const done = await lh(["probe-done", created.json.id, "--after", created.json.cursor], JSON.stringify({ assessment: { strands: [{ strand: "search", assessment: "Knows linear search." }], summary: "Start from halving." } }));
		assert.equal(done.code, 0, JSON.stringify(done.json));
		const plan = await lh(["plan", created.json.id, "--after", done.json.cursor], "graph TD\n  halving[Halving] --> logn[log n]");
		assert.equal(plan.code, 0, JSON.stringify(plan.json));
		const quiz = await lh(["quiz", created.json.id, "--after", plan.json.cursor], JSON.stringify(QUIZ));
		assert.equal(quiz.code, 0, JSON.stringify(quiz.json));
		return { id: created.json.id, cursor: quiz.json.cursor };
	}

	/** show and answer report the same options, numbered as the card numbers them. */
	async function reported(id: string): Promise<Json[]> {
		const shown = await lh(["show", id]);
		const read = await lh(["answer", id]);
		assert.equal(shown.code, 0, JSON.stringify(shown.json));
		assert.deepEqual(read.json.openQuestion, shown.json.openQuestion);
		return shown.json.openQuestion.options;
	}

	/** For each card number, on a fresh lesson (each call id has its own
	 *  shuffle): the options lh reports are the card's, numbered 1..n, and
	 *  submitting that number saves the option lh reported behind it. */
	async function matchesCardAndSubmit(tool: string, authored: { label: string; value: string }[], ask: () => Promise<{ id: string; cursor: string }>) {
		const orders: string[][] = [];
		for (let number = 1; number <= authored.length; number++) {
			const lesson = await ask();
			const options = await reported(lesson.id);
			const card = questionCardOf(chatStore.getChat(lesson.id)!.messages).question!;
			assert.equal(card.tool, tool);
			assert.deepEqual(options.map((o) => ({ number: o.number, label: o.label })), card.options.map((o) => ({ number: o.number, label: o.label })));
			assert.deepEqual(options.map((o) => o.number), authored.map((_, i) => i + 1));
			assert.deepEqual(new Set(options.map((o) => `${o.label}=${o.value}`)), new Set(authored.map((o) => `${o.label}=${o.value}`)));
			orders.push(options.map((o) => o.value));
			const picked = options[number - 1]!;
			const res = await lh(["submit", lesson.id, "--after", lesson.cursor], JSON.stringify({ picks: [number], confidence: 50 }));
			assert.equal(res.code, 0, JSON.stringify(res.json));
			assert.deepEqual(storedAnswers(lesson.id).at(-1)!.answers, [{ index: number, label: picked.label, value: picked.value }]);
		}
		assert.ok(orders.some((order) => order.join() !== authored.map((o) => o.value).join()), "shuffled: some lesson's order is not the authored one");
	}

	it("a shuffled probe: lh's numbers are the card's, and lh submit saves the option behind each", async () => {
		await matchesCardAndSubmit("probe", PROBE.options, () => asked("probe", PROBE));
	});

	it("a shuffled quiz: lh's numbers are the card's, and lh submit saves the option behind each", async () => {
		await matchesCardAndSubmit("quiz", QUIZ.options, quizAsked);
	});

	it("an ask keeps its authored order and its descriptions", async () => {
		const input = { ...ASK, options: [ASK.options[0]!, { ...ASK.options[1]!, description: "Practice under time" }, ASK.options[2]!] };
		const { id } = await asked("ask", input);
		const options = await reported(id);
		assert.deepEqual(options, [
			{ number: 1, label: "Intuition", value: "intuition" },
			{ number: 2, label: "Exam prep", value: "exam", description: "Practice under time" },
			{ number: 3, label: "Both", value: "both" },
		]);
		assert.deepEqual(options.map((o) => o.number), questionCardOf(chatStore.getChat(id)!.messages).question!.options.map((o) => o.number));
	});

	it("a question without options reports an empty list", async () => {
		const recall = await asked("recall", RECALL);
		assert.deepEqual(await reported(recall.id), []);
		const typed = await asked("ask", { question: "What do you already know?" });
		assert.deepEqual(await reported(typed.id), []);
	});
});
