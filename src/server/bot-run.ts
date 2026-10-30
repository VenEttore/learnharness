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

/** The newest message's id. An empty lesson has none, so its cursor is the
 *  lesson id, which `after` accepts as "before the first message". */
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
	const existing = stores.chatStore.listChats().find((c) => c.driver !== undefined && c.externalKey === key);
	if (existing) {
		const record = stores.chatStore.getChat(existing.id);
		if (record) return Response.json({ ok: true, id: record.id, title: record.title, existing: true, cursor: cursorOf(record) });
	}
	const title = typeof b.title === "string" ? b.title : "";
	const chat = stores.chatStore.createChat(titleFromPrompt(title || "Untitled session"), undefined, { driver: "external", externalKey: key });
	let messages: LhMessage[] = [];
	if (typeof b.prompt === "string" && b.prompt.trim() !== "") {
		messages = [newUserMessage(b.prompt)];
		commitBotRun(chat.id, messages);
	}
	return Response.json({ ok: true, id: chat.id, title: chat.title, existing: false, cursor: cursorOf({ ...chat, messages }) });
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
	const lastBot = record.messages.findLastIndex(isBotMessage);
	return Response.json({
		ok: true,
		items: learnerItems(record.messages.slice(lastBot + 1)),
		openQuestion: danglingQuestionOf(record.messages),
		cursor: cursorOf(record),
	});
}

/** One row per turn kind. `build` returns the records to append, the
 *  bot's assistant message first; the repeat check compares that message. */
interface TurnKind {
	/** The LearnHarness tool this kind writes a call to; null for plain text. */
	tool: string | null;
	phases: readonly Phase3[];
	schema: TSchema;
	/** Problems the schema cannot express; empty means valid. */
	refine: ((payload: never) => string[]) | null;
	needsPlanNode: boolean;
	build: (payload: never) => LhMessage[];
}

const ANY_PHASE = ["probe", "plan", "teach"] as const satisfies readonly Phase3[];

const sayInputSchema = Type.Object({ text: Type.String({ description: "The teaching text, Markdown." }) });
type SayInput = Static<typeof sayInputSchema>;

/** THE KINDS TABLE. Later tickets add a row per kind. */
const TURN_KINDS = {
	say: {
		tool: null,
		phases: ANY_PHASE,
		schema: sayInputSchema,
		refine: (p: SayInput) => (p.text.trim() === "" ? ["text must not be empty"] : []),
		needsPlanNode: false,
		build: (p: SayInput) => [newBotAssistantMessage([{ type: "text", text: p.text }])],
	},
} satisfies Record<string, TurnKind>;

type TurnKindName = keyof typeof TURN_KINDS;

/** Validation as the tool boundary runs it: the schema the way pi checks
 *  it (convert, then check), then the refinement. */
function checkPayload(row: TurnKind, kind: string, payload: Record<string, unknown>): { ok: true; payload: unknown } | { ok: false; problems: string[] } {
	let checked: unknown;
	try {
		checked = validateToolArguments(
			{ name: row.tool ?? kind, description: kind, parameters: row.schema },
			// The body is parsed JSON, so its values are JSON values.
			{ type: "toolCall", id: "bot_turn", name: row.tool ?? kind, arguments: payload as ToolCall["arguments"] },
		);
	} catch (err) {
		return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
	}
	const problems = row.refine ? row.refine(checked as never) : [];
	return problems.length ? { ok: false, problems } : { ok: true, payload: checked };
}

/** Content with tool-call ids dropped: two turns with the same blocks are
 *  the same turn, whatever ids they were minted with. */
function turnSignature(m: AssistantMessage): string {
	return JSON.stringify(m.content.map((b) => (b.type === "toolCall" ? { ...b, id: undefined } : b)));
}

/** Turn: `{ kind, after, ...payload }`. Checks run in the spec's order,
 *  all before any write, with no await from the read to the commit.
 *  Checks 5 and 6 (open question, phase) arrive with the question kinds. */
export function botTurn(id: string, body: unknown): Response {
	// 1. the lesson exists and is bot-run
	const record = botLesson(id);
	if (record instanceof Response) return record;
	const cursor = cursorOf(record);
	const { kind, after, ...payload } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

	// 2. `after` names a message in the lesson (the lesson id: the start)
	const afterIndex = after === record.id ? -1 : record.messages.findIndex((m) => m.id === after);
	if (typeof after !== "string" || (afterIndex === -1 && after !== record.id)) return fail(400, "bad_after", { cursor });
	const since = record.messages.slice(afterIndex + 1);

	const row: TurnKind | undefined = typeof kind === "string" && Object.hasOwn(TURN_KINDS, kind) ? TURN_KINDS[kind as TurnKindName] : undefined;
	const checked = row ? checkPayload(row, kind as string, payload) : null;
	const built = checked?.ok ? row!.build(checked.payload as never) : null;

	// 3. repeat: the same turn already follows `after`
	const own = built?.[0];
	if (own?.role === "assistant") {
		const signature = turnSignature(own);
		if (since.some((m) => isBotMessage(m) && turnSignature(m) === signature)) {
			return Response.json({ ok: true, repeat: true, cursor });
		}
	}

	// 4. learner input the bot has not read
	const unread = learnerItems(since);
	if (unread.length > 0) return fail(409, "unread_input", { items: unread, cursor });

	// 7. validation
	if (!row) return fail(422, "invalid", { problems: [`unknown kind ${JSON.stringify(kind)}; kinds: ${Object.keys(TURN_KINDS).join(", ")}`] });
	if (!checked || !checked.ok || !built) return fail(422, "invalid", { problems: checked && !checked.ok ? checked.problems : [] });

	const messages = [...record.messages, ...built];
	commitBotRun(record.id, messages);
	return Response.json({ ok: true, cursor: messages.at(-1)!.id });
}
