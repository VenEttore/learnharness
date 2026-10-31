/**
 * PROBE-DONE (fork, ADR 0001; external-teacher ticket 10): a Bot Teacher
 * ends the probe with an assessment. Driven through the turn, show and
 * answer routes under an isolated LH_DATA_DIR; asserts the replies the bot
 * reads and the record the page reads (the phase fold, the probe-done
 * card's parse, the handoff marker's view). Every app-module import is
 * dynamic: the seam must be set before config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-probe-done-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const showRoute = await import("../app/api/external/chats/[id]/route.ts");
const answerRoute = await import("../app/api/external/chats/[id]/answer/route.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { phaseAt3Lh } = await import("../src/core/phases.ts");
const { hasProbeDone, newHandoffMessage } = await import("../src/core/native-messages.ts");
const { projectView } = await import("../src/core/view.ts");
const { probeDoneSuccessResult } = await import("../src/core/teaching-tool-results.ts");
const { HANDOFF_TEXT } = await import("../src/core/contracts.ts");

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

let keys = 0;
async function lesson(): Promise<{ id: string; cursor: string }> {
	const { body } = await json(await createRoute.POST(postJson("http://test/api/external/chats", { title: "Probe", key: `pd-${++keys}`, prompt: "Teach me Bayes" })));
	return { id: body.id, cursor: body.cursor };
}

const messages = (id: string) => chatStore.getChat(id)!.messages;

const ASSESSMENT = {
	assessment: {
		strands: [{ strand: "conditional probability", assessment: "Floor: reads P(A|B). Ceiling: confuses it with P(B|A)." }],
		summary: "Wants intuition; start from base rates.",
	},
};

async function learnerTypes(chatId: string, text: string): Promise<void> {
	const res = await handleChatRequest(postJson("http://test/api/chat", { chatId, input: { type: "text", text } }), () => {
		throw new Error("a bot-run lesson asked for a model agent");
	});
	assert.equal(res.status, 200);
	await res.text();
}

describe("probe-done", () => {
	it("saves the call, its tool result and the handoff marker in one commit, and the phase reads plan", async () => {
		const { id, cursor } = await lesson();
		const before = messages(id).length;
		const { status, body } = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		assert.equal(status, 200);
		assert.equal(body.ok, true);

		const added = messages(id).slice(before);
		assert.equal(added.length, 3);
		const [call, result, marker] = added as any[];
		assert.equal(call.role, "assistant");
		const block = call.content.at(-1);
		assert.equal(block.type, "toolCall");
		assert.equal(block.name, "probe_done");
		assert.deepEqual(block.arguments, ASSESSMENT);

		// The same text and details the tool writes, joined to the call by id.
		const done = probeDoneSuccessResult();
		assert.equal(result.role, "toolResult");
		assert.equal(result.toolCallId, block.id);
		assert.equal(result.toolName, "probe_done");
		assert.equal(result.isError, false);
		assert.deepEqual(result.content, [{ type: "text", text: done.text }]);
		assert.deepEqual(result.details, done.details);

		const handoff = newHandoffMessage(id);
		assert.equal(marker.role, "custom");
		assert.equal(marker.customType, "probe-handoff");
		assert.equal(marker.id, handoff.id);
		assert.equal(marker.content, HANDOFF_TEXT);
		assert.deepEqual(marker.details, handoff.details);
		assert.equal(body.cursor, marker.id);

		assert.equal(hasProbeDone(messages(id)), true);
		assert.equal(phaseAt3Lh(messages(id)), "plan");
		assert.equal((await show(id)).body.phase, "plan");

		// The page's view: the card's call has its output, and the marker draws.
		const parts = projectView(messages(id)).flatMap((m: any) => m.parts);
		const cardPart = parts.find((p: any) => p.type === "tool-probe_done");
		assert.equal(cardPart?.state, "output-available");
		assert.ok(parts.some((p: any) => p.type === "data-probe-handoff"));
	});

	it("queues nothing on the wake pipeline", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		const wake = (globalThis as { __lhWakePipeline?: { queues: Map<string, unknown[]> } }).__lhWakePipeline;
		assert.equal(wake?.queues.get(id)?.length ?? 0, 0);
	});

	it("is refused outside the probe phase, and probe and recall are refused after it", async () => {
		const { id, cursor } = await lesson();
		const done = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		const count = messages(id).length;

		const again = await turn(id, { kind: "probe-done", after: done.body.cursor, ...ASSESSMENT });
		assert.equal(again.status, 409);
		assert.equal(again.body.code, "wrong_phase");
		assert.equal(again.body.phase, "plan");
		assert.ok(!again.body.allowed.includes("probe-done"));

		for (const [kind, payload] of [
			["probe", { question: "Q?", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], explanation: "E.", correctAnswer: "a" }],
			["recall", { question: "Explain.", correctAnswer: "Answer." }],
		] as const) {
			const { status, body } = await turn(id, { kind, after: done.body.cursor, ...payload });
			assert.equal(status, 409, kind);
			assert.equal(body.code, "wrong_phase");
			assert.ok(!body.allowed.includes(kind));
		}
		assert.equal(messages(id).length, count);
	});

	it("a rerun with the same after, following a say, is a repeat and appends nothing", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		const said = await turn(id, { kind: "say", after: messages(id).at(-1)!.id, text: "Now I'll draw up a plan." });
		assert.equal(said.status, 200);
		const count = messages(id).length;

		const { status, body } = await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		assert.equal(status, 200);
		assert.equal(body.repeat, true);
		assert.equal(body.cursor, said.body.cursor);
		assert.equal(messages(id).length, count);
	});

	it("refuses an assessment that fails the tool's schema, saving nothing", async () => {
		const { id, cursor } = await lesson();
		const count = messages(id).length;
		for (const bad of [{ assessment: { strands: [] } }, { assessment: "free text" }, { ...ASSESSMENT, text: "Lead-in." }]) {
			const { status, body } = await turn(id, { kind: "probe-done", after: cursor, ...bad });
			assert.equal(status, 422, JSON.stringify(bad));
			assert.equal(body.code, "invalid");
			assert.ok(body.problems.length > 0);
		}
		assert.equal(messages(id).length, count);
		assert.equal(phaseAt3Lh(messages(id)), "probe");
	});

	it("answer returns neither the probe_done result nor the marker, only learner input", async () => {
		const { id, cursor } = await lesson();
		await turn(id, { kind: "probe-done", after: cursor, ...ASSESSMENT });
		assert.deepEqual((await answer(id)).body.items, []);

		await learnerTypes(id, "Sounds good.");
		const { body } = await answer(id);
		assert.deepEqual(
			body.items.map((i: Json) => [i.type, i.text]),
			[["message", "Sounds good."]],
		);
	});
});
