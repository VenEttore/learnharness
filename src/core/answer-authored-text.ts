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
 * rows. Anything else keeps its rows and picks exactly as sent. Refusing
 * malformed answers belongs to the sender (ticket 21's `lh submit`); this
 * guard only has to restore text and never make a request worse.
 *
 * Upstream's answerForPresentation (answer-presentation.ts) binds rows for
 * display only; this guard binds them for the stored record, so it keeps
 * its own copy rather than editing that upstream file. */
import { normalizeOptions, type QuestionAnswerData, type QuizOption } from "./question-core.ts";
import { toolQuestionKind } from "./pending.ts";
import { parseAskInput, parseExplainInput, parseQuizInput } from "./tool-parts.ts";

type Row = { index: number; label: string };
type SentPick = { index: number; label: string; value?: string };

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

	// The page's answer takes the question from the parsed call (the dock
	// mounts with it); its skip copies the raw call's question.
	const rawQuestion = isObject(question.input) ? question.input.question : undefined;
	const questionText = !answer.dismissed ? source.question : typeof rawQuestion === "string" ? rawQuestion : answer.questionText;
	const out: QuestionAnswerData = { ...answer, questionText };
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
	// A shell form this guard does not model (`$*`, `$$`, `${x}`, a backtick)
	// leaves no telling what bash made of any of the call's text: its result
	// could look like another option's, verbatim or mangled. Rows and picks
	// then stay as sent.
	if (authored.some((o) => UNMODELED.test(o.label) || UNMODELED.test(o.value))) return out;
	const picks = answer.answers as SentPick[];

	// Each pick's value names its option; each row's label names its own.
	// Lookups go through an index built once, so the cost stays linear in
	// the options (a quiz has no upper bound on them).
	const byValue = textIndex(authored.map((o) => o.value), authored);
	const byLabel = textIndex(authored.map((o) => o.label), authored);
	const labelForms = new Map(authored.map((o) => [o, formsOf(o.label)]));
	const optionsFor = (label: string) => byLabel.get(label.trim()) ?? [];
	const labelFits = (label: string, o: QuizOption) => labelForms.get(o)!.has(label.trim());
	// A pick's sent label outranks its value. A value can be changed on the
	// way in a form this guard does not model (bench 2: a set `$USER` turned
	// Alice's value into Bob's), so when the label names options (in any
	// modeled form) and the value's option is not among them, the pick stays
	// as sent and its value proves nothing about its row.
	const labelAllows = (label: string, o: QuizOption) => optionsFor(label).length === 0 || labelFits(label, o);
	const pickOption = picks.map((a) => {
		const named = a.value === undefined ? [] : byValue.get(a.value.trim()) ?? [];
		const option = named.length === 1 ? named[0] : undefined;
		return option && labelAllows(a.label, option) ? option : undefined;
	});
	const rowOption = bindRows(rows, picks, pickOption, optionsFor, labelFits);
	out.options = rows.map((row, i) => (rowOption[i] ? { ...row, label: rowOption[i]!.label } : row));
	// A hand-built pick may lack its value; it stays without one.
	// A pick falls back to its row's option only when its own value, if it
	// has one, could be that option.
	const valueFits = (value: string | undefined, o: QuizOption) => value === undefined || (byValue.get(value.trim()) ?? []).includes(o);
	out.answers = picks.map((a, i) => {
		const row = rowOption[a.index - 1];
		const option = pickOption[i] ?? (row && valueFits(a.value, row) ? row : undefined);
		return option && labelAllows(a.label, option) ? { ...a, label: option.label } : a;
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
 *  cannot be, and once every other option it names is claimed elsewhere,
 *  it names the one left. A binding is kept only when it is unique both
 *  ways (one option per row, one row per option). */
function bindRows(
	rows: Row[],
	picks: SentPick[],
	pickOption: (QuizOption | undefined)[],
	optionsFor: (label: string) => QuizOption[],
	labelFits: (label: string, option: QuizOption) => boolean,
): (QuizOption | undefined)[] {
	const claims = rows.map(() => new Set<QuizOption>());
	picks.forEach((a, i) => {
		if (pickOption[i]) claims[a.index - 1]!.add(pickOption[i]!);
	});
	const possible = rows.map((row) => optionsFor(row.label));
	possible.forEach((options, i) => {
		if (options.length === 1) claims[i]!.add(options[0]!);
	});
	const claimants = new Map<QuizOption, number>();
	for (const set of claims) for (const option of set) claimants.set(option, (claimants.get(option) ?? 0) + 1);
	const bound = claims.map((set, i) => {
		if (set.size !== 1) return undefined;
		const option = [...set][0]!;
		if (possible[i]!.length > 0 && !labelFits(rows[i]!.label, option)) return undefined; // the row's label says otherwise
		return claimants.get(option) === 1 ? option : undefined;
	});
	// Labels are compared trimmed here too, like every other lookup.
	// Rows with no claim whose label names several options: drop the options
	// bound to other rows; one left, and claimed by no other row, is that
	// row's. Only bindings count as settled: a claim the binding rejected
	// (say a pick value that contradicts its row's label) proves nothing.
	// One pass, so the cost stays linear. Two such rows with the same label
	// would be left with the same option and contradict each other, so a
	// shared label settles nothing; that also bounds the work (each option
	// has at most three forms, so at most three distinct labels name it).
	// Two rows left with the same option bind neither.
	const open = possible.map((options, i) => !bound[i] && claims[i]!.size === 0 && options.length > 1);
	const openLabels = new Map<string, number>();
	rows.forEach((row, i) => {
		if (open[i]) openLabels.set(row.label.trim(), (openLabels.get(row.label.trim()) ?? 0) + 1);
	});
	const settled = new Set(bound.filter((o) => o !== undefined));
	const deduced = new Map<QuizOption, number[]>();
	possible.forEach((options, i) => {
		if (!open[i] || openLabels.get(rows[i]!.label.trim())! > 1) return;
		const left = options.filter((o) => !settled.has(o));
		if (left.length === 1 && !claimants.has(left[0]!)) deduced.set(left[0]!, [...(deduced.get(left[0]!) ?? []), i]);
	});
	for (const [option, at] of deduced) if (at.length === 1) bound[at[0]!] = option;
	return bound;
}

/** The forms an option's text can reach the server in: as authored, and
 *  what a bot's JSON body makes of it inside a double-quoted shell string.
 *  There bash expands every `$name` and `$1`..`$9` (unset: to nothing). If
 *  the bot escaped only the quotes, bash also turns the JSON's `\\` into
 *  `\`, so JSON then reads the authored TeX `\frac` as a form feed and
 *  `rac`, `\times` as a tab and `imes`; if it doubled the backslashes too,
 *  they survive and only the `$name`s go. All are trimmed: the page trims
 *  (normalizeOptions), a bot copying the call may keep its edge spaces.
 *  Every lookup compares against these forms, so text that is a form of two
 *  options names neither. */
function formsOf(text: string): Set<string> {
	const unset = withoutVariables(text);
	return new Set([text.trim(), unset.trim(), decodeEscapes(unset).trim()]);
}

/** Sent text (trimmed) -> the options one of whose forms it is. */
function textIndex(texts: string[], options: QuizOption[]): Map<string, QuizOption[]> {
	const index = new Map<string, QuizOption[]>();
	texts.forEach((text, i) => {
		for (const form of formsOf(text)) {
			const named = index.get(form);
			if (named) named.push(options[i]!);
			else index.set(form, [options[i]!]);
		}
	});
	return index;
}

const JSON_ESCAPES: Record<string, string> = { "\"": "\"", "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/** `$` forms bash expands that formsOf does not model (`$[..]` is
 *  bash's old arithmetic form; bash always sets `$_` and `$0`), and
 *  backticks (command substitution). Any other `$` is either modeled or
 *  literal. */
const UNMODELED = /\$[{([*@#?$!0-]|\$_(?![A-Za-z0-9_])|`/;

function withoutVariables(text: string): string {
	return text.replace(/\$(?:[A-Za-z_][A-Za-z0-9_]*|[1-9])/g, "");
}

function decodeEscapes(text: string): string {
	return text.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_, e: string) =>
		e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : JSON_ESCAPES[e]!);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
