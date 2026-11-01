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

import type { AssistantMessage, ToolCall, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { Type, type Static, type TSchema } from "typebox";
import { parseMermaidPlan } from "../agent/tools/mermaid-plan.ts";
import { probeDoneInputSchema, titleFromPrompt, type ChatRecord, type PlanTree } from "../core/contracts.ts";
import { emit } from "../core/events.ts";
import { ChatInputError, inputAppends, isQuestionTool, type TurnInput } from "../core/input-events.ts";
import { danglingQuestionOf, newHandoffMessage, newMessageId, newUserMessage, type LhMessage } from "../core/native-messages.ts";
import { phaseAt3Lh, type Phase3 } from "../core/phases.ts";
import { planBlocksFor } from "../core/plan-blocks.ts";
import { createTree, PlanTreeError } from "../core/plan-tree.ts";
import {
	askInputSchema,
	askOptionProblems,
	explainInputBase,
	explainInputObject,
	explainInputProblems,
	probeQuizInputSchema,
	quizInputObject,
	quizInputProblems,
	type QuestionAnswerData,
	type QuestionKind,
} from "../core/question-core.ts";
import {
	planInitInputSchema,
	planInitSuccessResult,
	planNodeProblem,
	probeDoneSuccessResult,
	type TeachingToolSuccess,
} from "../core/teaching-tool-results.ts";
import { stores } from "./stores.ts";
import { settledTurnResponse } from "./turn-runs.ts";

/** The refusal code of chat input that a bot-run lesson turns down
 *  (handleBotRunInput). */
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
 *  preflight), and a non-loopback Host means DNS rebinding. A remote peer
 *  can forge Host, so keeping it out is the 127.0.0.1 bind's job, not
 *  this check's. lh sends neither. Null when the request may proceed. */
export function externalRequestRefusal(req: Request): Response | null {
	if (req.headers.has("origin")) return fail(403, "forbidden_origin");
	const host = req.headers.get("host");
	if (host !== null && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return fail(403, "forbidden_host");
	return null;
}

/** The newest message's id. An empty lesson has none, so its cursor is the
 *  lesson id, which `after` accepts as "before the first message". A
 *  reply whose cursor passes learner input the bot has not read (a
 *  create, a repeat, bad_after, show) also carries those items, so
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

/** One piece of learner input as the bot reads it: a typed message, or a
 *  question's answer or skip (the tool result the page saved). */
type LearnerItem =
	| { type: "message"; id: string; text: string }
	| {
			type: "answer";
			id: string;
			toolCallId: string;
			kind: QuestionKind;
			question: string;
			answers: { index: number; label: string }[];
			dontKnow: boolean;
			text?: string;
			other?: string;
			thinking?: string;
			readingThinking?: string;
			confidence?: number;
			correct?: boolean;
	  }
	| { type: "skip"; id: string; toolCallId: string; kind: QuestionKind };

/** A question tool's result as the bot reads it. The page saved the full
 *  answer on `details` (newAnswerResult); the fields are the ones the
 *  model-facing compact form reads (compactAnswerForModel), with
 *  `thinking ?? note` the same way, and absent ones left absent. */
function answerItem(m: LhMessage & ToolResultMessage): LearnerItem {
	// Question results come only from the page's answer and dismiss routes,
	// which both store the answer data whole.
	const ad = m.details as unknown as QuestionAnswerData;
	if (ad.dismissed) return { type: "skip", id: m.id, toolCallId: m.toolCallId, kind: ad.kind };
	return {
		type: "answer",
		id: m.id,
		toolCallId: m.toolCallId,
		kind: ad.kind,
		question: ad.questionText,
		answers: Array.isArray(ad.answers) ? ad.answers.map((a) => ({ index: a.index, label: a.label })) : [],
		dontKnow: ad.dontKnow,
		text: ad.text,
		other: ad.other,
		thinking: ad.thinking ?? ad.note,
		readingThinking: ad.readingThinking,
		confidence: ad.confidence,
		correct: ad.correct,
	};
}

/** The learner input among `messages`, in order: typed messages, and the
 *  results of question calls (answers and skips). Other tool results are
 *  the bot's own (probe_done, plan_init), and markers are scaffolding. */
function learnerItems(messages: readonly LhMessage[]): LearnerItem[] {
	return messages.flatMap((m): LearnerItem[] => {
		if (m.role === "user") return [{ type: "message", id: m.id, text: textOf(m.content) }];
		if (m.role === "toolResult" && isQuestionTool(m.toolName)) return [answerItem(m)];
		return [];
	});
}

/** The learner input after the bot's last message, and after `afterIndex`
 *  when that is later: what the bot has not replied to or read. With no
 *  `afterIndex` it is what answer returns. */
function unreadByBot(record: ChatRecord, afterIndex = -1): LearnerItem[] {
	return learnerItems(record.messages.slice(Math.max(record.messages.findLastIndex(isBotMessage), afterIndex) + 1));
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
	return Response.json({ ok: true, id: chat.id, title: chat.title, existing: false, items: unreadByBot(chat), cursor: cursorOf(chat) });
}

/** commitBotRun for the external routes, after the turn's save outside
 *  the transcript if it has one: a failed save is a JSON 500 the bot can
 *  retry, never an HTML error page. Null when the save landed. */
function commitOrFail(record: ChatRecord, built: Built): Response | null {
	try {
		built.saveFirst?.();
		commitBotRun(record.id, [...record.messages, ...built.records]);
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

/** The tree of the latest successful plan_init in the transcript, the one
 *  the page's plan map draws (latestTree reads the same result's details
 *  through the view), or null before any plan. */
function latestPlan(messages: readonly LhMessage[]): PlanTree | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "toolResult" || m.toolName !== "plan_init" || m.isError) continue;
		const details = m.details as { ok?: unknown; tree?: PlanTree } | undefined;
		if (details?.ok === true && details.tree) return details.tree;
	}
	return null;
}

/** Show: the whole lesson, for a bot resuming a lesson, its own or one
 *  an earlier bot started. `plan` is the latest successful plan's tree.
 *  Its cursor passes any unread input, so the reply carries those items,
 *  as answer's does. */
export function showBotLesson(id: string): Response {
	const record = botLesson(id);
	if (record instanceof Response) return record;
	return Response.json({
		ok: true,
		id: record.id,
		title: record.title,
		phase: phaseAt3Lh(record.messages),
		plan: latestPlan(record.messages),
		openQuestion: danglingQuestionOf(record.messages),
		messages: record.messages.map(compactMessage),
		items: unreadByBot(record),
		cursor: cursorOf(record),
	});
}

/** Answer: the learner input after the bot's last message, in order. Turn
 *  check 4 keeps the bot from writing past input no reply has handed it
 *  (every reply whose cursor passes unread input carries it as items), so
 *  this list is complete. Read-only, so reading twice returns the same
 *  items. */
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
 *  compares it), then any results and markers. `saveFirst` is a save
 *  outside the transcript (plan's tree) that runs, after every check,
 *  just before the records commit. */
type Built = { records: [LhMessage & AssistantMessage, ...LhMessage[]]; saveFirst?: () => void };
/** A failed check still carries `built` when the payload's only problems are
 *  the lesson's state (the plan-node check), so the repeat check can see
 *  a retry of a turn that landed before a plan rewrite dropped its node. */
type Checked = { ok: true; built: Built } | { ok: false; problems: string[]; built?: Built };

/** One row per turn kind, typed against its own schema's payload. */
interface TurnKindRow<S extends TSchema> {
	/** The LearnHarness tool this kind writes a call to; null for plain text. */
	tool: string | null;
	phases: readonly Phase3[];
	schema: S;
	/** Problems the schema cannot express (the tool's own refinement);
	 *  empty means valid. */
	refine: ((payload: Static<S>) => string[]) | null;
	/** The payload's `nodeId` must name a node of the lesson's plan (the
	 *  shared plan-node check, after the refinement). Such a row's `build`
	 *  also runs on a node the plan lacks (for the repeat check), so it must
	 *  not look the node up. */
	needsPlanNode: boolean;
	/** Takes optional lead-in `text`, which rides the same assistant message
	 *  ahead of the call and is not part of the tool's arguments. */
	takesLeadIn: boolean;
	/** `leadIn` is the trimmed lead-in, or "" for none; `record` is the
	 *  lesson as read, for records keyed by its id (the handoff marker) or
	 *  derived from its transcript (the plan block's snapshot). */
	build: (payload: Static<S>, leadIn: string, record: ChatRecord) => Built;
}

/** A table row with its payload type closed over: `check` runs the
 *  validation as the tool boundary does (the schema the way pi checks it,
 *  convert then check, then the refinement, then the plan-node check) and
 *  builds the records. */
type TurnKind = Omit<TurnKindRow<TSchema>, "refine" | "build"> & { check: (payload: Record<string, unknown>, record: ChatRecord) => Checked };

function jsonType(value: unknown): string {
	return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

/** Where the boundary's conversion changed a value's JSON type. pi lets a
 *  model's `42` stand for "42"; from a bot it is a caller bug, refused
 *  rather than shown to the learner. pi also drops an optional field sent
 *  as null, so a raw null the checked value lacks is refused too: the
 *  record would not hold what the bot sent. */
function conversionProblems(raw: unknown, checked: unknown, path: string): string[] {
	const want = jsonType(checked);
	const got = jsonType(raw);
	if (want !== got) return [`${path} must be ${want === "array" || want === "object" ? "an" : "a"} ${want}, not ${got}`];
	if (want === "array") return (checked as unknown[]).flatMap((v, i) => conversionProblems((raw as unknown[])[i], v, `${path}[${i}]`));
	if (want === "object") {
		const rawObject = raw as Record<string, unknown>;
		const dropped = Object.keys(rawObject).flatMap((k) =>
			rawObject[k] === null && !Object.hasOwn(checked as object, k) ? [`${path ? `${path}.${k}` : k} must not be null; leave it out`] : [],
		);
		return [
			...dropped,
			...Object.entries(checked as Record<string, unknown>).flatMap(([k, v]) => conversionProblems(rawObject[k], v, path ? `${path}.${k}` : k)),
		];
	}
	return [];
}

/** Fields the schema does not define. pi passes them through for a model;
 *  from a bot they are typos the page would never show (`detials`), and
 *  stored, they would make a clean retry miss the repeat check. With these
 *  and conversions refused, the dock's display parse (core/tool-parts.ts)
 *  reads every call the boundary accepts: its one extra rule heals a
 *  quoted `type`, and quiz and explain take only the bare words. */
function unknownFields(schema: unknown, value: unknown, path: string): string[] {
	const s = schema as { type?: unknown; properties?: Record<string, unknown>; items?: unknown };
	if (s.type === "object" && s.properties && jsonType(value) === "object") {
		const props = s.properties;
		return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
			const at = path ? `${path}.${k}` : k;
			return Object.hasOwn(props, k) ? unknownFields(props[k], v, at) : [`${at} is not a field of this kind; fields: ${Object.keys(props).join(", ")}`];
		});
	}
	if (s.type === "array" && s.items && Array.isArray(value)) return value.flatMap((v, i) => unknownFields(s.items, v, `${path}[${i}]`));
	return [];
}

function turnKind<S extends TSchema>(name: string, row: TurnKindRow<S>): TurnKind {
	const check = (payload: Record<string, unknown>, record: ChatRecord): Checked => {
		let args = payload;
		let leadIn = "";
		if (row.takesLeadIn && Object.hasOwn(payload, "text")) {
			const { text, ...rest } = payload;
			if (typeof text !== "string") return { ok: false, problems: ["text (the lead-in) must be a string"] };
			args = rest;
			leadIn = text.trim() === "" ? "" : trimLineBreaks(text);
		}
		// Unknown fields first, on the raw payload: refused by name, and a
		// deep value under one is never walked, here or by pi.
		const unknown = unknownFields(row.schema, args, "");
		if (unknown.length > 0) return { ok: false, problems: unknown };
		let checked: Static<S>;
		try {
			checked = validateToolArguments(
				{ name: row.tool ?? name, description: name, parameters: row.schema },
				// The body is parsed JSON, so its values are JSON values.
				{ type: "toolCall", id: "bot_turn", name: row.tool ?? name, arguments: args as ToolCall["arguments"] },
			) as Static<S>;
		} catch (err) {
			return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
		}
		const converted = conversionProblems(args, checked, "");
		if (converted.length > 0) return { ok: false, problems: converted };
		const refined = row.refine?.(checked) ?? [];
		const nodeProblems = row.needsPlanNode ? planNodeProblems(checked, record) : [];
		// Reported together, as the teaching tools report them.
		if (refined.length > 0) return { ok: false, problems: [...refined, ...nodeProblems] };
		const built = row.build(checked, leadIn, record);
		return nodeProblems.length > 0 ? { ok: false, problems: nodeProblems, built } : { ok: true, built };
	};
	return { tool: row.tool, phases: row.phases, schema: row.schema, needsPlanNode: row.needsPlanNode, takesLeadIn: row.takesLeadIn, check };
}

/** The shared plan-node check (core/teaching-tool-results.ts) against the
 *  plan the page draws and show returns: the latest successful plan_init
 *  in the transcript. The model's tools read the stored tree instead, but
 *  after a failed commit that tree can be ahead of the transcript until
 *  the plan rerun lands, and a question tagged with a node the map does
 *  not draw would move the map nowhere. */
function planNodeProblems(payload: unknown, record: ChatRecord): string[] {
	// needsPlanNode rows' schemas require a string nodeId.
	const problem = planNodeProblem(latestPlan(record.messages) ?? undefined, (payload as { nodeId: string }).nodeId);
	return problem ? [problem] : [];
}

const ANY_PHASE = ["probe", "plan", "teach"] as const satisfies readonly Phase3[];

function newToolCallId(): string {
	return `call_bot_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** A question kind's records: one assistant message, the lead-in text (if
 *  any) then the call, as LearnHarness's model writes them. The call's
 *  arguments are the checked payload. No result follows: the learner's
 *  answer or skip is the result, and until then the call is the open
 *  question the dock shows. */
function questionBuild(tool: string) {
	return (payload: object, leadIn: string): Built => {
		const content: AssistantMessage["content"] = leadIn ? [{ type: "text", text: leadIn }] : [];
		// The checked payload came from parsed JSON, so it is a JSON object.
		content.push({ type: "toolCall", id: newToolCallId(), name: tool, arguments: payload as ToolCall["arguments"] });
		return { records: [newBotAssistantMessage(content)] };
	};
}

/** A server-side tool's success as the record stores it: a real tool
 *  result joined to its call by id, mapped the way serverExecute's
 *  toToolResult (src/agent/tool-execute.ts) maps a text-only result, and
 *  persisted with a record id. */
function toolSuccessMessage(call: ToolCall, success: TeachingToolSuccess<unknown>): LhMessage & ToolResultMessage {
	return {
		id: newMessageId(),
		role: "toolResult",
		toolCallId: call.id,
		toolName: call.name,
		content: [{ type: "text", text: success.text }],
		// The helpers' details are JSON values.
		details: success.details as ToolResultMessage["details"],
		isError: false,
		timestamp: Date.now(),
	};
}

/** Drops trailing \n and \r by scanning back from the end. A `[\r\n]+$`
 *  regex retries at every newline, so a long run mid-text costs seconds. */
function trimLineBreaks(text: string): string {
	let end = text.length;
	while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
	return text.slice(0, end);
}

/** plan_init's validation after its schema, as the tool runs it: the
 *  Mermaid parser (every problem, by line), then the tree builder
 *  (duplicate ids, unknown endpoints, self-loops, cycles). */
function planTreeOf(mermaid: string): { tree: PlanTree } | { problems: string[] } {
	const parsed = parseMermaidPlan(mermaid);
	if (!parsed.ok || !parsed.plan) return { problems: parsed.problems };
	try {
		return { tree: createTree(parsed.plan.nodes, parsed.plan.edges) };
	} catch (err) {
		if (err instanceof PlanTreeError) return { problems: [err.message] };
		throw err;
	}
}

/** THE KINDS TABLE. Later tickets add a row per kind. */
const TURN_KINDS: Readonly<Record<string, TurnKind>> = {
	say: turnKind("say", {
		tool: null,
		phases: ANY_PHASE,
		schema: Type.Object({ text: Type.String({ description: "The teaching text, Markdown." }) }),
		refine: (p) => (p.text.trim() === "" ? ["text must not be empty"] : []),
		needsPlanNode: false,
		takesLeadIn: false,
		// Trailing line breaks (\n and \r) go: `echo` adds one a `--file` rerun
		// may lack, the repeat check compares exact text, and the stored text
		// must say back to itself (show → say). Other trailing whitespace (a
		// Markdown hard break) stays.
		build: (p) => ({ records: [newBotAssistantMessage([{ type: "text", text: trimLineBreaks(p.text) }])] }),
	}),
	// The question rows reuse the tools' own schemas and refinements
	// (core/question-core.ts), so a call the tool would refuse is refused.
	ask: turnKind("ask", {
		tool: "ask_user_question",
		phases: ANY_PHASE,
		schema: askInputSchema,
		refine: (p) => askOptionProblems(p.options ?? []),
		needsPlanNode: false,
		takesLeadIn: true,
		build: questionBuild("ask_user_question"),
	}),
	probe: turnKind("probe", {
		tool: "probe",
		phases: ["probe"],
		schema: probeQuizInputSchema,
		refine: quizInputProblems,
		needsPlanNode: false,
		takesLeadIn: true,
		build: questionBuild("probe"),
	}),
	recall: turnKind("recall", {
		tool: "recall",
		phases: ["probe"],
		schema: explainInputBase,
		refine: explainInputProblems,
		needsPlanNode: false,
		takesLeadIn: true,
		build: questionBuild("recall"),
	}),
	// The records the probe_done tool's turn leaves (agent/tools/probe.ts),
	// without running it: the call, the shared success result, then the
	// handoff marker its queued steer would land as. Nothing is queued, so
	// nothing wakes; the phase fold reads plan from the result.
	"probe-done": turnKind("probe-done", {
		tool: "probe_done",
		phases: ["probe"],
		schema: probeDoneInputSchema,
		refine: null,
		needsPlanNode: false,
		takesLeadIn: false,
		build: (p, _leadIn, record) => {
			const call: ToolCall = { type: "toolCall", id: newToolCallId(), name: "probe_done", arguments: p };
			return { records: [newBotAssistantMessage([call]), toolSuccessMessage(call, probeDoneSuccessResult()), newHandoffMessage(record.id)] };
		},
	}),
	// The records the plan_init tool's turn leaves (agent/tools/plan.ts),
	// without running it: the tree saved first, as the tool saves it during
	// the turn, then the call, the shared success result carrying the tree,
	// and the plan-block marker the turn persist appends (planBlocksFor).
	// A later plan is a rewrite: the new tree replaces the old. Trailing
	// line breaks go from the Mermaid, as from say's text, so a `--file`
	// rerun of a piped plan is a repeat.
	plan: turnKind("plan", {
		tool: "plan_init",
		phases: ["plan", "teach"],
		schema: planInitInputSchema,
		refine: (p) => {
			const planned = planTreeOf(p.mermaid);
			return "problems" in planned ? planned.problems : [];
		},
		needsPlanNode: false,
		takesLeadIn: false,
		build: (p, _leadIn, record) => {
			const mermaid = trimLineBreaks(p.mermaid);
			const planned = planTreeOf(mermaid);
			// refine passed, so the tree builds.
			if ("problems" in planned) throw new Error(`plan refined but did not build: ${planned.problems.join("; ")}`);
			const { tree } = planned;
			const call: ToolCall = { type: "toolCall", id: newToolCallId(), name: "plan_init", arguments: { mermaid } };
			const message = newBotAssistantMessage([call]);
			const result = toolSuccessMessage(call, planInitSuccessResult(tree));
			const blocks = planBlocksFor(record.messages, [message, result], tree, [...record.messages, message, result]);
			return { records: [message, result, ...blocks], saveFirst: () => stores.chatStore.saveTree(record.id, tree) };
		},
	}),
	// The teacher's question tools (agent/tools.ts teachQuizToolFor and
	// teachExplainToolFor): `type` (predict or check) and `nodeId` lead the
	// schema. The first tagged call moves the phase fold to teach, and the
	// plan map's position folds over the same tags.
	quiz: turnKind("quiz", {
		tool: "quiz",
		phases: ["plan", "teach"],
		schema: quizInputObject,
		refine: quizInputProblems,
		needsPlanNode: true,
		takesLeadIn: true,
		build: questionBuild("quiz"),
	}),
	explain: turnKind("explain", {
		tool: "explain",
		phases: ["plan", "teach"],
		schema: explainInputObject,
		refine: explainInputProblems,
		needsPlanNode: true,
		takesLeadIn: true,
		build: questionBuild("explain"),
	}),
};

/** The kinds a turn may take in `phase`, for the wrong_phase refusal. */
function kindsAllowedIn(phase: Phase3): string[] {
	return Object.keys(TURN_KINDS).filter((k) => TURN_KINDS[k]!.phases.includes(phase));
}

/** JSON with object keys sorted at every level, so key order is not
 *  meaning: `{a, b}` and `{b, a}` sign the same. */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) =>
		typeof v === "object" && v !== null && !Array.isArray(v)
			? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
			: v,
	);
}

/** What makes two turns the same turn: a call turn's calls without their
 *  ids (a lead-in is wording, so a retry that rewords it repeats), and a
 *  text turn's text. Key order in the bot's JSON does not count. */
function turnSignature(m: AssistantMessage): string {
	const calls = m.content.flatMap((b) => (b.type === "toolCall" ? [{ ...b, id: undefined }] : []));
	return canonicalJson(calls.length > 0 ? calls : m.content);
}

/** Turn: `{ kind, after, ...payload }`. Checks run in the spec's order,
 *  all before any write, with no await from the read to the commit.
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
	let checked: Checked;
	try {
		checked = row
			? row.check(payload, record)
			: { ok: false, problems: [`unknown kind ${JSON.stringify(kind)}; kinds: ${Object.keys(TURN_KINDS).join(", ")}`] };
	} catch (err) {
		// A row's own bug, not the bot's input: a JSON reply, nothing saved.
		console.error(`[chat ${record.id}] bot-run ${String(kind)} build failed:`, err);
		return fail(500, "internal_error", { cursor });
	}

	// 3. repeat: the same turn already follows `after`. A turn refused only
	// by the plan-node check is built too: it may have landed before a plan
	// rewrite dropped its node.
	if (checked.built) {
		const signature = turnSignature(checked.built.records[0]);
		if (since.some((m) => isBotMessage(m) && turnSignature(m) === signature)) {
			return Response.json({ ok: true, repeat: true, items: unreadByBot(record), cursor });
		}
	}

	// 4. learner input the bot has not read: past `after`, and past the
	// bot's last message, so a stale `after` does not resurface input the
	// bot already replied to.
	const unread = unreadByBot(record, afterIndex);
	if (unread.length > 0) return fail(409, "unread_input", { items: unread, cursor });

	// 5. a question is still open: the learner answers or skips it first
	if (danglingQuestionOf(record.messages) !== null) return fail(409, "open_question", { cursor });

	// 6. the kind fits the lesson's phase (an unknown kind is check 7's)
	const phase = phaseAt3Lh(record.messages);
	if (row && !row.phases.includes(phase)) return fail(409, "wrong_phase", { phase, allowed: kindsAllowedIn(phase), cursor });

	// 7. validation
	if (!checked.ok) return fail(422, "invalid", { problems: checked.problems, cursor });

	const failed = commitOrFail(record, checked.built);
	if (failed) return failed;
	return Response.json({ ok: true, cursor: checked.built.records.at(-1)!.id });
}
