/**
 * `lh` edge paths (external-teacher ticket 18), checked against what
 * docs/external-teacher.md promises the Bot Teacher:
 *
 * - a server on LH_URL that answers with something other than JSON gives
 *   `bad_reply` and exit 1;
 * - a server that never answers gives `unreachable`, "did not answer", and
 *   exit 3;
 * - a failed save on `lh lesson new` gives `save_failed` with no cursor,
 *   and a rerun with the same key makes the lesson once;
 * - `unread_input` items start after `--after` when that is newer than the
 *   bot's last turn, and `bad_after` items start after the last turn.
 *
 * lh runs as a real child process. The last two talk to the real external
 * route handlers behind a plain HTTP server, under an isolated LH_DATA_DIR
 * (set before any app module loads).
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-edge-paths-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { chatStore } = await import("../src/store/chats.ts");

const LH = path.join(import.meta.dirname, "..", "scripts", "lh.mjs");
const CHATS = path.join(TMP_DATA, "chats");

type Json = Record<string, any>;

/** Run lh against `url`, with stdin closed after `stdin`. */
function lh(url: string, args: string[], stdin = ""): Promise<{ code: number; lines: string[]; json: Json }> {
	return new Promise((resolve) => {
		const child = execFile(process.execPath, [LH, ...args], { env: { ...process.env, LH_URL: url } }, (err, stdout) => {
			const lines = stdout.split("\n").filter(Boolean);
			resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0, lines, json: lines[0] ? JSON.parse(lines[0]) : undefined });
		});
		child.stdin!.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code !== "EPIPE") throw err;
		});
		child.stdin!.end(stdin);
	});
}

async function listen(server: http.Server): Promise<string> {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: http.Server): Promise<void> {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** LearnHarness's external routes behind a plain HTTP server: lh's
 *  request goes through the same handlers Next would call. */
const app = http.createServer((req, res) => {
	const chunks: Buffer[] = [];
	req.on("data", (chunk: Buffer) => chunks.push(chunk));
	req.on("end", async () => {
		const pathname = new URL(req.url!, "http://x").pathname;
		const request = new Request(`http://${req.headers.host}${req.url}`, {
			method: req.method,
			headers: req.headers as Record<string, string>,
			body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
		});
		const m = /^\/api\/external\/chats(?:\/([^/]+)(\/turn|\/answer)?)?$/.exec(pathname);
		const ctx = { params: Promise.resolve({ id: decodeURIComponent(m?.[1] ?? "") }) };
		let reply: Response;
		if (m && !m[1] && req.method === "POST") reply = await createRoute.POST(request);
		else if (m && m[1] && !m[2] && req.method === "GET") reply = await showRoute.GET(request, ctx);
		else if (m && m[2] === "/turn" && req.method === "POST") reply = await turnRoute.POST(request, ctx);
		else if (m && m[2] === "/answer" && req.method === "GET") reply = await answerRoute.GET(request, ctx);
		else reply = new Response("not found", { status: 404 });
		res.writeHead(reply.status, { "Content-Type": reply.headers.get("content-type") ?? "text/plain" });
		res.end(await reply.text());
	});
});
let appUrl = "";
before(async () => {
	appUrl = await listen(app);
});
after(async () => {
	await close(app);
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

/** The learner typing on the page: the ordinary chat route. */
async function learnerTypes(chatId: string, text: string): Promise<string> {
	const res = await handleChatRequest(
		new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId, input: { type: "text", text } }) }),
		() => {
			throw new Error("a bot-run lesson asked for a model agent");
		},
	);
	assert.equal(res.status, 200);
	await res.text();
	return chatStore.getChat(chatId)!.messages.at(-1)!.id;
}

describe("lh against a server that answers with something other than JSON", () => {
	it("prints bad_reply with the status and the start of the text, and exits 1", async () => {
		const page = `<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1>${"x".repeat(1000)}</body></html>`;
		let status = 500;
		const other = http.createServer((_req, res) => {
			res.writeHead(status, { "Content-Type": "text/html" });
			res.end(page);
		});
		const url = await listen(other);
		try {
			const errorPage = await lh(url, ["show", "chat_a"]);
			assert.equal(errorPage.code, 1);
			assert.equal(errorPage.lines.length, 1);
			assert.deepEqual(errorPage.json, { ok: false, code: "bad_reply", status: 500, error: page.slice(0, 500) });

			// Another program on the port that answers 200 with HTML is not ok either.
			status = 200;
			const otherProgram = await lh(url, ["say", "chat_a", "--after", "msg_1"], "hello");
			assert.equal(otherProgram.code, 1);
			assert.equal(otherProgram.json.ok, false);
			assert.equal(otherProgram.json.code, "bad_reply");
			assert.equal(otherProgram.json.status, 200);
		} finally {
			await close(other);
		}
	});
});

describe("lh against a server that never answers", () => {
	it("gives up after 30 s with unreachable, \"did not answer\", and exit 3", { timeout: 90_000 }, async () => {
		let requests = 0;
		// Takes the request and never replies, like a server stuck compiling.
		const stuck = http.createServer(() => {
			requests++;
		});
		const url = await listen(stuck);
		try {
			const started = Date.now();
			const { code, lines, json } = await lh(url, ["show", "chat_a"]);
			const seconds = (Date.now() - started) / 1000;
			assert.equal(code, 3);
			assert.equal(lines.length, 1);
			assert.equal(json.ok, false);
			assert.equal(json.code, "unreachable");
			assert.match(json.error, /did not answer within 30 s/);
			assert.ok(json.error.includes(url), "names the URL it tried");
			assert.match(json.error, /LH_URL/);
			assert.equal(json.guide, "docs/external-teacher.md");
			assert.equal(requests, 1);
			assert.ok(seconds >= 29, `waited ${seconds} s`);
		} finally {
			await close(stuck);
		}
	});
});

describe("lh lesson new when the save fails", () => {
	// A read-only chats directory makes the write of the lesson file fail.
	// Root ignores the mode bits, so the case cannot be staged there.
	const isRoot = process.getuid?.() === 0;

	it("prints save_failed with no cursor, and a rerun with the same key makes the lesson once", { skip: isRoot && "root ignores a read-only directory" }, async () => {
		fs.mkdirSync(CHATS, { recursive: true });
		const before = new Set(fs.readdirSync(CHATS));
		const args = ["lesson", "new", "--title", "Binary search", "--key", "save-fails-1", "--prompt", "Why is binary search fast?"];
		fs.chmodSync(CHATS, 0o555);
		let failed;
		try {
			failed = await lh(appUrl, args);
		} finally {
			fs.chmodSync(CHATS, 0o755);
		}
		assert.equal(failed.code, 1);
		assert.equal(failed.lines.length, 1);
		assert.deepEqual(failed.json, { ok: false, code: "save_failed" }, "a create's save_failed carries no cursor");
		assert.deepEqual(new Set(fs.readdirSync(CHATS)), before, "nothing was saved, not even a temp file");

		// "Rerun the same command."
		const rerun = await lh(appUrl, args);
		assert.equal(rerun.code, 0);
		assert.equal(rerun.json.ok, true);
		assert.equal(rerun.json.existing, false, "the failed create left no lesson behind");
		assert.ok(fs.existsSync(path.join(CHATS, `${rerun.json.id}.json`)), "the lesson file the guide points to exists");
		assert.deepEqual(rerun.json.items, [{ type: "message", id: rerun.json.cursor, text: "Why is binary search fast?" }]);

		const again = await lh(appUrl, args);
		assert.equal(again.code, 0);
		assert.equal(again.json.existing, true);
		assert.equal(again.json.id, rerun.json.id);
		assert.equal(chatStore.listChats().filter((c) => c.externalKey === "save-fails-1").length, 1);
	});
});

describe("lh refusals that carry unread items", () => {
	it("unread_input starts after a newer --after; bad_after starts after the bot's last turn", async () => {
		const created = await lh(appUrl, ["lesson", "new", "--title", "Items", "--key", "unread-after-1"]);
		assert.equal(created.code, 0);
		const lesson: string = created.json.id;
		assert.equal(created.json.cursor, lesson, "an empty lesson's cursor is its id");

		const said = await lh(appUrl, ["say", lesson, "--after", lesson], "What do you know about logarithms?");
		assert.equal(said.code, 0);
		const botTurn: string = said.json.cursor;

		const first = await learnerTypes(lesson, "A little.");
		const second = await learnerTypes(lesson, "Actually, nothing.");
		const firstItem = { type: "message", id: first, text: "A little." };
		const secondItem = { type: "message", id: second, text: "Actually, nothing." };

		// --after is the bot's last turn: both messages are unread.
		const atTurn = await lh(appUrl, ["say", lesson, "--after", botTurn], "Let's start.");
		assert.equal(atTurn.code, 1);
		assert.equal(atTurn.json.code, "unread_input");
		assert.deepEqual(atTurn.json.items, [firstItem, secondItem]);
		assert.equal(atTurn.json.cursor, second);

		// --after is newer than the bot's last turn: the items start after it.
		const newer = await lh(appUrl, ["say", lesson, "--after", first], "Let's start.");
		assert.equal(newer.code, 1);
		assert.equal(newer.json.code, "unread_input");
		assert.deepEqual(newer.json.items, [secondItem]);
		assert.equal(newer.json.cursor, second);

		// bad_after ignores the bad cursor: the items start after the last turn.
		const bad = await lh(appUrl, ["say", lesson, "--after", "msg_not_in_lesson"], "Let's start.");
		assert.equal(bad.code, 1);
		assert.equal(bad.json.code, "bad_after");
		assert.deepEqual(bad.json.items, [firstItem, secondItem]);
		assert.equal(bad.json.cursor, second);

		// Nothing was saved by the refusals; the reply's cursor takes the turn.
		assert.equal(chatStore.getChat(lesson)!.messages.length, 3);
		const taken = await lh(appUrl, ["say", lesson, "--after", second], "Let's start.");
		assert.equal(taken.code, 0);
		assert.equal(taken.json.ok, true);
	});
});
