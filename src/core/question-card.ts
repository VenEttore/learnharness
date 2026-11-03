/**
 * THE QUESTION CARD (fork, external-teacher ticket 22): what a learner on
 * a phone needs to answer the open question, read from the stored record.
 * The card page (app/chat/[id]/card) renders it for a screenshot the Bot
 * Teacher sends in Grok Bot chat; the learner replies with option numbers
 * and the bot saves the answer with `lh submit` (ticket 21).
 *
 * Pure and read-only. The open question is the same stored question call
 * the lesson page docks and `lh show` reports (pendingQuestionOf /
 * danglingQuestionOf). Option numbers follow the order the page shows:
 * quiz-kind options (quiz and probe) are shuffled by call id, ask options
 * keep their authored order. `displayedQuestionOptions` is that order,
 * shared with the question dock so the two can never disagree.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { derivePlanStatusesLh } from "./contracts.ts";
import type { PlanTree } from "./contracts.ts";
import { failedOutputCallIds, pendingQuestionOf, userFacingTextOf, type LhMessage } from "./native-messages.ts";
import { QUESTION_TOOLS, toolQuestionKind } from "./pending.ts";
import { phaseAt3Lh, type Phase3 } from "./phases.ts";
import { normalizeOptions, normalizeQuizType, seededRandom, shuffleOptions, type QuestionKind, type QuestionMode, type QuizOption } from "./question-core.ts";
import { parseAskInput, parseExplainInput, parseQuizInput } from "./tool-parts.ts";

/** The options in the order the question dock shows them. Quiz-kind
 *  options are shuffled, seeded by the call id, so position never leaks
 *  correctness and server and client agree; ask options keep authored
 *  order. */
export function displayedQuestionOptions(
	kind: QuestionKind,
	toolCallId: string,
	options: QuizOption[],
): QuizOption[] {
	return kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(toolCallId)) : options;
}

export interface QuestionCardOption {
	/** 1-based, in display order: the number the learner replies with. */
	number: number;
	label: string;
	/** Ask options only; quiz options never show a description. */
	description?: string;
}

export interface QuestionCardQuestion {
	toolCallId: string;
	/** The stored tool name: probe, quiz, explain, ask_user_question, recall. */
	tool: string;
	/** The kind word the card shows. */
	kindLabel: "Probe" | "Quiz" | "Explain" | "Ask" | "Recall";
	/** A teach-phase quiz's role, when it has one. */
	role?: "predict" | "check";
	/** Assistant text in the question's own message, before the call. */
	leadIn: string | null;
	question: string;
	details?: string;
	/** "text": a typed answer is expected (explain, recall, ask without options). */
	mode: QuestionMode;
	options: QuestionCardOption[];
	/** Quiz kinds offer "I don't know" and take a confidence. */
	quiz: boolean;
	/** Ask offers a free "Other" answer beside its options. */
	other: boolean;
}

export interface QuestionCardPlan {
	tree: PlanTree;
	current: string | null;
	visited: string[];
}

export interface QuestionCard {
	phase: Phase3;
	plan: QuestionCardPlan | null;
	/** The latest teaching text before the open question (or, with none
	 *  open, the latest teaching text in the lesson). When the open
	 *  question has a lead-in, only text no answered question separates
	 *  from it: older text would sit above newer teaching. */
	teaching: string | null;
	/** null: no open question. */
	question: QuestionCardQuestion | null;
	/** The open question's input did not parse (the page shows its
	 *  "arrived malformed" fallback for the same case). */
	malformed: boolean;
}

const KIND_LABEL: Record<(typeof QUESTION_TOOLS)[number], QuestionCardQuestion["kindLabel"]> = {
	probe: "Probe",
	quiz: "Quiz",
	explain: "Explain",
	ask_user_question: "Ask",
	recall: "Recall",
};

/** The latest successful plan_init tree, the one the page's plan map draws. */
function latestPlanTree(messages: readonly LhMessage[]): PlanTree | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "toolResult" || m.toolName !== "plan_init" || m.isError) continue;
		const details = m.details as { ok?: unknown; tree?: PlanTree } | undefined;
		if (details?.ok === true && details.tree && Array.isArray(details.tree.nodes)) return details.tree;
	}
	return null;
}

/** The texts as one Markdown block, or null when blank. Only the end is
 *  trimmed: a leading indent can be an indented code block, which the
 *  lesson page renders as code. */
function joined(texts: string[]): string | null {
	const text = texts.join("\n\n");
	return text.trim() ? text.trimEnd() : null;
}

const isQuestionCall = (b: AssistantMessage["content"][number]) =>
	b.type === "toolCall" && (QUESTION_TOOLS as readonly string[]).includes(b.name);

/** The newest learner-facing text in `content`, split at question calls:
 *  text on the far side of an answered question belongs to an older
 *  exchange. A message without question calls is one segment. */
function newestSegmentText(content: AssistantMessage["content"], failed: ReadonlySet<string>): string | null {
	let stop = content.length;
	for (let i = content.length - 1; i >= -1; i--) {
		if (i >= 0 && !isQuestionCall(content[i]!)) continue;
		const text = joined(userFacingTextOf(content.slice(i + 1, stop), failed));
		if (text) return text;
		stop = i;
	}
	return null;
}

/** The latest teaching before message `end`: the newest text segment the
 *  lesson page shows there. Text beside an earlier question counts: in
 *  ordinary lessons the teacher sends its teaching in the same message as
 *  the question. */
function latestTeaching(messages: readonly LhMessage[], end: number, failed: ReadonlySet<string>): string | null {
	for (let i = end - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") continue;
		const text = newestSegmentText((m as AssistantMessage).content, failed);
		if (text) return text;
	}
	return null;
}

/** Question calls the learner answered or skipped: a result that is not
 *  an error. A call the tool refused (an error result) or one from an
 *  aborted generation (no result) never reached the learner. */
function answeredQuestionCalls(messages: readonly LhMessage[]): Set<string> {
	const out = new Set<string>();
	for (const m of messages) {
		if (m.role === "toolResult" && !m.isError && (QUESTION_TOOLS as readonly string[]).includes(m.toolName)) out.add(m.toolCallId);
	}
	return out;
}

/** The latest teaching before message `end` that no answered question
 *  separates from it: this exchange's teaching, or null. */
function exchangeTeaching(messages: readonly LhMessage[], end: number, failed: ReadonlySet<string>): string | null {
	const answered = answeredQuestionCalls(messages);
	for (let i = end - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") continue;
		const content = (m as AssistantMessage).content;
		const lastAnswered = content.findLastIndex((b) => isQuestionCall(b) && answered.has((b as { id: string }).id));
		const text = joined(userFacingTextOf(content.slice(lastAnswered + 1), failed));
		if (text || lastAnswered >= 0) return text;
	}
	return null;
}

/** A displayed option with the number the learner replies with. */
export type NumberedQuestionOption = QuizOption & { number: number };

/** The dock's mode and the options as the card numbers them (an ask
 *  option keeps its description), for a parsed
 *  input. The dock's rule, on the same input it reads (the parsed, not yet
 *  normalized options): a quiz always selects; an ask selects only with
 *  options. A text question has no options. */
function numberedOptionsOf(
	kind: QuestionKind,
	toolCallId: string,
	parsed: NonNullable<ReturnType<typeof parseQuizInput | typeof parseExplainInput | typeof parseAskInput>>,
): { mode: QuestionMode; options: NumberedQuestionOption[] } {
	const rawOptions = "options" in parsed ? (parsed.options as { label: string; value?: string; description?: string }[] | undefined) : undefined;
	const multi = "multiSelect" in parsed && parsed.multiSelect === true;
	const mode: QuestionMode =
		kind === "quiz" ? (multi ? "multi-select" : "single-select")
			: kind === "ask" && rawOptions?.length ? (multi ? "multi-select" : "single-select")
				: "text";
	if (mode === "text") return { mode, options: [] };
	const options = displayedQuestionOptions(kind, toolCallId, normalizeOptions(rawOptions ?? []));
	// Quiz options never show a description.
	return {
		mode,
		options: options.map((o, i) => ({
			number: i + 1,
			label: o.label,
			value: o.value,
			...(kind === "ask" && o.description ? { description: o.description } : {}),
		})),
	};
}

/** The open question's options as the card numbers them (fork,
 *  external-teacher ticket 26), for `lh show` and `lh answer`: `number`,
 *  `label` and `value`, plus an ask option's `description`. Empty for a
 *  question without options (explain, recall, an ask without options) and
 *  for an input that does not parse, which the card shows as malformed. */
export function numberedQuestionOptions(
	tool: string,
	toolCallId: string,
	input: unknown,
): NumberedQuestionOption[] {
	const kind = toolQuestionKind(tool);
	const parsed = kind === "quiz" ? parseQuizInput(input) : kind === "explain" ? parseExplainInput(input) : parseAskInput(input);
	if (!parsed) return [];
	return numberedOptionsOf(kind, toolCallId, parsed).options;
}

function buildQuestion(
	tool: string,
	toolCallId: string,
	input: unknown,
	leadIn: string | null,
): QuestionCardQuestion | null {
	const kind = toolQuestionKind(tool);
	const parsed = kind === "quiz" ? parseQuizInput(input) : kind === "explain" ? parseExplainInput(input) : parseAskInput(input);
	if (!parsed) return null;
	const { mode, options } = numberedOptionsOf(kind, toolCallId, parsed);
	const role = kind === "quiz" ? normalizeQuizType((parsed as { type?: unknown }).type) : undefined;
	return {
		toolCallId,
		tool,
		kindLabel: KIND_LABEL[tool as keyof typeof KIND_LABEL] ?? "Ask",
		...(role ? { role } : {}),
		leadIn,
		question: parsed.question,
		...(parsed.details ? { details: parsed.details } : {}),
		mode,
		options: options.map(({ value: _value, ...o }) => o),
		quiz: kind === "quiz",
		other: kind === "ask" && mode !== "text",
	};
}

/** The lead-in is the text right before the open call, after any earlier
 *  question call in the same message (parallel questions each keep their
 *  own). Text before that earlier call is the latest teaching. */
function leadInAt(message: AssistantMessage, contentIndex: number, failed: ReadonlySet<string>, answered: ReadonlySet<string>) {
	const before = message.content.slice(0, contentIndex);
	const previousCall = before.findLastIndex(isQuestionCall);
	const texts = userFacingTextOf(before.slice(previousCall + 1), failed);
	const answeredSibling = before.some((b) => isQuestionCall(b) && answered.has((b as { id: string }).id));
	return { before, previousCall, answeredSibling, texts, leadIn: joined(texts) };
}

/** The open question's lead-in as stored (not trimmed, so an indented
 *  code block keeps its indent), or null for none. `toolCallId` names the
 *  question the caller means; a different open question gives null. */
export function openQuestionLeadIn(messages: readonly LhMessage[], toolCallId: string): string | null {
	const pending = pendingQuestionOf(messages);
	if (!pending || pending.toolCallId !== toolCallId) return null;
	const message = messages.find((m) => m.id === pending.messageId);
	if (!message || message.role !== "assistant") return null;
	const { texts } = leadInAt(message as AssistantMessage, pending.contentIndex, failedOutputCallIds(messages), answeredQuestionCalls(messages));
	// Joined as a message's `text` is (bot-run.ts textOf).
	return texts.length > 0 ? texts.join("\n") : null;
}

export function questionCardOf(messages: readonly LhMessage[]): QuestionCard {
	const tree = latestPlanTree(messages);
	const statuses = tree ? derivePlanStatusesLh(tree, messages) : null;
	const plan = tree && tree.nodes.length > 0
		? { tree, current: statuses?.current ?? null, visited: statuses ? [...statuses.visited] : [] }
		: null;
	const failed = failedOutputCallIds(messages);
	const phase = phaseAt3Lh(messages);
	const pending = pendingQuestionOf(messages);
	const at = pending ? messages.findIndex((m) => m.id === pending.messageId) : -1;
	if (!pending || at < 0) {
		return { phase, plan, teaching: latestTeaching(messages, messages.length, failed), question: null, malformed: false };
	}
	const { before, previousCall, answeredSibling, leadIn } = leadInAt(messages[at] as AssistantMessage, pending.contentIndex, failed, answeredQuestionCalls(messages));
	const question = buildQuestion(pending.tool, pending.toolCallId, pending.input, leadIn);
	const sameMessageTeaching = previousCall >= 0 ? newestSegmentText(before.slice(0, previousCall), failed) : null;
	// This exchange's teaching: text the open question's own message sent
	// before an earlier call (one turn), else text no answered question
	// separates from it. An answered question earlier in its own message
	// separates it from older messages too; a refused call does not.
	// With a lead-in of its own, older text belongs to an older exchange:
	// the lead-in is the latest teaching, and the question box shows it.
	// Without one, the latest teaching is shown wherever it sits.
	const teaching = sameMessageTeaching
		?? (answeredSibling ? null : exchangeTeaching(messages, at, failed))
		?? (leadIn ? null : latestTeaching(messages, at, failed));
	return {
		phase,
		plan,
		teaching,
		question,
		malformed: question === null,
	};
}
