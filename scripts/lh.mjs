#!/usr/bin/env node
/**
 * lh: the Bot Teacher's command line for bot-run lessons (fork, ADR 0001).
 * One Node 22 script, no dependencies. It calls LearnHarness's external
 * routes (app/api/external/**) and prints one JSON line per command.
 *
 *   lh lesson new --title <t> --key <k> [--prompt <p>]
 *   lh say <lesson> --after <cursor> [--file <path>]   text from --file or stdin
 *   lh answer <lesson>
 *   lh show <lesson>
 *
 * Exit codes: 0 ok; 1 refused or bad input; 3 LearnHarness unreachable.
 * (2 is reserved for `answer --wait` timing out.) The base URL is LH_URL,
 * default http://127.0.0.1:3000: not localhost, which can resolve to the
 * IPv6 address while LearnHarness listens on 127.0.0.1 only.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "http://127.0.0.1:3000";
const GUIDE = "docs/external-teacher.md";
const REQUEST_TIMEOUT_MS = 30_000;

/** Bad input on the command line: exit 1 with a usage refusal. */
class UsageError extends Error {}

/** Split argv into positionals and `--name value` flags. */
function parseArgs(argv) {
	const positionals = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			positionals.push(arg);
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

/** Long input: --file, else stdin (never a terminal, which would hang). */
function readInput(flags, readStdin) {
	if (flags.file) return readFileSync(flags.file, "utf-8");
	const text = readStdin();
	if (text === null) throw new UsageError("pass the text with --file <path> or on stdin");
	return text;
}

/**
 * The HTTP request a command line makes: `{ method, path, body? }`.
 * `readStdin` returns stdin's text, or null when stdin is a terminal.
 */
export function requestFor(argv, readStdin) {
	const { positionals, flags } = parseArgs(argv);
	const [command, ...rest] = positionals;
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
			return { method: "POST", path, body: { kind: "say", after, text: readInput(flags, readStdin) } };
		}
		case "answer":
			return { method: "GET", path: `${lessonPath(rest[0])}/answer` };
		case "show":
			return { method: "GET", path: lessonPath(rest[0]) };
		default:
			throw new UsageError(`unknown command ${JSON.stringify(command ?? "")}; commands: lesson new, say, answer, show`);
	}
}

function stdinText() {
	if (process.stdin.isTTY) return null;
	return readFileSync(0, "utf-8");
}

function print(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
	let request;
	try {
		request = requestFor(process.argv.slice(2), stdinText);
	} catch (err) {
		if (!(err instanceof UsageError) && err?.code !== "ENOENT") throw err;
		print({ ok: false, code: "usage", error: err.message });
		return 1;
	}
	const base = process.env.LH_URL || DEFAULT_URL;
	let res;
	try {
		res = await fetch(new URL(request.path, base), {
			method: request.method,
			headers: request.body ? { "Content-Type": "application/json" } : {},
			body: request.body ? JSON.stringify(request.body) : undefined,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch {
		print({
			ok: false,
			code: "unreachable",
			error: `LearnHarness is not reachable at ${base} (LH_URL). Start it as ${GUIDE} describes, or set LH_URL.`,
			guide: GUIDE,
		});
		return 3;
	}
	const text = await res.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = { ok: false, code: "bad_reply", status: res.status, error: text.slice(0, 500) };
	}
	print(body);
	return res.ok && body?.ok === true ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await main();
}
