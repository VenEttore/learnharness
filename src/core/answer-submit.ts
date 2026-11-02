/**
 * ANSWERS WITHOUT A TAKEOVER (fork, external-teacher ticket 21): `lh
 * submit` saves a learner's answer, given in another channel (a Grok Bot
 * chat widget on a phone), exactly as the lesson page would save it.
 *
 * Two halves, both pure:
 * - `questionDataOf` is the question dock's own QuestionData (the dock
 *   builds it through this function), so the answer record `buildAnswer`
 *   makes from it is the page's record, grading and the option snapshot
 *   included. Options come in the order the dock and the question card
 *   show them (`displayedQuestionOptions`), so a learner's "2" means the
 *   card's option 2.
 * - `planSubmit` reads the lesson as `lh show` returns it and decides:
 *   refuse, report a repeat (the same answer already saved: a retried
 *   submit), or send one request to the page's own routes, POST /api/chat
 *   for an answer and POST /api/chats/<id>/dismiss for a skip, with the
 *   body the page sends. No server route of its own.
 *
 * scripts/lh.mjs is plain Node with no build step, so it loads this file
 * through tsx (`tsImport`), a dev dependency `npm ci` installs.
 */
import { buildAnswer, compactAnswerForModel, CONFIDENCE_STOPS, dismissedAnswer, normalizeOptions, normalizeQuizType, resolveCorrect, type AnswerRequest, type AskToolInput, type ExplainToolInput, type QuestionAnswerData, type QuestionData, type QuestionMode, type QuizToolInput } from "./question-core.ts";
import { displayedQuestionOptions } from "./question-card.ts";
import { QUESTION_TOOLS, toolQuestionKind } from "./pending.ts";
import { parseAskInput, parseExplainInput, parseQuizInput } from "./tool-parts.ts";

/** The dock's canonical QuestionData for a parsed question input. Quiz
 *  options are shuffled, seeded by the call id; ask options keep their
 *  authored order. The answer key rides along for grading, as on the page. */
export function questionDataOf(
	toolName: string,
	toolCallId: string,
	input: QuizToolInput | AskToolInput | ExplainToolInput,
): QuestionData {
	const kind = toolQuestionKind(toolName);
	const quizInput = kind === "quiz" ? (input as QuizToolInput) : null;
	const askInput = kind === "ask" ? (input as AskToolInput) : null;
	const explainInput = kind === "explain" ? (input as ExplainToolInput) : null;
	const multi = input instanceof Object && "multiSelect" in input ? input.multiSelect === true : false;
	const mode: QuestionMode =
		kind === "quiz"
			? multi
				? "multi-select"
				: "single-select"
			: askInput?.options?.length
				? multi
					? "multi-select"
					: "single-select"
				: "text";
	const options = normalizeOptions(
		(quizInput?.options ?? askInput?.options ?? []) as { label: string; value?: string }[],
	);
	// Fork (external-teacher 22): the shared order, so the question card
	// at /chat/<id>/card numbers options exactly as the dock shows them.
	const ordered = displayedQuestionOptions(kind, toolCallId, options);
	const q: QuestionData = {
		id: toolCallId,
		kind,
		// The role (owner 2026-10-03): predict questions gate by it in the
		// view (never collapsed) and the answered card tucks the explanation.
		questionType: kind === "quiz" ? normalizeQuizType((input as { type?: unknown }).type) : undefined,
		question: input.question,
		context: input.details,
		mode,
		options: ordered,
		createdAt: new Date().toISOString(),
	};
	if (quizInput) {
		const resolved = resolveCorrect(quizInput.correctAnswer, ordered);
		if (resolved.error) console.error("[quiz] correctAnswer did not resolve:", resolved.error);
		q.correctIndices = resolved.indices;
		q.explanation = quizInput.explanation;
	}
	if (explainInput) {
		// The commitment rides the question data (never sent to the
		// client before answering) and snapshots into the answer at submit.
		// One field, reasoning included — no separate explanation
		// (owner ruling 2026-09-27).
		q.committedAnswer = explainInput.correctAnswer;
	}
	return q;
}

/** What the learner said, as `lh submit` reads it. `picks` are option
 *  numbers, 1-based, in the order the card and the page show. */
export type SubmitInput =
	| { skip: true }
	| {
			skip?: false;
			picks?: number[];
			dontKnow?: boolean;
			confidence?: number;
			thinking?: string;
			text?: string;
			other?: string;
	  };

const ANSWER_FIELDS = ["picks", "dontKnow", "confidence", "thinking", "text", "other"] as const;

/* A skip is `{"skip":true}` and nothing else, in the same input as an
 * answer, never a flag beside it: an answer can then never turn into a
 * skip, and submit reads stdin exactly as the other JSON commands do. */

/** The JSON payload of `lh submit`, checked for shape only: field names
 *  and types. What fits the question is `planSubmit`'s job. */
export function parseSubmitPayload(raw: unknown): { ok: true; input: SubmitInput } | { ok: false; problems: string[] } {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, problems: ["the input must be a JSON object"] };
	const o = raw as Record<string, unknown>;
	if (Object.hasOwn(o, "skip")) {
		if (o.skip !== true) return { ok: false, problems: ["skip must be true"] };
		if (Object.keys(o).length > 1) return { ok: false, problems: [`a skip is {"skip":true} alone; drop ${Object.keys(o).filter((k) => k !== "skip").join(", ")}, or drop skip to save an answer`] };
		return { ok: true, input: { skip: true } };
	}
	const problems: string[] = [];
	for (const key of Object.keys(o)) {
		if (!(ANSWER_FIELDS as readonly string[]).includes(key)) problems.push(`unknown field "${key}"; fields: ${ANSWER_FIELDS.join(", ")}, or skip alone`);
	}
	if (o.picks !== undefined) {
		if (!Array.isArray(o.picks)) problems.push("picks must be an array of option numbers, e.g. [2]");
		else if (o.picks.some((p) => typeof p !== "number" || !Number.isInteger(p))) problems.push("every pick must be a whole option number, counted from 1 in the order the card shows");
	}
	if (o.dontKnow !== undefined && typeof o.dontKnow !== "boolean") problems.push("dontKnow must be true or false");
	if (o.confidence !== undefined && typeof o.confidence !== "number") problems.push(`confidence must be one of ${CONFIDENCE_STOPS.join(", ")}`);
	for (const key of ["thinking", "text", "other"] as const) {
		if (o[key] !== undefined && typeof o[key] !== "string") problems.push(`${key} must be a string`);
	}
	if (problems.length > 0) return { ok: false, problems };
	return { ok: true, input: o as SubmitInput };
}

/** One message of `lh show`'s `messages`, the fields this reads. */
type ShownMessage =
	| { id: string; role: "assistant"; calls?: { toolCallId: string; tool: string; input: unknown }[] }
	| { id: string; role: "toolResult"; toolCallId: string; tool: string; text: string }
	| { id: string; role: string };

/** The parts of `lh show`'s reply this reads. */
export interface ShowReply {
	messages: ShownMessage[];
	cursor: string;
	items?: unknown[];
}

export type SubmitPlan =
	| { action: "refuse"; reply: Record<string, unknown> }
	| { action: "repeat"; toolCallId: string }
	| { action: "send"; toolCallId: string; path: string; body: unknown };

const isQuestionTool = (tool: string) => (QUESTION_TOOLS as readonly string[]).includes(tool);

/** The question a submit at message `at` is about: the question call in
 *  the newest Bot Teacher message at or before `at`, open there or
 *  answered since. A bot message without a question call means the bot
 *  has moved on, and there is none. (While a question is open, the bot
 *  can post nothing else, so the question is always the newest bot
 *  message until the bot replies to its answer.) A cursor past the
 *  question's own answer still finds it, so a retry that took its cursor
 *  from a later reply is checked as a repeat too. */
function questionAt(messages: readonly ShownMessage[], at: number): { toolCallId: string; tool: string; input: unknown } | null {
	for (let i = at; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") continue;
		const calls = ("calls" in m && m.calls) || [];
		return calls.findLast((call) => isQuestionTool(call.tool)) ?? null;
	}
	return null;
}

/** The learner-side fields of an answer, as the model-facing compact form
 *  (compactAnswerForModel, the stored result's text) carries them. Two
 *  answers with the same fields are the same answer. */
function answerKey(compact: Record<string, unknown>): string {
	const answers = Array.isArray(compact.answers) ? compact.answers.map((a) => (a as { index?: unknown }).index) : [];
	return JSON.stringify([
		compact.dismissed === true,
		compact.dontKnow === true,
		answers,
		compact.text ?? null,
		compact.other ?? null,
		compact.thinking ?? null,
		compact.confidence ?? null,
	]);
}

function refuse(code: string, extra: Record<string, unknown>): SubmitPlan {
	return { action: "refuse", reply: { ok: false, code, ...extra } };
}

/** Problems with `input` for this question, checked the way the dock
 *  would: nothing reaches the page route that the page could not send,
 *  plus the learner's standing rule that a pick carries its confidence. */
function inputProblems(qd: QuestionData, tool: string, input: Exclude<SubmitInput, { skip: true }>): string[] {
	const problems: string[] = [];
	const n = qd.options.length;
	const picks = input.picks ?? [];
	const forbid = (field: keyof typeof input, why: string) => {
		if (input[field] !== undefined) problems.push(`${field} ${why}`);
	};
	if (qd.mode === "text") {
		for (const f of ["picks", "dontKnow", "confidence", "thinking", "other"] as const) forbid(f, `does not apply: ${tool} takes a typed answer in "text"`);
		if (!input.text?.trim()) problems.push(`${tool} needs the learner's typed answer in "text"`);
		return problems;
	}
	forbid("text", `does not apply: ${tool} takes picks; reasoning goes in "thinking"`);
	if (picks.length > 0 && n === 0) problems.push("the question has no options to pick");
	for (const p of picks) {
		if (p < 1 || p > n) problems.push(`pick ${p} is not an option number; the card shows options 1 to ${n}`);
	}
	if (new Set(picks).size !== picks.length) problems.push("a pick appears twice");
	if (qd.mode === "single-select" && picks.length > 1) problems.push("this question takes one pick");
	if (qd.kind === "quiz") {
		forbid("other", "does not apply: only an ask takes Other");
		if (input.dontKnow) {
			if (picks.length > 0) problems.push(`"I don't know" takes no picks`);
			forbid("confidence", `does not apply to "I don't know"`);
		} else {
			if (picks.length === 0) problems.push(`pick an option, or send "dontKnow": true`);
			if (input.confidence === undefined) problems.push(`a pick needs the learner's confidence (one of ${CONFIDENCE_STOPS.join(", ")}); ask for it before you say whether the pick is right`);
			else if (!CONFIDENCE_STOPS.includes(input.confidence)) problems.push(`confidence must be one of ${CONFIDENCE_STOPS.join(", ")}`);
		}
	} else {
		forbid("dontKnow", `does not apply: only probe and quiz offer "I don't know"`);
		forbid("confidence", "does not apply: only probe and quiz take a confidence");
		if (picks.length === 0 && !input.other?.trim()) problems.push(`pick an option, or give the learner's own answer in "other"`);
		// The dock's single-select displaces: a pick and Other never ride together.
		if (qd.mode === "single-select" && picks.length > 0 && input.other?.trim()) problems.push(`this question takes a pick or "other", not both`);
	}
	return problems;
}

/** What `lh submit <lesson> --after <after>` does, given the lesson as
 *  `lh show` returned it. `after` must be the lesson's cursor (the
 *  learner added nothing the bot has not read), and a question must have
 *  been open there. When that question already has a result, the submit
 *  is a repeat if the saved answer is this one, else a refusal. */
export function planSubmit(lessonId: string, show: ShowReply, after: string, input: SubmitInput): SubmitPlan {
	const { messages, cursor } = show;
	const items = show.items ?? [];
	// The lesson id is the cursor of an empty lesson: before every message.
	const at = after === lessonId ? -1 : messages.findIndex((m) => m.id === after);
	if (at < 0 && after !== lessonId) return refuse("bad_after", { error: "--after is not a message in this lesson; use the cursor of your latest reply", cursor, items });
	const call = questionAt(messages, at);
	if (!call) return refuse("no_open_question", { error: "no question was open at --after", cursor, items });
	const kind = toolQuestionKind(call.tool);
	const parsed = kind === "quiz" ? parseQuizInput(call.input) : kind === "explain" ? parseExplainInput(call.input) : parseAskInput(call.input);
	if (!parsed) return refuse("invalid", { problems: ["the open question's input does not parse; the page shows it as malformed"], cursor, items });
	const qd = questionDataOf(call.tool, call.toolCallId, parsed);
	const shown = qd.mode === "text" ? [] : qd.options.map((o, i) => ({ number: i + 1, label: o.label }));
	const result = messages.find((m): m is Extract<ShownMessage, { role: "toolResult" }> => m.role === "toolResult" && "toolCallId" in m && m.toolCallId === call.toolCallId);
	// Whether the question is still open comes before what the answer
	// says: a refusal must name the question the card shows now.
	// The bot has posted since --after (the next question, or its reply
	// to this answer): the cursor is stale, and this question is behind it.
	if (result && messages.slice(at + 1).some((m) => m.role === "assistant")) return refuse("no_open_question", { error: "you posted after --after, so its question is closed; use the cursor from your latest reply", cursor, items });
	if (!result && cursor !== after) return refuse("unread_input", { error: "the learner added input after --after; read items, then submit with the new cursor", cursor, items });
	let saved: Record<string, unknown> = {};
	if (result) {
		try {
			saved = JSON.parse(result.text) as Record<string, unknown>;
		} catch {
			// unreadable: never equal, so refused below
		}
	}
	const answered = () => refuse("answered", { error: "the question already has a different answer or skip, shown in saved", toolCallId: call.toolCallId, saved, cursor, items });
	let answer: QuestionAnswerData;
	if (input.skip) {
		// The page's skip: the raw stored question text (chat.tsx).
		answer = dismissedAnswer(kind, (call.input as { question?: string } | null)?.question ?? "");
	} else {
		const problems = inputProblems(qd, call.tool, input);
		// An answer the page could not send is never the saved one.
		if (problems.length > 0) return result ? answered() : refuse("invalid", { problems, options: shown, cursor, items });
		// The dock's AnswerRequest: values by the shown order, thinking
		// only beside picks, confidence only on quiz kinds.
		const req: AnswerRequest = {
			dontKnow: input.dontKnow === true,
			values: (input.picks ?? []).map((p) => qd.options[p - 1]!.value),
			other: input.other,
			text: input.text,
			thinking: input.thinking?.trim() || undefined,
			confidence: kind === "quiz" ? input.confidence : undefined,
		};
		answer = buildAnswer(qd, req, call.tool);
	}
	if (result) return answerKey(saved) === answerKey(compactAnswerForModel(answer)) ? { action: "repeat", toolCallId: call.toolCallId } : answered();
	if (input.skip) {
		return { action: "send", toolCallId: call.toolCallId, path: `/api/chats/${encodeURIComponent(lessonId)}/dismiss`, body: { input: { type: "dismiss", toolCallId: call.toolCallId, answer } } };
	}
	return { action: "send", toolCallId: call.toolCallId, path: "/api/chat", body: { chatId: lessonId, input: { type: "answer", toolCallId: call.toolCallId, answer } } };
}
