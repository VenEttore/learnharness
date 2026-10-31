/**
 * TEACHING QUESTIONS (fork, ADR 0001; external-teacher ticket 12): a Bot
 * Teacher teaches with `quiz` (predict and check) and `explain` (free
 * recall), each tagged with a plan node. Driven through the turn, show,
 * dismiss and answer routes under an isolated LH_DATA_DIR; asserts the
 * replies the bot reads and the record the page reads: the open question
 * the dock parses, the phase, and the teaching progress on the plan map
 * (derivePlanStatuses over projectView, as the plan popup derives it).
 * Every app-module import is dynamic: the seam must be set before
 * config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-teaching-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const dismissRoute = await import("../app/api/chats/[id]/dismiss/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { pendingQuestionOf } = await import("../src/core/native-messages.ts");
const { projectView } = await import("../src/core/view.ts");
const { latestTree } = await import("../components/plan-block.tsx");
const { derivePlanStatuses } = await import("../src/core/contracts/plan.ts");
const { parseExplainInput, parseQuizInput } = await import("../src/core/tool-parts.ts");
const { dismissedAnswer } = await import("../src/core/question-core.ts");
const { planNodeProblem } = await import("../src/core/teaching-tool-results.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response): Promise<{ status: number; body: Json }> {
	return { status: res.status, body: (await res.json()) as Json };
}

function postJson(url: string, body: unknown): Request {
	return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const turn = async (id: string, body: unknown) => json(await turnRoute.POST(postJson(`http://test/api/external/chats/${id}/turn`, body), ctx(id)));
const show = async (id: string) => json(await showRoute.GET(new Request(`http://test/api/external/chats/${id}`), ctx(id)));

const ASSESSMENT = {
	assessment: {
		strands: [{ strand: "conditional probability", assessment: "Floor: reads P(A|B). Ceiling: confuses it with P(B|A)." }],
		summary: "Wants intuition; start from base rates.",
	},
};

const PLAN = "graph TD\n  base-rates[Base rates] --> conditional[Conditional probability] --> bayes[Bayes' rule]";
const REWRITE = "graph LR\n  base-rates[Base rates] --> bayes[Bayes' rule]\n  likelihood[Likelihood] --> bayes";

const QUIZ = {
	type: "predict",
	nodeId: "base-rates",
	question: "1% of people have the disease. Of 1000 people, about how many have it?",
	options: [
		{ label: "10", value: "ten" },
		{ label: "100", value: "hundred" },
	],
	explanation: "1% of 1000 is 10.",
	correctAnswer: "ten",
};
const EXPLAIN = {
	type: "check",
	nodeId: "conditional",
	question: "In your own words, what does P(A|B) mean?",
	correctAnswer: "The chance of A among only the cases where B holds.",
};

let keys = 0;
/** A lesson past probe-done: the phase reads plan. */
async function planningLesson(): Promise<{ id: string; cursor: string }> {
	const created = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Teach", key: `teach-${++keys}`, prompt: "Teach me Bayes" })));
	const done = await turn(created.body.id, { kind: "probe-done", after: created.body.cursor, ...ASSESSMENT });
	assert.equal(done.status, 200);
	return { id: created.body.id, cursor: done.body.cursor };
}

/** A lesson with PLAN posted: still the plan phase. */
async function plannedLesson(): Promise<{ id: string; cursor: string }> {
	const { id, cursor } = await planningLesson();
	const planned = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
	assert.equal(planned.status, 200);
	return { id, cursor: planned.body.cursor };
}

const messages = (id: string) => chatStore.getChat(id)!.messages;
/** The teaching progress the plan popup draws: statuses over the page's view. */
function mapProgress(id: string): { current: string | null; visited: string[] } {
	const view = projectView(messages(id)) as any;
	const statuses = derivePlanStatuses(latestTree(view)!, view);
	return { current: statuses.current, visited: [...statuses.visited] };
}

/** The learner pressing Skip on the page. */
async function learnerSkips(chatId: string, toolCallId: string, kind: "quiz" | "explain", question: string): Promise<string> {
	const res = await dismissRoute.POST(postJson(`http://test/api/chats/${chatId}/dismiss`, { input: { type: "dismiss", toolCallId, answer: dismissedAnswer(kind, question) } }), ctx(chatId));
	assert.equal(res.status, 200);
	return messages(chatId).at(-1)!.id;
}

const withoutNodeId = ({ nodeId: _nodeId, ...rest }: Record<string, unknown>) => rest;

describe("teaching questions the page can show", () => {
	for (const [kind, payload, parse] of [
		["quiz", QUIZ, parseQuizInput],
		["explain", EXPLAIN, parseExplainInput],
	] as const) {
		it(`${kind} saves a tagged ${kind} call that is the open question; the phase turns teach and the map marks the node`, async () => {
			const { id, cursor } = await plannedLesson();
			const before = messages(id).length;
			assert.equal(phaseAt3Lh(messages(id)), "plan");

			const res = await turn(id, { kind, after: cursor, ...payload });
			assert.equal(res.status, 200, JSON.stringify(res.body));
			assert.equal(res.body.ok, true);
			const added = messages(id).slice(before);
			assert.equal(added.length, 1);
			assert.equal(res.body.cursor, added[0]!.id);

			const open = pendingQuestionOf(messages(id))!;
			assert.equal(open.tool, kind);
			assert.deepEqual(open.input, payload);
			// The dock's display parse drops nodeId, as it does for the model's calls.
			assert.deepEqual(parse(open.input), withoutNodeId(payload), "the dock parses the call");

			assert.equal(phaseAt3Lh(messages(id)), "teach");
			assert.equal((await show(id)).body.phase, "teach");
			assert.deepEqual(mapProgress(id), { current: payload.nodeId, visited: [] });
		});
	}

	it("puts lead-in text in the same assistant message, ahead of the call", async () => {
		const { id, cursor } = await plannedLesson();
		const res = await turn(id, { kind: "quiz", after: cursor, text: "Start with a guess.\n", ...QUIZ });
		assert.equal(res.status, 200);
		const content = (messages(id).at(-1) as any).content;
		assert.equal(content.length, 2);
		assert.deepEqual(content[0], { type: "text", text: "Start with a guess." });
		assert.equal(content[1].type, "toolCall");
		assert.deepEqual(content[1].arguments, QUIZ);
	});

	it("a question on the next node moves the map: the earlier node reads visited", async () => {
		const { id, cursor } = await plannedLesson();
		await turn(id, { kind: "quiz", after: cursor, ...QUIZ });
		const skipped = await learnerSkips(id, pendingQuestionOf(messages(id))!.toolCallId, "quiz", QUIZ.question);
		const res = await turn(id, { kind: "explain", after: skipped, ...EXPLAIN });
		assert.equal(res.status, 200, JSON.stringify(res.body));
		assert.deepEqual(mapProgress(id), { current: "conditional", visited: ["base-rates"] });
	});

	it("a plan rewrite in the teach phase is accepted, and later questions check against the new plan", async () => {
		const { id, cursor } = await plannedLesson();
		await turn(id, { kind: "quiz", after: cursor, ...QUIZ });
		const skipped = await learnerSkips(id, pendingQuestionOf(messages(id))!.toolCallId, "quiz", QUIZ.question);
		const rewrite = await turn(id, { kind: "plan", after: skipped, mermaid: REWRITE });
		assert.equal(rewrite.status, 200, JSON.stringify(rewrite.body));
		assert.equal(phaseAt3Lh(messages(id)), "teach");

		// "conditional" was dropped by the rewrite; "likelihood" is new.
		const dropped = await turn(id, { kind: "explain", after: rewrite.body.cursor, ...EXPLAIN });
		assert.equal(dropped.status, 422);
		assert.deepEqual(dropped.body.problems, [planNodeProblem(latestTree(projectView(messages(id)) as any)!, "conditional")]);
		const added = await turn(id, { kind: "explain", after: rewrite.body.cursor, ...EXPLAIN, nodeId: "likelihood" });
		assert.equal(added.status, 200, JSON.stringify(added.body));
		assert.equal(mapProgress(id).current, "likelihood");
	});

	it("allows say, ask, plan, quiz and explain in the teach phase; probe and recall are refused there", async () => {
		const { id, cursor } = await plannedLesson();
		await turn(id, { kind: "quiz", after: cursor, ...QUIZ });
		const skipped = await learnerSkips(id, pendingQuestionOf(messages(id))!.toolCallId, "quiz", QUIZ.question);
		const res = await turn(id, { kind: "recall", after: skipped, question: "Q?", correctAnswer: "A." });
		assert.equal(res.status, 409);
		assert.deepEqual(res.body, { ok: false, code: "wrong_phase", phase: "teach", allowed: ["say", "ask", "plan", "quiz", "explain"], cursor: skipped });
	});

	it("a rerun with the same after is a repeat and saves nothing", async () => {
		const { id, cursor } = await plannedLesson();
		await turn(id, { kind: "explain", after: cursor, ...EXPLAIN });
		const count = messages(id).length;
		const again = await turn(id, { kind: "explain", after: cursor, ...EXPLAIN });
		assert.equal(again.status, 200);
		assert.equal(again.body.repeat, true);
		assert.equal(messages(id).length, count);
	});
});

describe("teaching question refusals save nothing", () => {
	for (const [kind, payload] of [
		["quiz", QUIZ],
		["explain", EXPLAIN],
	] as const) {
		it(`${kind} before probe-done is wrong_phase, with the kinds allowed`, async () => {
			const created = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Early", key: `teach-${++keys}` })));
			const { status, body } = await turn(created.body.id, { kind, after: created.body.cursor, ...payload });
			assert.equal(status, 409);
			assert.deepEqual(body, { ok: false, code: "wrong_phase", phase: "probe", allowed: ["say", "ask", "probe", "recall", "probe-done"], cursor: created.body.cursor });
			assert.equal(messages(created.body.id).length, 0);
		});

		it(`${kind} on an unknown node is invalid with the plan-node check's text`, async () => {
			const { id, cursor } = await plannedLesson();
			const count = messages(id).length;
			const { status, body } = await turn(id, { kind, after: cursor, ...payload, nodeId: "priors" });
			assert.equal(status, 422);
			assert.deepEqual(body, { ok: false, code: "invalid", problems: [planNodeProblem(chatStore.getChat(id)!.tree, "priors")], cursor });
			assert.match(String(body.problems[0]), /base-rates, conditional, bayes/);
			assert.equal(messages(id).length, count);
			assert.equal(phaseAt3Lh(messages(id)), "plan");
		});

		it(`${kind} in the plan phase before any plan is invalid: there is no map to tag`, async () => {
			const { id, cursor } = await planningLesson();
			const { status, body } = await turn(id, { kind, after: cursor, ...payload });
			assert.equal(status, 422);
			assert.deepEqual(body.problems, [planNodeProblem(undefined, payload.nodeId)]);
			assert.equal(phaseAt3Lh(messages(id)), "plan");
		});

		it(`${kind} without type or nodeId, or with a type that is not predict or check, fails the schema`, async () => {
			const { id, cursor } = await plannedLesson();
			const count = messages(id).length;
			const { type: _type, ...untyped } = payload;
			for (const [bad, problem] of [
				[untyped, /type/],
				[withoutNodeId(payload), /nodeId/],
				[{ ...payload, type: "review" }, /type/],
				[{ ...payload, nodeId: 3 }, /nodeId/],
			] as const) {
				const res = await turn(id, { kind, after: cursor, ...bad });
				assert.equal(res.status, 422, JSON.stringify(bad));
				assert.equal(res.body.code, "invalid");
				assert.ok(res.body.problems.some((p: string) => problem.test(p)), res.body.problems.join("; "));
			}
			assert.equal(messages(id).length, count);
		});
	}

	it("refuses a payload that fails the tool's refinement, with both its text and the node check's", async () => {
		const { id, cursor } = await plannedLesson();
		const quiz = await turn(id, { kind: "quiz", after: cursor, ...QUIZ, correctAnswer: "thousand", nodeId: "priors" });
		assert.equal(quiz.status, 422);
		assert.ok(quiz.body.problems.some((p: string) => /correctAnswer/.test(p)), quiz.body.problems.join("; "));
		assert.equal(quiz.body.problems.at(-1), planNodeProblem(chatStore.getChat(id)!.tree, "priors"));
		const explain = await turn(id, { kind: "explain", after: cursor, ...EXPLAIN, correctAnswer: "  " });
		assert.equal(explain.status, 422);
		assert.ok(explain.body.problems.some((p: string) => /correctAnswer is required/.test(p)), explain.body.problems.join("; "));
		assert.equal(phaseAt3Lh(messages(id)), "plan");
	});

	it("checks the node against the plan the page draws, not a stored tree whose plan never landed", async () => {
		const { id, cursor } = await plannedLesson();
		// A rewrite whose commit failed: the tree is saved, the transcript is not.
		const saveMessages = chatStore.saveMessages;
		chatStore.saveMessages = () => {
			throw new Error("disk full");
		};
		let failed;
		try {
			failed = await turn(id, { kind: "plan", after: cursor, mermaid: REWRITE });
		} finally {
			chatStore.saveMessages = saveMessages;
		}
		assert.equal(failed.status, 500);
		assert.ok(chatStore.getChat(id)!.tree!.nodes.some((n) => n.id === "likelihood"));
		const pagePlan = latestTree(projectView(messages(id)) as any)!;
		assert.deepEqual((await show(id)).body.plan, pagePlan);

		// "likelihood" is only in the stored tree: refused, with the page's ids.
		const ahead = await turn(id, { kind: "quiz", after: cursor, ...QUIZ, nodeId: "likelihood" });
		assert.equal(ahead.status, 422);
		assert.deepEqual(ahead.body.problems, [planNodeProblem(pagePlan, "likelihood")]);
		// "conditional" is only in the page's plan: accepted, and the map shows it.
		const drawn = await turn(id, { kind: "explain", after: cursor, ...EXPLAIN });
		assert.equal(drawn.status, 200, JSON.stringify(drawn.body));
		assert.equal(mapProgress(id).current, "conditional");
	});
});
