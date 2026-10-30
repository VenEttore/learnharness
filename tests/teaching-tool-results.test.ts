/**
 * teaching-tool-results — the shared probe_done / plan_init success results
 * and the teaching plan-node check (src/core/teaching-tool-results.ts).
 * LearnHarness's tools build from these now, and bot-run lesson code will
 * (ADR 0001), so each helper is pinned to the exact value the tool returned
 * before the move, as the helper returns it, as the tool-result mapping
 * stores it, and as the tool still returns it.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type { Static } from "typebox";
import { Value } from "typebox/value";
import {
	PLAN_NODE_IDS_REMINDER,
	planInitInputSchema,
	planInitSuccessResult,
	planNodeProblem,
	probeDoneSuccessResult,
} from "../src/core/teaching-tool-results.ts";
import type { PlanTree } from "../src/core/contracts.ts";
import { explainInputObject, quizInputObject } from "../src/core/question-core.ts";
import { planTools } from "../src/agent/tools/plan.ts";
import { probeDoneTool } from "../src/agent/tools/probe.ts";
import { teachExplainToolFor, teachQuizToolFor } from "../src/agent/tools.ts";
import { toToolResult } from "../src/agent/tool-execute.ts";
import { chatStore } from "../src/store/chats.ts";
import { PATHS } from "../config.ts";

fs.mkdirSync(PATHS.data, { recursive: true });
const createdChats: string[] = [];
after(() => {
	for (const id of createdChats) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* scratch cleanup, best effort */
		}
	}
});
function newChat(title: string): string {
	const chat = chatStore.createChat(title);
	createdChats.push(chat.id);
	return chat.id;
}

const PROBE_ACK =
	"Assessment recorded — it is shown to the learner now and the teacher plans from it. Say your closing sentence and end your turn; the teaching phase takes over from here.";
const REMINDER =
	"These are the plan's node ids — the only valid nodeId values for every quiz and explain call from here on. Reference them exactly.";

/** plan_init's input schema, serialized as the model read it before the move. */
const PRE_MOVE_PLAN_SCHEMA = {
	type: "object",
	required: ["mermaid"],
	properties: {
		mermaid: {
			type: "string",
			minLength: 1,
			description:
				"A mermaid graph block (any direction), e.g.:\ngraph TD\n  primitives[Number primitives] --> operators[Arithmetic operators] --> expressions[Evaluating expressions]\n" +
				"The only strict rule: ids are permanent lowercase slugs (a-z, 0-9, hyphens/underscores) — checks reference them via nodeId. " +
				"Titles are free single-line text; `-->` means 'from = prerequisite' (chains fine); no subgraphs, styles, or classes.",
		},
	},
};
const serialized = (schema: unknown): unknown => JSON.parse(JSON.stringify(schema));

const AB_TREE: PlanTree = {
	nodes: [
		{ id: "a", title: "A" },
		{ id: "b", title: "B" },
	],
	edges: [{ from: "a", to: "b" }],
	version: 1,
};

function treeOf(ids: string[]): PlanTree {
	return { nodes: ids.map((id) => ({ id, title: id.toUpperCase() })), edges: [], version: 1 };
}

describe("probeDoneSuccessResult", () => {
	it("is the fixed ack text with details {ok:true}", () => {
		assert.deepEqual(probeDoneSuccessResult(), { text: PROBE_ACK, details: { ok: true } });
	});

	it("maps to the stored tool result: the ack as content, {ok:true} as details", () => {
		assert.deepEqual(toToolResult(probeDoneSuccessResult()), {
			content: [{ type: "text", text: PROBE_ACK }],
			details: { ok: true },
		});
	});

	it("is what probe_done returns on success", async () => {
		const chatId = newChat("Shared: probe_done");
		const res = await probeDoneTool({ chatId, chatStore, deliver: () => {} }).probe_done!.execute("t", {
			strands: [{ strand: "limits", assessment: "Floor: slopes. Ceiling: ε–δ." }],
			summary: "Start at the formal definition.",
		});
		const expected = probeDoneSuccessResult();
		assert.deepEqual(res, { content: [{ type: "text", text: expected.text }], details: expected.details });
	});
});

describe("planInitSuccessResult", () => {
	it("is the nodeIds + reminder JSON text with the tree in details", () => {
		assert.equal(PLAN_NODE_IDS_REMINDER, REMINDER);
		assert.deepEqual(planInitSuccessResult(AB_TREE), {
			text: `{"ok":true,"nodeIds":["a","b"],"reminder":${JSON.stringify(REMINDER)}}`,
			details: { ok: true, tree: AB_TREE },
		});
	});

	it("maps to the stored tool result: the JSON text as content, the tree in details", () => {
		assert.deepEqual(toToolResult(planInitSuccessResult(AB_TREE)), {
			content: [{ type: "text", text: `{"ok":true,"nodeIds":["a","b"],"reminder":${JSON.stringify(REMINDER)}}` }],
			details: { ok: true, tree: AB_TREE },
		});
	});

	it("is what plan_init returns on success", async () => {
		const chatId = newChat("Shared: plan_init");
		const res = await planTools({ chatId, chatStore }).plan_init!.execute("t", {
			mermaid: "graph TD\n  a[A] --> b[B]\n",
		});
		const expected = planInitSuccessResult(AB_TREE);
		assert.deepEqual(res, { content: [{ type: "text", text: expected.text }], details: expected.details });
	});

	it("the exported schema is the pre-move schema, and plan_init's parameters match it", () => {
		assert.deepEqual(serialized(planInitInputSchema), PRE_MOVE_PLAN_SCHEMA);
		assert.deepEqual(serialized(planTools({ chatId: "x", chatStore }).plan_init!.parameters), PRE_MOVE_PLAN_SCHEMA);
		assert.equal(Value.Check(planInitInputSchema, { mermaid: "graph TD\n  a[A]\n" }), true);
		assert.equal(Value.Check(planInitInputSchema, { mermaid: "" }), false);
	});
});

describe("planNodeProblem", () => {
	it("accepts a node of the tree", () => {
		assert.equal(planNodeProblem(AB_TREE, "b"), null);
	});

	it("no tree yet: tells the teacher to call plan_init first", () => {
		const expected =
			'nodeId "x" matches no node in this session\'s plan map. No plan map exists yet — call plan_init before posing quizzes.';
		assert.equal(planNodeProblem(undefined, "x"), expected);
		assert.equal(planNodeProblem(treeOf([]), "x"), expected);
	});

	it("unknown node: lists the slugs", () => {
		assert.equal(
			planNodeProblem(AB_TREE, "c"),
			'nodeId "c" matches no node in this session\'s plan map. Copy one of your plan_init slugs exactly (a, b).',
		);
	});

	it("exactly five nodes: lists all five, no ellipsis", () => {
		assert.equal(
			planNodeProblem(treeOf(["n1", "n2", "n3", "n4", "n5"]), "zz"),
			'nodeId "zz" matches no node in this session\'s plan map. Copy one of your plan_init slugs exactly (n1, n2, n3, n4, n5).',
		);
	});

	it("more than five nodes: lists the first five and an ellipsis", () => {
		assert.equal(
			planNodeProblem(treeOf(["n1", "n2", "n3", "n4", "n5", "n6"]), "zz"),
			'nodeId "zz" matches no node in this session\'s plan map. Copy one of your plan_init slugs exactly (n1, n2, n3, n4, n5, …).',
		);
	});

	it("is the problem the teaching quiz and explain tools report", async () => {
		const chatId = newChat("Shared: plan-node check");
		chatStore.saveTree(chatId, AB_TREE);
		// Inputs the loop would let through (schema-valid), so the refusal
		// comes from the plan-node check alone.
		const quizTool = teachQuizToolFor({ chatId, chatStore });
		const quizInput: Static<typeof quizInputObject> = {
			type: "check",
			nodeId: "c",
			question: "Which is larger?",
			options: [
				{ label: "1", value: "1" },
				{ label: "2", value: "2" },
			],
			correctAnswer: "2",
			explanation: "2 is larger than 1.",
		};
		const explainTool = teachExplainToolFor({ chatId, chatStore });
		const explainInput: Static<typeof explainInputObject> = {
			type: "check",
			nodeId: "c",
			question: "Explain why 2 is larger than 1.",
			correctAnswer: "2 counts one more than 1.",
		};
		assert.equal(Value.Check(quizTool.parameters, quizInput), true);
		assert.equal(Value.Check(explainTool.parameters, explainInput), true);
		const quiz = await quizTool.execute("t", quizInput);
		const explain = await explainTool.execute("t", explainInput);
		const expected = planNodeProblem(AB_TREE, "c");
		assert.ok(expected);
		for (const [name, res] of [["quiz", quiz], ["explain", explain]] as const) {
			assert.deepEqual(res.details, { tool: name, problems: [expected] });
			assert.deepEqual(res.content, [{ type: "text", text: `Invalid tool input for tool "${name}":\n- ${expected}` }]);
		}
	});
});
