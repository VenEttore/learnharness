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
 * the request sent it. */
import { normalizeOptions, seededRandom, shuffleOptions, type QuestionAnswerData, type QuizOption } from "./question-core.ts";
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
	if (quiz && answer.explanation !== undefined) out.explanation = quiz.explanation;
	if (explain && answer.committed !== undefined) out.committed = explain.correctAnswer;

	const options = quiz?.options ?? ask?.options;
	if (!options?.length) return out;
	let authored: QuizOption[];
	try {
		authored = normalizeOptions(options);
	} catch {
		return out; // duplicate values: the call could not have been posed
	}
	// The dock shows a quiz in a shuffle seeded by the call id; a hand-built
	// request may use the authored order instead.
	const orders = quiz ? [shuffleOptions(authored, seededRandom(question.toolCallId)), authored] : [authored];
	const order = orders.find((o) => fits(o, answer, authored));
	const byValue = new Map(authored.map((o) => [o.value, o.label]));

	if (Array.isArray(answer.answers)) {
		out.answers = answer.answers.map((a) => {
			const label = (a.value !== undefined ? byValue.get(a.value) : undefined) ?? order?.[a.index - 1]?.label;
			return label === undefined ? a : { ...a, label };
		});
	}
	if (order && Array.isArray(answer.options)) {
		out.options = answer.options.map((row) => {
			const label = order[row.index - 1]?.label;
			return label === undefined ? row : { ...row, label };
		});
	}
	return out;
}

/** Does `order` agree with what the request already proves: each pick's
 *  value sits at its index, and each row whose label is an authored label
 *  unchanged sits where that label does? Rows past the order (a
 *  hand-added "I don't know") prove nothing. */
function fits(order: QuizOption[], answer: QuestionAnswerData, authored: QuizOption[]): boolean {
	const labels = new Set(authored.map((o) => o.label));
	const picks = Array.isArray(answer.answers) ? answer.answers : [];
	const rows = Array.isArray(answer.options) ? answer.options : [];
	return (
		picks.every((a) => a.value === undefined || order[a.index - 1] === undefined || order[a.index - 1]!.value === a.value) &&
		rows.every((r) => !labels.has(r.label) || order[r.index - 1] === undefined || order[r.index - 1]!.label === r.label)
	);
}
