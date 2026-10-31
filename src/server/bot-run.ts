/**
 * BOT-RUN LESSONS (fork, ADR 0001): a lesson with driver "external" is
 * taught by an outside Bot Teacher through LearnHarness's HTTP API, never
 * by LearnHarness's own model. This module holds that logic; the chat
 * handler makes one early return into it, right after it reads the record.
 *
 * Page input here is saved and nothing else happens: no model or key
 * gate, no compaction, no turn start. Everything is synchronous from the
 * record read to the write, so no other writer can land in between.
 */

import type { AssistantMessage, ToolCall, UserMessage } from "@earendil-works/pi-ai";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { Type, type Static, type TSchema } from "typebox";
import { titleFromPrompt, type ChatRecord } from "../core/contracts.ts";
import { emit } from "../core/events.ts";
import { ChatInputError, inputAppends, type TurnInput } from "../core/input-events.ts";
import { danglingQuestionOf, newMessageId, newUserMessage, type LhMessage } from "../core/native-messages.ts";
import { phaseAt3Lh, type Phase3 } from "../core/phases.ts";
import { stores } from "./stores.ts";
import { settledTurnResponse } from "./turn-runs.ts";

/** The refusal code every bot-run refusal carries. */
export const BOT_RUN_LESSON_CODE = "bot_run_lesson";

/** Any driver at all means someone other than LearnHarness teaches, so an
 *  unexpected stored value fails safe: no model runs. */
export function isBotRun(record: Pick<ChatRecord, "driver">): boolean {
	return record.driver !== undefined;
}

/** THE ONE BOT-RUN WRITE: save the messages, then announce both the record
 *  change (the open page refetches) and the list change (the sidebar's
 *  phase and question-waiting state). Bot-run writes have no turn events
 *  to carry the sidebar refresh, hence the exception to the store's
 *  silence law. */
export function commitBotRun(chatId: string, messages: LhMessage[]): void {
	stores.chatStore.saveMessages(chatId, messages);
	emit("record-changed", { chatId });
	emit("chats-changed", {});
}

function refusal(error: string, status: number): Response {
	return Response.json({ error, code: BOT_RUN_LESSON_CODE }, { status });
}

/** Page input on a bot-run lesson: append it with the ordinary input
 *  logic and settle at once. `continue` and `retry` would ask for a model
 *  turn, so they are 422 (409 reads to the page as "turn running" and it
 *  resends). Server-origin inputs never belong here: 400. */
export function handleBotRunInput(record: ChatRecord, input: TurnInput): Response {
	switch (input.type) {
		case "continue":
		case "retry":
			return refusal(`A bot-run lesson has no model turn to ${input.type}.`, 422);
		case "steers":
			return refusal("A bot-run lesson takes only page input.", 400);
	}
	let appends: LhMessage[];
	try {
		appends = inputAppends(record, input);
	} catch (err) {
		if (err instanceof ChatInputError) return Response.json({ error: err.message }, { status: 400 });
		throw err;
	}
	try {
		commitBotRun(record.id, [...record.messages, ...appends]);
	} catch (err) {
		console.error(`[chat ${record.id}] bot-run persist failed:`, err);
		return new Response("Your input could not be saved. Please try again.", { status: 500 });
	}
	return settledTurnResponse();
}

// ─── the Bot Teacher's API (app/api/external/**) ─────────────────────────────

/** Placeholder stamps on every bot assistant message, following the
 *  synthetic-conclude precedent (core/native-messages.ts): history
 *  serialization reads only content blocks, and money is the parallel
 *  turns log, so these never reach a wire view or a cost fold. */
const BOT_STAMPS = {
	api: "faux",
	provider: "external",
	model: "bot-teacher",
	usage: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop",
} as const;

/** THE ONE CONSTRUCTOR for a Bot Teacher's assistant message. */
export function newBotAssistantMessage(content: AssistantMessage["content"]): LhMessage & AssistantMessage {
	return { id: newMessageId(), role: "assistant", content, timestamp: Date.now(), ...BOT_STAMPS };
}

function isBotMessage(m: LhMessage): m is LhMessage & AssistantMessage {
	return m.role === "assistant" && m.provider === BOT_STAMPS.provider && m.model === BOT_STAMPS.model;
}

/** The external API is open, so it guards its door instead: only lh-style
 *  callers on this computer. A browser always sends Origin on a POST
 *  (a page elsewhere could otherwise post text/plain JSON with no
 *  preflight), and a non-loopback Host means DNS rebinding or a remote
 *  caller. lh sends neither. Null when the request may proceed. */
export function externalRequestRefusal(req: Request): Response | null {
	if (req.headers.has("origin")) return fail(403, "forbidden_origin");
	const host = req.headers.get("host");
	if (host !== null && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return fail(403, "forbidden_host");
	return null;
}

/** The newest message's id. An empty lesson has none, so its cursor is the
 *  lesson id, which `after` accepts as "before the first message". A
 *  reply whose cursor passes learner input the bot has not read (a
 *  repeat, a same-key create, bad_after) also carries those items, so
 *  adopting the cursor never skips them. */
function cursorOf(record: ChatRecord): string {
	return record.messages.at(-1)?.id ?? record.id;
}

function fail(status: number, code: string, extra: Record<string, unknown> = {}): Response {
	return Response.json({ ok: false, code, ...extra }, { status });
}

function textOf(content: UserMessage["content"] | AssistantMessage["content"]): string {
	if (typeof content === "string") return content;
	return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
}

/** One piece of learner input as the bot reads it. Ticket 07 adds the
 *  answer and skip shapes. */
type LearnerItem = { type: "message"; id: string; text: string };

/** The learner input among `messages`, in order. */
function learnerItems(messages: readonly LhMessage[]): LearnerItem[] {
	return messages.flatMap((m) => (m.role === "user" ? [{ type: "message" as const, id: m.id, text: textOf(m.content) }] : []));
}

/** The learner input after the bot's last message: what answer returns. */
function unreadByBot(record: ChatRecord): LearnerItem[] {
	return learnerItems(record.messages.slice(record.messages.findLastIndex(isBotMessage) + 1));
}

/** The record, or the refusal for check 1 (exists and is bot-run). */
function botLesson(id: string): ChatRecord | Response {
	const record = stores.chatStore.getChat(id);
	if (!record) return fail(404, "not_found");
	if (!isBotRun(record)) return fail(409, "not_bot_run");
	return record;
}

/** Create: `{ title, key, prompt? }`. A lesson already holding `key` comes
 *  back as it is, with nothing saved. The lookup and the create share one
 *  synchronous block, so two racing creates cannot both miss. */
export function createBotLesson(body: unknown): Response {
	const b = (typeof body === "object" && body !== null ? body : {}) as { title?: unknown; key?: unknown; prompt?: unknown };
	if (typeof b.key !== "string" || b.key.trim() === "") return fail(400, "key_required");
	const key = b.key;
	const problems = (["title", "prompt"] as const).flatMap((f) => (b[f] !== undefined && typeof b[f] !== "string" ? [`${f} must be a string`] : []));
	if (problems.length > 0) return fail(422, "invalid", { problems });
	const found = stores.chatStore.listChats().find((c) => c.driver !== undefined && c.externalKey === key);
	const existing = found ? stores.chatStore.getChat(found.id) : null;
	if (existing) {
		return Response.json({ ok: true, id: existing.id, title: existing.title, existing: true, items: unreadByBot(existing), cursor: cursorOf(existing) });
	}
	const title = typeof b.title === "string" && b.title ? b.title : "Untitled session";
	// The prompt rides the create's one save: no crash can leave a keyed
	// lesson without it, which a rerun (saving nothing) could never repair.
	const messages = typeof b.prompt === "string" && b.prompt.trim() !== "" ? [newUserMessage(b.prompt)] : [];
	let chat: ChatRecord;
	try {
		chat = stores.chatStore.createChat(titleFromPrompt(title), undefined, { driver: "external", externalKey: key, messages });
	} catch (err) {
		console.error("[bot-run] lesson create failed:", err);
		return fail(500, "save_failed");
	}
	return Response.json({ ok: true, id: chat.id, title: chat.title, existing: false, cursor: cursorOf(chat) });
}

/** commitBotRun for the external routes: a failed save is a JSON 500 the
 *  bot can retry, never an HTML error page. Null when the save landed. */
function commitOrFail(record: ChatRecord, appends: LhMessage[]): Response | null {
	try {
		commitBotRun(record.id, [...record.messages, ...appends]);
		return null;
	} catch (err) {
		console.error(`[chat ${record.id}] bot-run persist failed:`, err);
		return fail(500, "save_failed", { cursor: cursorOf(record) });
	}
}

/** A compact transcript line: enough to resume a lesson, keeping each
 *  question's call id. */
function compactMessage(m: LhMessage): Record<string, unknown> {
	switch (m.role) {
		case "user":
			return { id: m.id, role: "user", text: textOf(m.content) };
		case "assistant": {
			const calls = m.content.flatMap((b) => (b.type === "toolCall" ? [{ toolCallId: b.id, tool: b.name, input: b.arguments }] : []));
			return { id: m.id, role: "assistant", text: textOf(m.content), ...(calls.length ? { calls } : {}) };
		}
		case "toolResult":
			return { id: m.id, role: "toolResult", toolCallId: m.toolCallId, tool: m.toolName, text: textOf(m.content) };
		case "custom":
			return { id: m.id, role: "custom", customType: m.customType };
	}
}

/** Show: the whole lesson, for a bot resuming or taking over. `plan` stays
 *  null until ticket 11. */
export function showBotLesson(id: string): Response {
	const record = botLesson(id);
	if (record instanceof Response) return record;
	return Response.json({
		ok: true,
		id: record.id,
		title: record.title,
		phase: phaseAt3Lh(record.messages),
		plan: null,
		openQuestion: danglingQuestionOf(record.messages),
		messages: record.messages.map(compactMessage),
		cursor: cursorOf(record),
	});
}

/** Answer: the learner input after the bot's last message, in order. Turn
 *  check 4 keeps the bot from writing past unread input, so this list is
 *  complete. Read-only, so reading twice returns the same items. */
export function botAnswer(id: string): Response {
	const record = botLesson(id);
	if (record instanceof Response) return record;
	return Response.json({
		ok: true,
		items: unreadByBot(record),
		openQuestion: danglingQuestionOf(record.messages),
		cursor: cursorOf(record),
	});
}

/** A turn's records: the bot's assistant message first (the repeat check
 *  compares it), then any results and markers. */
type Built = [LhMessage & AssistantMessage, ...LhMessage[]];
type Checked = { ok: true; built: Built } | { ok: false; problems: string[] };

/** One row per turn kind, typed against its own schema's payload. */
interface TurnKindRow<S extends TSchema> {
	/** The LearnHarness tool this kind writes a call to; null for plain text. */
	tool: string | null;
	phases: readonly Phase3[];
	schema: S;
	/** Problems the schema cannot express; empty means valid. `raw` is the
	 *  payload before the boundary's conversion. */
	refine: ((payload: Static<S>, raw: Record<string, unknown>) => string[]) | null;
	needsPlanNode: boolean;
	build: (payload: Static<S>) => Built;
}

/** A table row with its payload type closed over: `check` runs the
 *  validation as the tool boundary does (the schema the way pi checks it,
 *  convert then check, then the refinement) and builds the records. */
type TurnKind = Omit<TurnKindRow<TSchema>, "refine" | "build"> & { check: (payload: Record<string, unknown>) => Checked };

function turnKind<S extends TSchema>(name: string, row: TurnKindRow<S>): TurnKind {
	const check = (payload: Record<string, unknown>): Checked => {
		let checked: Static<S>;
		try {
			checked = validateToolArguments(
				{ name: row.tool ?? name, description: name, parameters: row.schema },
				// The body is parsed JSON, so its values are JSON values.
				{ type: "toolCall", id: "bot_turn", name: row.tool ?? name, arguments: payload as ToolCall["arguments"] },
			) as Static<S>;
		} catch (err) {
			return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
		}
		const problems = row.refine?.(checked, payload) ?? [];
		return problems.length ? { ok: false, problems } : { ok: true, built: row.build(checked) };
	};
	return { tool: row.tool, phases: row.phases, schema: row.schema, needsPlanNode: row.needsPlanNode, check };
}

const ANY_PHASE = ["probe", "plan", "teach"] as const satisfies readonly Phase3[];

/** Drops trailing \n and \r by scanning back from the end. A `[\r\n]+$`
 *  regex retries at every newline, so a long run mid-text costs seconds. */
function trimLineBreaks(text: string): string {
	let end = text.length;
	while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
	return text.slice(0, end);
}

/** THE KINDS TABLE. Later tickets add a row per kind. */
const TURN_KINDS: Readonly<Record<string, TurnKind>> = {
	say: turnKind("say", {
		tool: null,
		phases: ANY_PHASE,
		schema: Type.Object({ text: Type.String({ description: "The teaching text, Markdown." }) }),
		// The boundary converts a scalar to a string; teaching text that was
		// null or a number is a caller bug, not text to show the learner.
		refine: (p, raw) => (typeof raw.text !== "string" ? ["text must be a string"] : p.text.trim() === "" ? ["text must not be empty"] : []),
		needsPlanNode: false,
		// Trailing line breaks (\n and \r) go: `echo` adds one a `--file` rerun
		// may lack, the repeat check compares exact text, and the stored text
		// must say back to itself (show → say). Other trailing whitespace (a
		// Markdown hard break) stays.
		build: (p) => [newBotAssistantMessage([{ type: "text", text: trimLineBreaks(p.text) }])],
	}),
};

/** Content with tool-call ids dropped: two turns with the same blocks are
 *  the same turn, whatever ids they were minted with. */
function turnSignature(m: AssistantMessage): string {
	return JSON.stringify(m.content.map((b) => (b.type === "toolCall" ? { ...b, id: undefined } : b)));
}

/** Turn: `{ kind, after, ...payload }`. Checks run in the spec's order,
 *  all before any write, with no await from the read to the commit.
 *  Checks 5 and 6 (open question, phase) arrive with the question kinds.
 *  Validation runs early because the repeat check compares checked
 *  payloads, but its refusal waits for its place, check 7. */
export function botTurn(id: string, body: unknown): Response {
	// 1. the lesson exists and is bot-run
	const record = botLesson(id);
	if (record instanceof Response) return record;
	const cursor = cursorOf(record);
	// A body that is not an object has no `after`, so check 2 refuses it.
	const isObject = typeof body === "object" && body !== null && !Array.isArray(body);
	const { kind, after, ...payload } = (isObject ? body : {}) as Record<string, unknown>;

	// 2. `after` names a message in the lesson, or is the lesson id (an
	// empty lesson's cursor: the start). The start stays valid after the
	// first turn so a retried first turn reaches the repeat check.
	const afterIndex = record.messages.findIndex((m) => m.id === after);
	// The refusal carries the input after the bot's last message, as answer
	// does, so a bot that adopts the cursor has not skipped any.
	if (typeof after !== "string" || (afterIndex === -1 && after !== record.id)) {
		return fail(400, "bad_after", { items: unreadByBot(record), cursor });
	}
	const since = record.messages.slice(afterIndex + 1);

	const row = typeof kind === "string" && Object.hasOwn(TURN_KINDS, kind) ? TURN_KINDS[kind] : undefined;
	const checked: Checked = row
		? row.check(payload)
		: { ok: false, problems: [`unknown kind ${JSON.stringify(kind)}; kinds: ${Object.keys(TURN_KINDS).join(", ")}`] };

	// 3. repeat: the same turn already follows `after`
	if (checked.ok) {
		const signature = turnSignature(checked.built[0]);
		if (since.some((m) => isBotMessage(m) && turnSignature(m) === signature)) {
			return Response.json({ ok: true, repeat: true, items: unreadByBot(record), cursor });
		}
	}

	// 4. learner input the bot has not read
	const unread = learnerItems(since);
	if (unread.length > 0) return fail(409, "unread_input", { items: unread, cursor });

	// 7. validation
	if (!checked.ok) return fail(422, "invalid", { problems: checked.problems, cursor });

	const failed = commitOrFail(record, checked.built);
	if (failed) return failed;
	return Response.json({ ok: true, cursor: checked.built[checked.built.length - 1]!.id });
}
