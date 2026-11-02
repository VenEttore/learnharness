#!/usr/bin/env node
/**
 * lh: the Bot Teacher's command line for bot-run lessons (fork, ADR 0001).
 * One Node 22 script. It calls LearnHarness's external routes
 * (app/api/external/**), and for `submit` the lesson page's own answer
 * routes, and prints one JSON line per command.
 *
 *   lh lesson new --title <t> --key <k> [--prompt <p>]
 *   lh say <lesson> --after <cursor> [--file <path>]   text from --file, else stdin
 *   lh plan <lesson> --after <cursor> [--file <path>]  Mermaid from --file, else stdin
 *   lh ask|probe|recall|probe-done|quiz|explain <lesson> --after <cursor> [--file <path>]
 *                                 a JSON object from --file, else stdin
 *   lh answer <lesson> [--wait] [--timeout <seconds>]
 *                                 --wait checks every 2 s until there is
 *                                 at least one item, 600 s by default
 *   lh show <lesson>
 *   lh submit <lesson> --after <cursor> [--file <path>]
 *                                 the learner's answer to the open question,
 *                                 a JSON object from --file, else stdin:
 *                                 {"picks":[2],"confidence":70,"thinking":"..."}
 *                                 or a skip, {"skip":true}
 *
 * Exit codes: 0 ok; 1 any reply that is not ok (a refusal, bad_reply, or
 * a reply without "ok":true or on a non-2xx status); 2 `answer --wait`
 * timed out; 3 LearnHarness unreachable or no answer.
 * No dependencies, except that `submit` loads the repo's own answer code
 * through tsx (installed by `npm ci`). Node 22 or newer: Node 14.13.1 to
 * 21 get the `node_version` refusal; older Node cannot load this file
 * (`node:` imports, `??`, top-level await) and crashes before the check.
 * The base URL is LH_URL, default http://127.0.0.1:3000: not localhost,
 * which can resolve to the IPv6 address while LearnHarness listens on
 * 127.0.0.1 only. Stdin must close within LH_STDIN_TIMEOUT_MS (default
 * 30000).
 */

import { readFileSync } from "node:fs";
import { isatty } from "node:tty";

const DEFAULT_URL = "http://127.0.0.1:3000";
const GUIDE = "docs/external-teacher.md";
const REQUEST_TIMEOUT_MS = 30_000;
const STDIN_TIMEOUT_MS = Number(process.env.LH_STDIN_TIMEOUT_MS) || 30_000;
/** How often `answer --wait` checks. LH_WAIT_POLL_MS is for tests. */
const WAIT_POLL_MS = Number(process.env.LH_WAIT_POLL_MS) || 2_000;
const WAIT_TIMEOUT_S = 600;

/** Bad input on the command line: exit 1 with a usage refusal. */
class UsageError extends Error {}

/** Flags that take no value. */
const SWITCHES = ["wait"];

/** Split argv into positionals and flags, `--name value` or `--name=value`
 *  (the second form takes a value that itself starts with `--`). A switch
 *  is `--name` alone and reads as true. */
function parseArgs(argv) {
	const positionals = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positionals.push(arg);
			continue;
		}
		const eq = arg.indexOf("=");
		const name = arg.slice(2, eq > 2 ? eq : undefined);
		if (SWITCHES.includes(name)) {
			// `--wait=false` must not read as a wait.
			if (eq > 2) throw new UsageError(`--${name} takes no value`);
			flags[name] = true;
			continue;
		}
		if (eq > 2) {
			flags[arg.slice(2, eq)] = arg.slice(eq + 1);
			continue;
		}
		const value = argv[i + 1];
		if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
		flags[arg.slice(2)] = value;
		i++;
	}
	return { positionals, flags };
}

function lessonPath(id) {
	if (!id) throw new UsageError("missing lesson id");
	return `/api/external/chats/${encodeURIComponent(id)}`;
}

function requireAfter(flags) {
	if (!flags.after) throw new UsageError("turn commands require --after <cursor>");
	return flags.after;
}

/** Stdin as a stream, under a deadline: a pipe nobody closes must not
 *  hang the bot. (A sync read of fd 0 can neither time out nor survive a
 *  slow writer: once process.stdin exists, fd 0 is non-blocking and the
 *  read fails with EAGAIN.) */
function readStdin() {
	return new Promise((resolve, reject) => {
		const chunks = [];
		const timer = setTimeout(() => {
			process.stdin.destroy();
			reject(new UsageError(`stdin was not closed within ${STDIN_TIMEOUT_MS / 1000} s; pass the text with --file <path>`));
		}, STDIN_TIMEOUT_MS);
		process.stdin.on("data", (chunk) => chunks.push(chunk));
		process.stdin.on("end", () => {
			clearTimeout(timer);
			resolve(Buffer.concat(chunks).toString("utf-8"));
		});
		process.stdin.on("error", (err) => {
			clearTimeout(timer);
			reject(new UsageError(`could not read stdin: ${err.message}`));
		});
	});
}

/** Long input: --file, else stdin (never a terminal, which would hang). */
async function readInput(flags) {
	let text;
	if (flags.file !== undefined) {
		try {
			text = readFileSync(flags.file, "utf-8");
		} catch (err) {
			throw new UsageError(`could not read the text: ${err.message}`);
		}
	} else if (!isatty(0)) {
		text = await readStdin();
	}
	if (!text) throw new UsageError("pass the text with --file <path> or on stdin");
	return text;
}

/** A JSON kind's payload: one JSON object, e.g. `{ "text": "lead-in",
 *  "question": "...", "options": [...] }` or `{ "assessment": {...} }`.
 *  The kind and cursor come from the command line, so the object may not
 *  carry its own. */
async function readPayload(flags) {
	const text = await readInput(flags);
	let payload;
	try {
		payload = JSON.parse(text);
	} catch (err) {
		throw new UsageError(`the input is not JSON: ${err.message}`);
	}
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new UsageError("the input must be a JSON object");
	for (const key of ["kind", "after"]) {
		if (Object.hasOwn(payload, key)) throw new UsageError(`the JSON must not set "${key}"; it comes from the command line`);
	}
	return payload;
}

/** The turn kinds whose payload is a JSON object. */
const JSON_KINDS = ["ask", "probe", "recall", "probe-done", "quiz", "explain"];

/** The flags each command takes. A misspelled flag is refused, never
 *  silently dropped. */
const FLAGS = {
	lesson: ["title", "key", "prompt"],
	say: ["after", "file"],
	plan: ["after", "file"],
	...Object.fromEntries(JSON_KINDS.map((k) => [k, ["after", "file"]])),
	answer: ["wait", "timeout"],
	show: [],
	submit: ["after", "file"],
};

/** The HTTP request a command line makes, `{ method, path, body? }`, or
 *  for `submit` the answer to save, `{ submit: { lesson, after, raw } }`. */
async function requestFor(argv) {
	const { positionals, flags } = parseArgs(argv);
	const [command, ...rest] = positionals;
	const allowed = Object.hasOwn(FLAGS, command ?? "") ? FLAGS[command] : null;
	const unknown = allowed ? Object.keys(flags).filter((f) => !allowed.includes(f)) : [];
	if (unknown.length > 0) throw new UsageError(`${command} does not take --${unknown.join(", --")}`);
	// lesson takes "new"; the rest take one lesson id.
	if (allowed && rest.length > 1) throw new UsageError(`${command} takes one ${command === "lesson" ? "subcommand" : "lesson id"}, got ${rest.length}`);
	switch (command) {
		case "lesson": {
			if (rest[0] !== "new") throw new UsageError("usage: lh lesson new --title <t> --key <k> [--prompt <p>]");
			// A missing key goes to the route, which refuses it as key_required.
			const body = { title: flags.title ?? "", key: flags.key };
			if (flags.prompt !== undefined) body.prompt = flags.prompt;
			return { method: "POST", path: "/api/external/chats", body };
		}
		case "say": {
			const path = `${lessonPath(rest[0])}/turn`;
			const after = requireAfter(flags);
			return { method: "POST", path, body: { kind: "say", after, text: await readInput(flags) } };
		}
		case "plan": {
			const path = `${lessonPath(rest[0])}/turn`;
			const after = requireAfter(flags);
			return { method: "POST", path, body: { kind: "plan", after, mermaid: await readInput(flags) } };
		}
		case "ask":
		case "probe":
		case "recall":
		case "probe-done":
		case "quiz":
		case "explain": {
			const path = `${lessonPath(rest[0])}/turn`;
			const after = requireAfter(flags);
			return { method: "POST", path, body: { ...(await readPayload(flags)), kind: command, after } };
		}
		case "answer": {
			const path = `${lessonPath(rest[0])}/answer`;
			if (flags.timeout !== undefined && !flags.wait) throw new UsageError("--timeout needs --wait");
			if (!flags.wait) return { method: "GET", path };
			const seconds = flags.timeout === undefined ? WAIT_TIMEOUT_S : Number(flags.timeout);
			if (!(seconds > 0) || !Number.isFinite(seconds)) throw new UsageError("--timeout takes a number of seconds above 0");
			return { method: "GET", path, waitMs: seconds * 1000 };
		}
		case "show":
			return { method: "GET", path: lessonPath(rest[0]) };
		case "submit": {
			lessonPath(rest[0]);
			const after = requireAfter(flags);
			const text = await readInput(flags);
			let raw;
			try {
				raw = JSON.parse(text);
			} catch (err) {
				throw new UsageError(`the input is not JSON: ${err.message}`);
			}
			return { submit: { lesson: rest[0], after, raw } };
		}
		default:
			throw new UsageError(`unknown command ${JSON.stringify(command ?? "")}; commands: lesson new, say, plan, ${JSON_KINDS.join(", ")}, answer, show, submit`);
	}
}

function print(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** The oldest Node `lh` runs on. */
const NODE_MAJOR = 22;

async function main() {
	const major = Number(process.versions.node.split(".")[0]);
	if (major < NODE_MAJOR) {
		print({ ok: false, code: "node_version", error: `lh needs Node ${NODE_MAJOR} or newer; this is Node ${process.versions.node}. See ${GUIDE}, section 1.` });
		return 1;
	}
	let request;
	try {
		request = await requestFor(process.argv.slice(2));
	} catch (err) {
		if (!(err instanceof UsageError)) throw err;
		print({ ok: false, code: "usage", error: err.message });
		return 1;
	}
	const base = process.env.LH_URL || DEFAULT_URL;
	if (request.submit) return submit(request.submit, base);
	const deadline = Date.now() + (request.waitMs ?? 0);
	for (;;) {
		const reply = await send(request, base);
		if (typeof reply === "number") return reply;
		const { res, body } = reply;
		const ok = res.ok && body?.ok === true;
		// --wait: an ok reply with no items yet checks again until the deadline.
		const waiting = request.waitMs !== undefined && ok && Array.isArray(body.items) && body.items.length === 0;
		if (!waiting) {
			print(body);
			return ok ? 0 : 1;
		}
		const left = deadline - Date.now();
		if (left <= 0) {
			print({ ok: false, error: "timeout" });
			return 2;
		}
		await new Promise((resolve) => setTimeout(resolve, Math.min(WAIT_POLL_MS, left)));
	}
}

/** The shared answer logic (src/core/answer-submit.ts): the page's own
 *  QuestionData, option order and answer record. lh has no build step, so
 *  it loads the TypeScript through tsx, which `npm ci` installs. */
async function submitCore() {
	let tsImport;
	try {
		({ tsImport } = await import("tsx/esm/api"));
	} catch {
		throw new UsageError(`lh submit runs LearnHarness's own answer code and needs the repo's node_modules: run npm ci in the repo (${GUIDE}, section 1)`);
	}
	return tsImport("../src/core/answer-submit.ts", import.meta.url);
}

/** `lh submit`: read the lesson, check the answer against its open
 *  question, then save it through the page's own route, as the page
 *  does. A retry finds its answer already saved and reports a repeat. */
async function submit({ lesson, after, raw }, base) {
	let core;
	try {
		core = await submitCore();
	} catch (err) {
		if (!(err instanceof UsageError)) throw err;
		print({ ok: false, code: "usage", error: err.message });
		return 1;
	}
	const parsed = core.parseSubmitPayload(raw);
	if (!parsed.ok) {
		print({ ok: false, code: "usage", error: parsed.problems.join("; ") });
		return 1;
	}
	const input = parsed.input;
	const lessonUrl = lessonPath(lesson);
	// Once more after a refused send: a racing save (the page, or another
	// submit) may have taken the question, and the plan then says repeat
	// or answered.
	for (let attempt = 0; ; attempt++) {
		const shown = await send({ method: "GET", path: lessonUrl }, base);
		if (typeof shown === "number") return shown;
		if (!(shown.res.ok && shown.body?.ok === true)) {
			print(shown.body);
			return 1;
		}
		const plan = core.planSubmit(lesson, shown.body, after, input);
		if (plan.action === "refuse") {
			print(plan.reply);
			return 1;
		}
		if (plan.action === "send") {
			const sent = await send({ method: "POST", path: plan.path, body: plan.body }, base);
			if (typeof sent === "number") return sent;
			if (!sent.res.ok) {
				if (attempt === 0) continue;
				print({ ok: false, code: "refused", status: sent.res.status, error: sent.body?.error ?? sent.body, cursor: shown.body.cursor });
				return 1;
			}
		}
		// Read it back: the answer as saved, and the new cursor.
		const read = await send({ method: "GET", path: `${lessonUrl}/answer` }, base);
		if (typeof read === "number") return read;
		if (!(read.res.ok && read.body?.ok === true)) {
			print(read.body);
			return 1;
		}
		print({ ...read.body, repeat: plan.action === "repeat", toolCallId: plan.toolCallId });
		return 0;
	}
}

/** One request: `{ res, body }`, or exit code 3 after printing why
 *  LearnHarness could not be reached. */
async function send(request, base) {
	let res;
	let text;
	try {
		res = await fetch(new URL(request.path, base), {
			method: request.method,
			headers: request.body ? { "Content-Type": "application/json" } : {},
			body: request.body ? JSON.stringify(request.body) : undefined,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		text = await res.text();
	} catch (err) {
		const what = err?.name === "TimeoutError" ? `did not answer within ${REQUEST_TIMEOUT_MS / 1000} s` : "is not reachable";
		print({
			ok: false,
			code: "unreachable",
			error: `LearnHarness at ${base} (LH_URL) ${what}. Start it as ${GUIDE} describes, or set LH_URL.`,
			guide: GUIDE,
		});
		return 3;
	}
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = { ok: false, code: "bad_reply", status: res.status, error: text.slice(0, 500) };
	}
	return { res, body };
}

// No main-module guard: the file is only ever run, and a guard comparing
// paths misfires when lh is a symlink (it would exit 0 doing nothing).
try {
	process.exitCode = await main();
} catch (err) {
	print({ ok: false, code: "error", error: err instanceof Error ? err.message : String(err) });
	process.exitCode = 1;
}
