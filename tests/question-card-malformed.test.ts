/**
 * The card's "arrived malformed" state (fork, external-teacher ticket 27).
 * Since upstream 0.4.1 the page's open question is only an answerable one;
 * a question whose input does not parse shows the page's malformed box.
 * The card must show its malformed state for the same record, not "No
 * open question", with the same teaching it showed before the merge.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { questionCardOf } = await import("../src/core/question-card.ts");
const { malformedQuestionsOf, newUserMessage } = await import("../src/core/native-messages.ts");

function assistant(id: string, content: unknown[], stopReason = "toolUse") {
	return { id, role: "assistant", content, stopReason, timestamp: 0 };
}
const incompleteQuiz = (id: string) => ({ type: "toolCall", id, name: "quiz", arguments: { question: "Q?" } });
const card = (messages: unknown[]) => {
	const c = questionCardOf(messages as never[]);
	return { teaching: c.teaching, question: c.question, malformed: c.malformed };
};

describe("question card: a malformed open question", () => {
	it("is malformed, as the page shows it, with its lead-in not repeated as teaching", () => {
		const messages = [newUserMessage("Teach me"), assistant("a1", [{ type: "text", text: "Let's check the idea." }, incompleteQuiz("q1")])];
		assert.equal(malformedQuestionsOf(messages as never[]).length, 1, "the page shows its malformed box");
		assert.deepEqual(card(messages), { teaching: null, question: null, malformed: true });
	});

	it("keeps the latest teaching from an earlier message", () => {
		const messages = [
			newUserMessage("Teach me"),
			assistant("a0", [{ type: "text", text: "Halving is division." }], "stop"),
			assistant("a2", [incompleteQuiz("q2")]),
		];
		assert.deepEqual(card(messages), { teaching: "Halving is division.", question: null, malformed: true });
	});

	it("is not malformed once the learner moved on", () => {
		const messages = [newUserMessage("Teach me"), assistant("a1", [incompleteQuiz("q1")]), assistant("a3", [{ type: "text", text: "Next." }], "stop")];
		assert.deepEqual(card(messages), { teaching: "Next.", question: null, malformed: false });
	});
});
