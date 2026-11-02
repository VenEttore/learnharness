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
/** Replies sent before `reply`, first one first. */
const queued: { status: number; body: unknown }[] = [];

const server = http.createServer((req, res) => {
	let raw = "";
	req.on("data", (chunk) => (raw += chunk));
	req.on("end", () => {
		// The host is shared, and something there probes local ports (GET /):
		// only lh's own requests count or take a queued reply.
		if (!req.url!.startsWith("/api/")) {
			res.writeHead(404).end();
			return;
		}
		seen.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined });
		const next = queued.shift() ?? reply;
		res.writeHead(next.status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(next.body));
	});
});
let url = "";
before(async () => {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

/** Run lh. `stdin` is written after `stdinDelayMs`, the way a slow writer
 *  on the other end of a pipe would; `script` runs lh from another path. */
function lh(
	args: string[],
	opts: { stdin?: string; stdinDelayMs?: number; env?: Record<string, string>; script?: string } = {},
): Promise<{ code: number; lines: string[]; json: any }> {
	return new Promise((resolve) => {
		const child = execFile(process.execPath, [opts.script ?? LH, ...args], { env: { ...process.env, LH_URL: url, ...opts.env } }, (err, stdout) => {
			const lines = stdout.split("\n").filter(Boolean);
			resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0, lines, json: lines[0] ? JSON.parse(lines[0]) : undefined });
		});
		// lh may exit on bad input before reading stdin; under load the write
		// then lands on a closed pipe. That EPIPE is expected, nothing else is.
		child.stdin!.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code !== "EPIPE") throw err;
		});
		const write = () => child.stdin!.end(opts.stdin ?? "");
		if (opts.stdinDelayMs) setTimeout(write, opts.stdinDelayMs);
		else write();
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

	it("plan posts the Mermaid from stdin or --file with the cursor", async () => {
		const mermaid = "graph TD\n  a[A] --> b[B]\n";
		assert.deepEqual(await lastRequest(["plan", "chat_a", "--after", "msg_9"], { stdin: mermaid }), {
			method: "POST",
			url: "/api/external/chats/chat_a/turn",
			body: { kind: "plan", after: "msg_9", mermaid },
		});
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cli-"));
		const file = path.join(dir, "plan.mmd");
		fs.writeFileSync(file, mermaid);
		try {
			assert.deepEqual((await lastRequest(["plan", "chat_a", "--after", "msg_9", "--file", file])).body, { kind: "plan", after: "msg_9", mermaid });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		const { code, json } = await lh(["plan", "chat_a"], { stdin: mermaid });
		assert.equal(code, 1);
		assert.equal(json.code, "usage");
	});

	it("ask, probe, recall, quiz and explain post the JSON from stdin or --file with the kind and cursor", async () => {
		const payload = { text: "Lead-in.", question: "Which?", options: [{ label: "A" }, { label: "B" }] };
		for (const kind of ["ask", "probe", "recall", "quiz", "explain"]) {
			assert.deepEqual(await lastRequest([kind, "chat_a", "--after", "msg_9"], { stdin: JSON.stringify(payload) }), {
				method: "POST",
				url: "/api/external/chats/chat_a/turn",
				body: { ...payload, kind, after: "msg_9" },
			});
		}
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cli-"));
		const file = path.join(dir, "probe.json");
		fs.writeFileSync(file, JSON.stringify(payload));
		try {
			for (const kind of ["probe", "quiz", "explain"]) {
				assert.deepEqual((await lastRequest([kind, "chat_a", "--after", "msg_9", "--file", file])).body, { ...payload, kind, after: "msg_9" });
			}
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("probe-done posts the assessment JSON from stdin or --file with the kind and cursor", async () => {
		const payload = { assessment: { strands: [{ strand: "limits", assessment: "Solid floor." }], summary: "Ready." } };
		assert.deepEqual(await lastRequest(["probe-done", "chat_a", "--after", "msg_9"], { stdin: JSON.stringify(payload) }), {
			method: "POST",
			url: "/api/external/chats/chat_a/turn",
			body: { ...payload, kind: "probe-done", after: "msg_9" },
		});
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-cli-"));
		const file = path.join(dir, "done.json");
		fs.writeFileSync(file, JSON.stringify(payload));
		try {
			assert.deepEqual((await lastRequest(["probe-done", "chat_a", "--after", "msg_9", "--file", file])).body, { ...payload, kind: "probe-done", after: "msg_9" });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("say waits for a slow stdin writer", async () => {
		assert.deepEqual((await lastRequest(["say", "chat_a", "--after", "msg_9"], { stdin: "Late text.", stdinDelayMs: 300 })).body, {
			kind: "say",
			after: "msg_9",
			text: "Late text.",
		});
	});

	it("takes --name=value, so a value may start with --", async () => {
		assert.deepEqual((await lastRequest(["lesson", "new", "--title=--Note: sets", "--key=k2"])).body, { title: "--Note: sets", key: "k2" });
	});

	it("runs through a symlink", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-link-"));
		const link = path.join(dir, "lh");
		fs.symlinkSync(LH, link);
		try {
			seen.length = 0;
			const { code, json } = await lh(["show", "chat_a"], { script: link });
			assert.equal(code, 0);
			assert.equal(json.ok, true);
			assert.equal(seen.length, 1);
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

describe("lh answer --wait", () => {
	const empty = { status: 200, body: { ok: true, items: [], openQuestion: null, cursor: "msg_1" } };
	const one = { status: 200, body: { ok: true, items: [{ type: "message", id: "msg_2", text: "hi" }], openQuestion: null, cursor: "msg_2" } };
	const fast = { env: { LH_WAIT_POLL_MS: "50" } };

	it("checks again until there is an item, then prints that reply", async () => {
		seen.length = 0;
		queued.push(empty, empty);
		reply = one;
		const { code, lines, json } = await lh(["answer", "chat_a", "--wait"], fast);
		assert.equal(code, 0);
		assert.equal(lines.length, 1);
		assert.deepEqual(json, one.body);
		assert.equal(seen.length, 3);
		assert.ok(seen.every((r) => r.method === "GET" && r.url === "/api/external/chats/chat_a/answer"));
	});

	it("checks every 2 s by default", async () => {
		seen.length = 0;
		queued.push(empty);
		reply = one;
		const started = performance.now();
		const { code } = await lh(["answer", "chat_a", "--wait"]);
		const elapsed = performance.now() - started;
		assert.equal(code, 0);
		assert.equal(seen.length, 2);
		assert.ok(elapsed >= 1900 && elapsed < 4000, `${elapsed} ms`);
	});

	it("prints { ok: false, error: \"timeout\" } and exits 2 when --timeout passes with no item", async () => {
		seen.length = 0;
		reply = empty;
		const started = performance.now();
		const { code, lines, json } = await lh(["answer", "chat_a", "--wait", "--timeout", "0.3"], fast);
		assert.equal(code, 2);
		assert.equal(lines.length, 1);
		assert.deepEqual(json, { ok: false, error: "timeout" });
		assert.ok(seen.length >= 2, "it checked more than once");
		assert.ok(performance.now() - started < 3000);
	});

	it("stops at a refusal with exit 1", async () => {
		seen.length = 0;
		queued.push(empty);
		reply = { status: 404, body: { ok: false, code: "not_found" } };
		const { code, json } = await lh(["answer", "chat_a", "--wait"], fast);
		assert.equal(code, 1);
		assert.deepEqual(json, { ok: false, code: "not_found" });
		assert.equal(seen.length, 2);
	});

	it("exits 3 at once when LearnHarness is unreachable", async () => {
		const closed = http.createServer();
		await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
		const dead = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
		await new Promise<void>((resolve) => closed.close(() => resolve()));
		const { code, lines, json } = await lh(["answer", "chat_a", "--wait"], { env: { LH_URL: dead, LH_WAIT_POLL_MS: "50" } });
		assert.equal(code, 3);
		assert.equal(lines.length, 1);
		assert.equal(json.code, "unreachable");
	});

	it("without --wait, an empty answer is printed at once", async () => {
		seen.length = 0;
		reply = empty;
		const { code, json } = await lh(["answer", "chat_a"]);
		assert.equal(code, 0);
		assert.deepEqual(json, empty.body);
		assert.equal(seen.length, 1);
	});

	it("refuses a bad --timeout, --timeout without --wait, or a value on --wait, with no request", async () => {
		for (const args of [
			["answer", "chat_a", "--wait", "--timeout", "0"],
			["answer", "chat_a", "--wait", "--timeout", "soon"],
			["answer", "chat_a", "--timeout", "5"],
			["show", "chat_a", "--wait"],
			["answer", "chat_a", "--wait=false"],
			["answer", "chat_a", "--wait=", "--timeout", "1"],
		]) {
			seen.length = 0;
			const { code, json } = await lh(args);
			assert.equal(code, 1, args.join(" "));
			assert.equal(json.code, "usage");
			assert.equal(seen.length, 0);
		}
		reply = { status: 200, body: { ok: true, cursor: "msg_1" } };
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

	it("exits 1 with one JSON line and no request on bad input", async () => {
		for (const args of [
			["say", "chat_a"],
			["say", "chat_a", "--after", "msg_1"],
			["say", "chat_a", "--after", "msg_1", "--file", "/nonexistent/lh.txt"],
			["say", "chat_a", "--after", "msg_1", "--file", os.tmpdir()],
			["dance"],
			["show"],
			["lesson", "new", "--key", "k", "--tiitle", "Bayes"],
			["show", "chat_a", "chat_b"],
		]) {
			seen.length = 0;
			const { code, lines, json } = await lh(args);
			assert.equal(code, 1, args.join(" "));
			assert.equal(lines.length, 1);
			assert.equal(json.ok, false);
			assert.equal(seen.length, 0);
		}
	});

	it("exits 1 with no request when a question's input is not one JSON object without kind or after", async () => {
		for (const [args, stdin] of [
			[["ask", "chat_a", "--after", "msg_1"], "not json"],
			[["probe", "chat_a", "--after", "msg_1"], "[1, 2]"],
			[["recall", "chat_a", "--after", "msg_1"], "null"],
			[["ask", "chat_a", "--after", "msg_1"], '{"kind":"say","question":"Q?"}'],
			[["ask", "chat_a", "--after", "msg_1"], '{"after":"msg_0","question":"Q?"}'],
			[["ask", "chat_a"], '{"question":"Q?"}'],
			[["ask", "chat_a", "--after", "msg_1", "--text", "x"], '{"question":"Q?"}'],
		] as const) {
			seen.length = 0;
			const { code, lines, json } = await lh([...args], { stdin });
			assert.equal(code, 1, `${args.join(" ")} <<< ${stdin}`);
			assert.equal(lines.length, 1);
			assert.equal(json.code, "usage");
			assert.equal(seen.length, 0);
		}
	});

	it("exits 1 when stdin stays open past its deadline, without a request", async () => {
		seen.length = 0;
		const { code, json } = await new Promise<{ code: number; json: any }>((resolve) => {
			// stdin is left open: the writer never closes the pipe.
			execFile(process.execPath, [LH, "say", "chat_a", "--after", "msg_1"], { env: { ...process.env, LH_URL: url, LH_STDIN_TIMEOUT_MS: "300" } }, (err, stdout) =>
				resolve({ code: err ? ((err as { code?: number }).code ?? -1) : 0, json: JSON.parse(stdout.split("\n")[0]!) }),
			);
		});
		assert.equal(code, 1);
		assert.equal(json.code, "usage");
		assert.match(json.error, /stdin/);
		assert.equal(seen.length, 0);
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
