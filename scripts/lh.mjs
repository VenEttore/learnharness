#!/usr/bin/env node
/**
 * lh: the Bot Teacher's command line for bot-run lessons (fork, ADR 0001).
 * One Node 22 script, no dependencies. It calls LearnHarness's external
 * routes (app/api/external/**) and prints one JSON line per command.
 *
 *   lh lesson new --title <t> --key <k> [--prompt <p>]
 *   lh say <lesson> --after <cursor> [--file <path>]   text from --file, else stdin
 *   lh answer <lesson>
 *   lh show <lesson>
 *
 * Exit codes: 0 ok; 1 refused or bad input; 3 LearnHarness unreachable.
 * (2 is reserved for `answer --wait` timing out.) The base URL is LH_URL,
 * default http://127.0.0.1:3000: not localhost, which can resolve to the
 * IPv6 address while LearnHarness listens on 127.0.0.1 only. Stdin must
 * close within LH_STDIN_TIMEOUT_MS (default 30000).
 */

import { readFileSync } from "node:fs";
import { isatty } from "node:tty";

const DEFAULT_URL = "http://127.0.0.1:3000";
const GUIDE = "docs/external-teacher.md";
const REQUEST_TIMEOUT_MS = 30_000;
const STDIN_TIMEOUT_MS = Number(process.env.LH_STDIN_TIMEOUT_MS) || 30_000;

/** Bad input on the command line: exit 1 with a usage refusal. */
class UsageError extends Error {}

/** Split argv into positionals and flags, `--name value` or `--name=value`
 *  (the second form takes a value that itself starts with `--`). */
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

/** The flags each command takes. A misspelled flag is refused, never
 *  silently dropped. */
const FLAGS = { lesson: ["title", "key", "prompt"], say: ["after", "file"], answer: [], show: [] };

/** The HTTP request a command line makes: `{ method, path, body? }`. */
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
		case "answer":
			return { method: "GET", path: `${lessonPath(rest[0])}/answer` };
		case "show":
			return { method: "GET", path: lessonPath(rest[0]) };
		default:
			throw new UsageError(`unknown command ${JSON.stringify(command ?? "")}; commands: lesson new, say, answer, show`);
	}
}

function print(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
	let request;
	try {
		request = await requestFor(process.argv.slice(2));
	} catch (err) {
		if (!(err instanceof UsageError)) throw err;
		print({ ok: false, code: "usage", error: err.message });
		return 1;
	}
	const base = process.env.LH_URL || DEFAULT_URL;
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
	print(body);
	return res.ok && body?.ok === true ? 0 : 1;
}

// No main-module guard: the file is only ever run, and a guard comparing
// paths misfires when lh is a symlink (it would exit 0 doing nothing).
try {
	process.exitCode = await main();
} catch (err) {
	print({ ok: false, code: "error", error: err instanceof Error ? err.message : String(err) });
	process.exitCode = 1;
}
