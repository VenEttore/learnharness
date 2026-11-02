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
 * content names exactly one option that no other row claims.
 *
 * Rows and picks are touched only when the request is shaped like the
 * page's: one row per option, indexed 1..n, and picks pointing at those
 * rows. Anything else keeps its rows and picks exactly as sent. Ticket 21's
 * `lh submit` is the boundary that refuses malformed answers; this guard
 * only has to restore text and never make a request worse. */
import { normalizeOptions, type QuestionAnswerData, type QuizOption } from "./question-core.ts";
import { toolQuestionKind } from "./pending.ts";
import { parseAskInput, parseExplainInput, parseQuizInput } from "./tool-parts.ts";

type Row = { index: number; label: string };
type Pick = { index: number; label: string; value?: string };

export function withAuthoredText(
	answer: QuestionAnswerData,
	question: { tool: string; input: unknown },
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
	// The parsers refuse duplicate values, so this cannot throw.
	const authored = normalizeOptions(options);
	const rows = pageShaped(answer, authored.length);
	if (!rows) return out;
	const picks = answer.answers as Pick[];

	// Each pick's value names its option; each row's label names its own.
	const pickOption = picks.map((a) => (a.value === undefined ? undefined : only(authored, (o) => names(a.value!, o.value))));
	const rowOption = bindRows(rows, picks, pickOption, authored);
	out.options = rows.map((row, i) => (rowOption[i] ? { ...row, label: rowOption[i]!.label } : row));
	// A hand-built pick may lack its value; it stays without one.
	out.answers = picks.map((a, i) => {
		const option = pickOption[i] ?? rowOption[a.index - 1];
		return option ? { ...a, label: option.label } : a;
	}) as QuestionAnswerData["answers"];
	return out;
}

/** The request's rows when it is shaped like the page's answer: n rows
 *  with string labels and the indexes 1..n each once, in order, and picks
 *  whose index names one of them and whose value, if any, is a string. */
function pageShaped(answer: QuestionAnswerData, n: number): Row[] | undefined {
	const rows: unknown = answer.options;
	const picks: unknown = answer.answers;
	if (!Array.isArray(rows) || rows.length !== n || !Array.isArray(picks)) return undefined;
	const row = (r: unknown, i: number) => isObject(r) && r.index === i + 1 && typeof r.label === "string";
	const pick = (a: unknown) =>
		isObject(a) && Number.isInteger(a.index) && (a.index as number) >= 1 && (a.index as number) <= n &&
		typeof a.label === "string" && (a.value === undefined || typeof a.value === "string");
	return rows.every(row) && picks.every(pick) ? (rows as Row[]) : undefined;
}

/** Row position -> the option that row shows, where its content settles
 *  it. A pick's value claims the row it points at; a row's label claims its
 *  option when it names just one. A label that names several (`$n$` and
 *  `$k$` both arrive as `$`) claims nothing but still rules out options it
 *  cannot be. A binding is kept only when it is unique both ways (one
 *  option per row, one row per option). */
function bindRows(rows: Row[], picks: Pick[], pickOption: (QuizOption | undefined)[], authored: QuizOption[]): (QuizOption | undefined)[] {
	const claims = rows.map(() => new Set<QuizOption>());
	picks.forEach((a, i) => {
		if (pickOption[i]) claims[a.index - 1]!.add(pickOption[i]!);
	});
	const possible = rows.map((row) => authored.filter((o) => names(row.label, o.label)));
	possible.forEach((named, i) => {
		if (named.length === 1) claims[i]!.add(named[0]!);
	});
	const claimants = new Map<QuizOption, number>();
	for (const set of claims) for (const option of set) claimants.set(option, (claimants.get(option) ?? 0) + 1);
	return claims.map((set, i) => {
		if (set.size !== 1) return undefined;
		const option = [...set][0]!;
		if (possible[i]!.length > 0 && !possible[i]!.includes(option)) return undefined; // the row's label says otherwise
		return claimants.get(option) === 1 ? option : undefined;
	});
}

/** Does `sent` name `authored`: the same text, or what a bot's JSON body
 *  makes of it inside a double-quoted shell string? There bash expands every
 *  `$name` and `$1`..`$9` (unset: to nothing) and turns the JSON's `\\` into
 *  `\`, so JSON then reads the authored TeX `\frac` as a form feed and
 *  `rac`, `\times` as a tab and `imes`. */
function names(sent: string, authored: string): boolean {
	return sent === authored || sent === throughShell(authored);
}

const JSON_ESCAPES: Record<string, string> = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

function throughShell(authored: string): string {
	return authored
		.replace(/\$(?:[A-Za-z_][A-Za-z0-9_]*|[1-9])/g, "")
		.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_, e: string) =>
			e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : JSON_ESCAPES[e]!);
}

function only<T>(list: T[], test: (item: T) => boolean): T | undefined {
	const hits = list.filter(test);
	return hits.length === 1 ? hits[0] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
