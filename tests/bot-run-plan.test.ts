/**
 * PLAN (fork, ADR 0001; external-teacher ticket 11): a Bot Teacher posts
 * the lesson plan as Mermaid. Driven through the turn, show and answer
 * routes under an isolated LH_DATA_DIR; asserts the replies the bot reads
 * and the record the page reads: the plan map through the view projection
 * (latestTree over projectView), the in-lesson plan block, and the tree
 * the store keeps. Every app-module import is dynamic: the seam must be
 * set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-plan-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { projectView } = await import("../src/core/view.ts");
const { latestTree } = await import("../components/plan-block.tsx");
const { planInitSuccessResult } = await import("../src/core/teaching-tool-results.ts");
const { newBotAssistantMessage } = await import("../src/server/bot-run.ts");
const { newMessageId } = await import("../src/core/native-messages.ts");

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
const answer = async (id: string) => json(await answerRoute.GET(new Request(`http://test/api/external/chats/${id}/answer`), ctx(id)));

const ASSESSMENT = {
	assessment: {
		strands: [{ strand: "conditional probability", assessment: "Floor: reads P(A|B). Ceiling: confuses it with P(B|A)." }],
		summary: "Wants intuition; start from base rates.",
	},
};

const PLAN = "graph TD\n  base-rates[Base rates] --> conditional[Conditional probability] --> bayes[Bayes' rule]";
const REWRITE = "graph LR\n  base-rates[Base rates] --> bayes[Bayes' rule]\n  likelihood[Likelihood] --> bayes";

let keys = 0;
/** A lesson past probe-done: the phase reads plan. */
async function planningLesson(): Promise<{ id: string; cursor: string }> {
	const created = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Plan", key: `plan-${++keys}`, prompt: "Teach me Bayes" })));
	const done = await turn(created.body.id, { kind: "probe-done", after: created.body.cursor, ...ASSESSMENT });
	assert.equal(done.status, 200);
	return { id: created.body.id, cursor: done.body.cursor };
}

const messages = (id: string) => chatStore.getChat(id)!.messages;
const parts = (id: string) => projectView(messages(id)).flatMap((m: any) => m.parts);
/** The tree the page's plan map draws. */
const pageTree = (id: string) => latestTree(projectView(messages(id)) as any);
const ids = (tree: any) => tree?.nodes.map((n: any) => n.id);

describe("plan", () => {
	it("saves the tree, then the call, its result and the plan block in one commit; the page draws it", async () => {
		const { id, cursor } = await planningLesson();
		const before = messages(id).length;
		const { status, body } = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		assert.equal(status, 200);
		assert.equal(body.ok, true);

		const added = messages(id).slice(before);
		assert.equal(added.length, 3);
		const [call, result, marker] = added as any[];
		assert.equal(call.role, "assistant");
		assert.equal(call.content.length, 1);
		const block = call.content[0];
		assert.equal(block.type, "toolCall");
		assert.equal(block.name, "plan_init");
		assert.deepEqual(block.arguments, { mermaid: PLAN });

		// The same text and details the tool writes, joined to the call by id.
		const tree = chatStore.getChat(id)!.tree!;
		assert.deepEqual(ids(tree), ["base-rates", "conditional", "bayes"]);
		const success = planInitSuccessResult(tree);
		assert.equal(result.role, "toolResult");
		assert.equal(result.toolCallId, block.id);
		assert.equal(result.toolName, "plan_init");
		assert.equal(result.isError, false);
		assert.deepEqual(result.content, [{ type: "text", text: success.text }]);
		assert.deepEqual(result.details, success.details);

		assert.equal(marker.role, "custom");
		assert.equal(marker.customType, "plan-block");
		assert.equal(marker.details.planCallId, block.id);
		assert.equal(body.cursor, marker.id);

		// The page: the plan map's tree and the in-lesson block, after the call.
		assert.deepEqual(pageTree(id), tree);
		const view = parts(id);
		const callAt = view.findIndex((p: any) => p.type === "tool-plan_init");
		assert.equal(view[callAt]?.state, "output-available");
		const planBlock = view[callAt + 1];
		assert.equal(planBlock?.type, "data-plan-block");
		assert.deepEqual(planBlock.data.nodes.map((n: any) => [n.id, n.status]), [
			["base-rates", "upcoming"],
			["conditional", "upcoming"],
			["bayes", "upcoming"],
		]);
		assert.deepEqual(planBlock.data.edges, tree.edges);

		// The phase stays plan until the first tagged teaching question.
		assert.equal(phaseAt3Lh(messages(id)), "plan");
		const shown = (await show(id)).body;
		assert.equal(shown.phase, "plan");
		assert.deepEqual(shown.plan, pageTree(id));
		assert.equal(shown.cursor, marker.id);
	});

	it("show's plan is null before any plan", async () => {
		const { id } = await planningLesson();
		assert.equal((await show(id)).body.plan, null);
		assert.equal(pageTree(id), null);
	});

	it("is refused before probe-done, saving nothing", async () => {
		const created = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Early", key: `plan-${++keys}` })));
		const id = created.body.id;
		const { status, body } = await turn(id, { kind: "plan", after: created.body.cursor, mermaid: PLAN });
		assert.equal(status, 409);
		assert.equal(body.code, "wrong_phase");
		assert.equal(body.phase, "probe");
		assert.ok(!body.allowed.includes("plan"));
		assert.equal(messages(id).length, 0);
		assert.equal(chatStore.getChat(id)!.tree, undefined);
	});

	it("refuses Mermaid that does not parse, or a tree that is invalid, with the problem text; neither save runs", async () => {
		const { id, cursor } = await planningLesson();
		const count = messages(id).length;
		const cases: [unknown, RegExp][] = [
			["not a graph", /line 1/i],
			["graph TD\n  Base_Rates[Base rates] --> bayes[Bayes]", /Base_Rates/],
			["graph TD\n  a[A] --> b[B]\n  b --> a", /cycle/],
			["graph TD\n  a[A] --> a", /self-loop/],
			["", /mermaid/],
		];
		for (const [mermaid, problem] of cases) {
			const { status, body } = await turn(id, { kind: "plan", after: cursor, mermaid });
			assert.equal(status, 422, JSON.stringify(mermaid));
			assert.equal(body.code, "invalid");
			assert.equal(body.cursor, cursor);
			assert.match(body.problems.join("\n"), problem, JSON.stringify(mermaid));
		}
		for (const bad of [{ mermaid: PLAN, text: "Lead-in." }, { mermaid: null }, {}]) {
			const { status, body } = await turn(id, { kind: "plan", after: cursor, ...bad });
			assert.equal(status, 422, JSON.stringify(bad));
			assert.equal(body.code, "invalid");
		}
		assert.equal(messages(id).length, count);
		assert.equal(chatStore.getChat(id)!.tree, undefined);
		assert.equal((await show(id)).body.plan, null);
	});

	it("a rerun with the same after is a repeat, trailing line breaks aside, and saves nothing", async () => {
		const { id, cursor } = await planningLesson();
		const first = await turn(id, { kind: "plan", after: cursor, mermaid: `${PLAN}\n` });
		assert.equal(first.status, 200);
		const count = messages(id).length;
		for (const mermaid of [PLAN, `${PLAN}\n`, `${PLAN}\r\n\n`]) {
			const { status, body } = await turn(id, { kind: "plan", after: cursor, mermaid });
			assert.equal(status, 200);
			assert.equal(body.repeat, true);
			assert.equal(body.cursor, first.body.cursor);
		}
		assert.equal(messages(id).length, count);
	});

	it("a later plan rewrites the map: the new tree replaces the old, with its own block", async () => {
		const { id, cursor } = await planningLesson();
		const first = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		const second = await turn(id, { kind: "plan", after: first.body.cursor, mermaid: REWRITE });
		assert.equal(second.status, 200);
		assert.equal(second.body.repeat, undefined);

		assert.deepEqual(ids(chatStore.getChat(id)!.tree), ["base-rates", "bayes", "likelihood"]);
		assert.deepEqual(pageTree(id), chatStore.getChat(id)!.tree);
		assert.deepEqual((await show(id)).body.plan, pageTree(id));
		const blocks = parts(id).filter((p: any) => p.type === "data-plan-block");
		assert.deepEqual(blocks.map((b: any) => b.data.nodes.length), [3, 3]);
		assert.deepEqual(blocks[1].data.nodes.map((n: any) => n.id), ["base-rates", "bayes", "likelihood"]);
	});

	it("is accepted in the teach phase", async () => {
		const { id, cursor } = await planningLesson();
		const planned = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		// A tagged quiz the learner skipped: the phase reads teach and no
		// question is open. (The quiz kind is ticket 12's; the record is the
		// one the model writes.)
		const quiz = newBotAssistantMessage([
			{
				type: "toolCall",
				id: "call_quiz_1",
				name: "quiz",
				arguments: { nodeId: "base-rates", question: "Q?", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], explanation: "E.", correctAnswer: "a" },
			},
		]);
		const skipped = {
			id: newMessageId(),
			role: "toolResult" as const,
			toolCallId: "call_quiz_1",
			toolName: "quiz",
			content: [{ type: "text" as const, text: "dismissed" }],
			details: { kind: "quiz", dismissed: true },
			isError: false,
			timestamp: Date.now(),
		};
		chatStore.saveMessages(id, [...messages(id), quiz, skipped]);
		assert.equal(phaseAt3Lh(messages(id)), "teach");
		assert.ok(planned.body.cursor);

		const { status, body } = await turn(id, { kind: "plan", after: skipped.id, mermaid: REWRITE });
		assert.equal(status, 200, JSON.stringify(body));
		assert.deepEqual(ids(pageTree(id)), ["base-rates", "bayes", "likelihood"]);
		// The rewrite's block snapshots what was true then: the quizzed node is current.
		const block = parts(id).filter((p: any) => p.type === "data-plan-block").at(-1);
		assert.equal(block.data.current, "base-rates");
	});

	it("answer returns neither the plan_init result nor the marker", async () => {
		const { id, cursor } = await planningLesson();
		await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		assert.deepEqual((await answer(id)).body.items, []);
	});

	it("crash repair: tree saved, messages lost; a rerun saves the messages and is not a repeat", async () => {
		const { id, cursor } = await planningLesson();
		const count = messages(id).length;
		const saveMessages = chatStore.saveMessages;
		chatStore.saveMessages = () => {
			throw new Error("disk full");
		};
		let failed;
		try {
			failed = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		} finally {
			chatStore.saveMessages = saveMessages;
		}
		assert.equal(failed.status, 500);
		assert.equal(failed.body.code, "save_failed");
		assert.equal(failed.body.cursor, cursor);
		assert.deepEqual(ids(chatStore.getChat(id)!.tree), ["base-rates", "conditional", "bayes"]);
		assert.equal(messages(id).length, count);
		assert.equal(pageTree(id), null);

		const rerun = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		assert.equal(rerun.status, 200);
		assert.equal(rerun.body.repeat, undefined);
		assert.equal(messages(id).length, count + 3);
		assert.deepEqual(pageTree(id), chatStore.getChat(id)!.tree);
		assert.ok(parts(id).some((p: any) => p.type === "data-plan-block"));
	});

	it("a failed tree save is a JSON 500 and saves nothing", async () => {
		const { id, cursor } = await planningLesson();
		const count = messages(id).length;
		const saveTree = chatStore.saveTree;
		chatStore.saveTree = () => {
			throw new Error("disk full");
		};
		let failed;
		try {
			failed = await turn(id, { kind: "plan", after: cursor, mermaid: PLAN });
		} finally {
			chatStore.saveTree = saveTree;
		}
		assert.equal(failed.status, 500);
		assert.equal(failed.body.code, "save_failed");
		assert.equal(messages(id).length, count);
		assert.equal(chatStore.getChat(id)!.tree, undefined);
	});
});
