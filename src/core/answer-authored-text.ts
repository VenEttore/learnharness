/** The answer boundary's text guard (fork; external-teacher ticket 20).
 *
 * An answer request carries its own copy of the question's text: the
 * question, the option labels, the quiz explanation and the explain
 * commitment. The page copies them from the call, but a hand-built request
 * can arrive changed. On ticket 15's bench a bot built one in a
 * double-quoted shell string, bash expanded `$n` to nothing, and
 * `$n/2^k$` was stored as `/2^k$`. The call is the authority for that
 * text, so it is taken from the call here, before the record is written.
 *
 * Only the model's text changes. The learner's part (picks and their
 * indices and values, the grade, confidence, thinking, typed text) stays as
 * the request sent it.
 *
 * Option rows carry no identity, and a hand-built request may list them in
 * any order (the bot's own widget, not the page's shuffle). So a row is
 * never placed by order: it gets an option's label only when its own
 * content names exactly one option that no other row claims. */
import { normalizeOptions, type QuestionAnswerData, type QuizOption } from "./question-core.ts";
import { toolQuestionKind } from "./pending.ts";
import { parseAskInput, parseExplainInput, parseQuizInput } from "./tool-parts.ts";

export function withAuthoredText(
	answer: QuestionAnswerData,
	question: { toolCallId: string; tool: string; input: unknown },
): QuestionAnswerData {
	const kind = toolQuestionKind(question.tool);
	const quiz = kind === "quiz" ? parseQuizInput(question.input) : undefined;
	const explain = kind === "explain" ? parseExplainInput(question.input) : undefined;
	const ask = kind === "ask" ? parseAskInput(question.input) : undefined;
	const source = quiz ?? explain ?? ask;
	if (!source) return answer;

	const out: QuestionAnswerData = { ...answer, questionText: source.question };
	// The page's answers always carry these (buildAnswer); its skips are the
	// minimal record (dismissedAnswer) and stay minimal.
	if (!answer.dismissed && quiz) out.explanation = quiz.explanation;
	if (!answer.dismissed && explain) out.committed = explain.correctAnswer;

	const options = quiz?.options ?? ask?.options;
	if (!options?.length) return out;
	let authored: QuizOption[];
	try {
		authored = normalizeOptions(options);
	} catch {
		return out; // duplicate values: the call could not have been posed
	}

	const picks = Array.isArray(answer.answers) ? answer.answers : [];
	const rows = Array.isArray(answer.options) ? answer.options : [];
	// Each pick's value names its option; each row's label names its own.
	const pickOption = picks.map((a) => (isRow(a) && typeof a.value === "string" ? only(authored, (o) => names(a.value as string, o.value)) : undefined));
	const rowOption = bindRows(rows, picks, pickOption, authored);

	if (Array.isArray(answer.answers)) {
		out.answers = answer.answers.map((a, i) => {
			if (!isRow(a)) return a;
			const option = pickOption[i] ?? rowOption.get(a.index);
			return option ? { ...a, label: option.label } : a;
		});
	}
	if (Array.isArray(answer.options)) {
		out.options = answer.options.map((row) => {
			const option = isRow(row) ? rowOption.get(row.index) : undefined;
			return option ? { ...row, label: option.label } : row;
		});
	}
	return out;
}

/** Row index -> the option that row shows, for rows whose content settles
 *  it: a pick's value at that index, else the row's label. A binding is
 *  kept only when it is unique both ways (one option per row, one row per
 *  option); anything else stays as sent. */
function bindRows(rows: unknown[], picks: unknown[], pickOption: (QuizOption | undefined)[], authored: QuizOption[]): Map<number, QuizOption> {
	const claims = new Map<number, Set<QuizOption>>();
	const ambiguous = new Set<number>();
	const claim = (index: number, option: QuizOption) => {
		const set = claims.get(index) ?? new Set<QuizOption>();
		set.add(option);
		claims.set(index, set);
	};
	picks.forEach((a, i) => {
		if (isRow(a) && pickOption[i]) claim(a.index, pickOption[i]!);
	});
	for (const row of rows) {
		if (!isRow(row) || typeof row.label !== "string") continue;
		const option = only(authored, (o) => names(row.label, o.label));
		if (option) claim(row.index, option);
		else if (authored.some((o) => names(row.label, o.label))) ambiguous.add(row.index); // `$n$`, `$k$` -> `$`
	}
	const bound = new Map<number, QuizOption>();
	for (const [index, set] of claims) {
		if (set.size !== 1 || ambiguous.has(index)) continue;
		const option = [...set][0]!;
		const rivals = [...claims].filter(([other, s]) => other !== index && s.has(option));
		if (rivals.length === 0) bound.set(index, option);
	}
	return bound;
}

/** Does `sent` name `authored`: the same text, or the text a double-quoted
 *  shell string makes of it, with every `$name` and `$1`..`$9` gone (unset
 *  variables expand to nothing)? */
function names(sent: string, authored: string): boolean {
	return sent === authored || sent === authored.replace(/\$(?:[A-Za-z_][A-Za-z0-9_]*|[1-9])/g, "");
}

function only<T>(list: T[], test: (item: T) => boolean): T | undefined {
	const hits = list.filter(test);
	return hits.length === 1 ? hits[0] : undefined;
}

/** A hand-built request's entries are not checked anywhere else. */
function isRow(row: unknown): row is { index: number; label: string; value?: unknown } {
	return typeof row === "object" && row !== null && Number.isInteger((row as { index?: unknown }).index);
}
