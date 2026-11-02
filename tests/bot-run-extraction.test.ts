/**
 * BOT-RUN EXTRACTION (fork, ADR 0001): a bot-run lesson never calls a
 * LearnHarness model, so knowledge-graph extraction returns an empty result
 * for it before the "models not configured" check. That one guard covers
 * the manual extract button and the automatic trigger, which both call
 * runExtraction. Runs under an isolated LH_DATA_DIR with no model
 * configured; every app-module import is dynamic so the seam is set before
 * config.ts loads.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-extraction-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { createExtractionPipeline } = await import("../src/agent/subagents/extraction.ts");
const { ModelsNotConfiguredError } = await import("../src/core/settings.ts");
const { stores } = await import("../src/server/stores.ts");
const { extraction } = await import("../src/server/index.ts");
const { POST } = await import("../app/api/graph/coverage/extract/route.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type EmissionStats = import("../src/core/graph.ts").EmissionStats;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

/** Teacher prose the extractor would read on an ordinary lesson. */
const MESSAGES = [
	{ id: "u1", role: "user", content: "teach me the chain rule", timestamp: Date.now() },
	{
		id: "a1",
		role: "assistant",
		content: [{ type: "text", text: "The chain rule differentiates a composition: (f∘g)' = f'(g)·g'." }],
		timestamp: Date.now(),
	},
] as unknown as LhMessage[];

function lesson(title: string, botRun: boolean) {
	if (botRun) return stores.chatStore.createChat(title, undefined, { driver: "external", externalKey: `key-${title}`, messages: MESSAGES });
	const chat = stores.chatStore.createChat(title);
	stores.chatStore.saveMessages(chat.id, MESSAGES);
	return chat;
}

/** A pipeline whose every model lookup throws: reaching one fails the run. */
function throwingPipeline() {
	let engineCalls = 0;
	const pipeline = createExtractionPipeline({
		...stores,
		engineFor: () => {
			engineCalls++;
			throw new Error("extraction asked for a model engine");
		},
	});
	return { pipeline, engineCalls: () => engineCalls };
}

describe("extraction on a bot-run lesson", () => {
	it("returns an empty result and never asks for an engine", async () => {
		const { pipeline, engineCalls } = throwingPipeline();
		const chat = lesson("bot", true);
		assert.deepEqual(await pipeline.runExtraction(chat.id), { nodes: 0, chains: 0 });
		assert.equal(engineCalls(), 0);
		assert.deepEqual(stores.graphStore.readCoverage(), []);
		assert.deepEqual(stores.chatStore.getChat(chat.id)?.extractions ?? [], []);
	});

	it("an ordinary lesson still reaches the engine (the throwing engine is live)", async () => {
		const { pipeline, engineCalls } = throwingPipeline();
		const chat = lesson("ordinary", false);
		await assert.rejects(pipeline.runExtraction(chat.id), /asked for a model engine/);
		assert.ok(engineCalls() > 0);
	});

	it("with no model configured, a bot-run lesson is not refused", async () => {
		const pipeline = createExtractionPipeline({ ...stores, engineFor: () => undefined });
		assert.deepEqual(await pipeline.runExtraction(lesson("bot-unconfigured", true).id), { nodes: 0, chains: 0 });
		await assert.rejects(pipeline.runExtraction(lesson("ordinary-unconfigured", false).id), ModelsNotConfiguredError);
	});
});

describe("POST /api/graph/coverage/extract", () => {
	/** Runs the real route and returns the run it started, so the test can
	 *  await the fire-and-forget promise. The app's shared pipeline resolves
	 *  engines from settings, and this data dir configures none. */
	async function extractVia(chatId: string): Promise<{ status: number; run: Promise<EmissionStats> }> {
		const original = extraction.runExtraction;
		let run: Promise<EmissionStats> | undefined;
		extraction.runExtraction = (id) => (run = original(id));
		try {
			const res = await POST(
				new Request("http://test/api/graph/coverage/extract", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ chatId }),
				}),
			);
			assert.ok(run, "the route started a run");
			return { status: res.status, run };
		} finally {
			extraction.runExtraction = original;
		}
	}

	it("on a bot-run lesson the run ends empty without reaching the model gate", async () => {
		const { status, run } = await extractVia(lesson("route-bot", true).id);
		assert.equal(status, 202);
		assert.deepEqual(await run, { nodes: 0, chains: 0 });
	});

	it("on an ordinary lesson the same run is refused for the missing model", async () => {
		const { status, run } = await extractVia(lesson("route-ordinary", false).id);
		assert.equal(status, 202);
		await assert.rejects(run, ModelsNotConfiguredError);
	});
});
