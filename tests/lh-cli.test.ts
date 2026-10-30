/**
 * `lh` (scripts/lh.mjs, external-teacher ticket 03): each command line
 * becomes the right request, the reply comes back as one JSON line, and the
 * exit code says ok (0), refused or bad input (1), or unreachable (3). The
 * script runs as a real child process against a local server that records
 * what it was asked.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const LH = path.join(import.meta.dirname, "..", "scripts", "lh.mjs");

type Seen = { method: string; url: string; body: unknown };
const seen: Seen[] = [];
/** The next reply the fake server sends. */
let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, cursor: "msg_1" } };

const server = http.createServer((req, res) => {
	let raw = "";
	req.on("data", (chunk) => (raw += chunk));
	req.on("end", () => {
		seen.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined });
		res.writeHead(reply.status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(reply.body));
	});
});
let url = "";
before(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

function lh(args: string[], opts: { stdin?: string; env?: Record<string, string> } = {}): Promise<{ code: number; lines: string[]; json: any }> {
	return new Promise((resolve) => {
		const child = execFile(process.execPath, [LH, ...args], { env: { ...process.env, LH_URL: url, ...opts.env } }, (err, stdout) => {
			const lines = stdout.split("\n").filter(Boolean);
			resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0, lines, json: lines[0] ? JSON.parse(lines[0]) : undefined });
		});
		child.stdin!.end(opts.stdin ?? "");
	});
}

async function lastRequest(args: string[], opts?: Parameters<typeof lh>[1]): Promise<Seen> {
	seen.length = 0;
	const { code } = await lh(args, opts);
	assert.equal(code, 0);
	assert.equal(seen.length, 1);
	return seen[0]!;
}

describe("lh maps command lines to requests", () => {
	it("lesson new posts title, key and prompt", async () => {
		assert.deepEqual(await lastRequest(["lesson", "new", "--title", "Bayes", "--key", "k1", "--prompt", "Teach me"]), {
			method: "POST",
			url: "/api/external/chats",
			body: { title: "Bayes", key: "k1", prompt: "Teach me" },
		});
		assert.deepEqual((await lastRequest(["lesson", "new", "--title", "Bayes", "--key", "k1"])).body, { title: "Bayes", key: "k1" });
	});

	it("say posts the text from stdin or --file with the cursor", async () => {
		assert.deepEqual(await lastRequest(["say", "chat_a", "--after", "msg_9"], { stdin: "Hello **there**\n" }), {
			method: "POST",
			url: "/api/external/chats/chat_a/turn",
			body: { kind: "say", after: "msg_9", text: "Hello **there**\n" },
		});
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cli-"));
		const file = path.join(dir, "say.md");
		fs.writeFileSync(file, "From a file.");
		try {
			assert.deepEqual((await lastRequest(["say", "chat_a", "--after", "msg_9", "--file", file])).body, { kind: "say", after: "msg_9", text: "From a file." });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("answer and show read the lesson", async () => {
		assert.deepEqual(await lastRequest(["answer", "chat_a"]), { method: "GET", url: "/api/external/chats/chat_a/answer", body: undefined });
		assert.deepEqual(await lastRequest(["show", "chat_a"]), { method: "GET", url: "/api/external/chats/chat_a", body: undefined });
	});

	it("prints the reply as one JSON line", async () => {
		reply = { status: 200, body: { ok: true, id: "chat_a", cursor: "msg_2" } };
		const { code, lines, json } = await lh(["show", "chat_a"]);
		assert.equal(code, 0);
		assert.equal(lines.length, 1);
		assert.deepEqual(json, { ok: true, id: "chat_a", cursor: "msg_2" });
	});
});

describe("lh refusals and exit codes", () => {
	it("exits 1 with the route's JSON when the route refuses", async () => {
		reply = { status: 409, body: { ok: false, code: "unread_input", items: [], cursor: "msg_3" } };
		const { code, lines, json } = await lh(["say", "chat_a", "--after", "msg_1"], { stdin: "x" });
		assert.equal(code, 1);
		assert.equal(lines.length, 1);
		assert.deepEqual(json, reply.body);
		reply = { status: 200, body: { ok: true, cursor: "msg_1" } };
	});

	it("exits 1 without a request on bad input: no --after, no text, unknown command, no lesson id", async () => {
		for (const args of [["say", "chat_a"], ["say", "chat_a", "--after", "msg_1", "--file", "/nonexistent/lh.txt"], ["dance"], ["show"]]) {
			seen.length = 0;
			const { code, lines, json } = await lh(args);
			assert.equal(code, 1, args.join(" "));
			assert.equal(lines.length, 1);
			assert.equal(json.ok, false);
			assert.equal(seen.length, 0);
		}
	});

	it("exits 3 naming LH_URL and the guide when LearnHarness is unreachable", async () => {
		const closed = http.createServer();
		await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
		const dead = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
		await new Promise<void>((resolve) => closed.close(() => resolve()));
		const { code, lines, json } = await lh(["show", "chat_a"], { env: { LH_URL: dead } });
		assert.equal(code, 3);
		assert.equal(lines.length, 1);
		assert.match(json.error, /LH_URL/);
		assert.match(json.error, new RegExp(dead.replace(/[.]/g, "\\.")));
		assert.equal(json.guide, "docs/external-teacher.md");
	});
});
