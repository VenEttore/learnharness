/**
 * REPLACED PLAN MAPS (fork, external-teacher ticket 25): after a plan
 * rewrite, the lesson page keeps the older plan block in the transcript
 * and marks it "Replaced by a later plan"; the newest block is unmarked.
 * The record is built through the turn route under an isolated
 * LH_DATA_DIR and read through the page's own projection (core/view.ts),
 * the parts components/chat.tsx renders.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlanBlockData } from "../src/core/contracts.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-replaced-plan-"));
process.env.LH_DATA_DIR = TMP_DATA;

const createRoute = await import("../app/api/external/chats/route.ts");
const turnRoute = await import("../app/api/external/chats/[id]/turn/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { projectView } = await import("../src/core/view.ts");
const { PlanBlock } = await import("../components/plan-block.tsx");
const { latestPlanBlockId, ReplacedPlan } = await import("../components/replaced-plan.tsx");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

type Json = Record<string, any>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const postJson = (url: string, body: unknown) =>
	new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function turn(id: string, body: unknown): Promise<string> {
	const res = await turnRoute.POST(postJson(`http://test/api/external/chats/${id}/turn`, body), ctx(id));
	const json = (await res.json()) as Json;
	assert.equal(res.status, 200, JSON.stringify(json));
	return json.cursor as string;
}

const ASSESSMENT = { assessment: { strands: [{ strand: "halving", assessment: "Unsure." }], summary: "Start at halving." } };
const PLAN = "graph TD\n  halving[Repeated halving] --> logs[Logarithms]";
const REWRITE = "graph TD\n  halving[Repeated halving] --> powers[Powers of two] --> logs[Logarithms]";

let keys = 0;
async function lessonWithPlans(plans: string[]): Promise<string> {
	const res = await createRoute.POST(postJson("http://test/api/external/chats", { title: "Plans", key: `rp-${++keys}`, prompt: "Teach me logs" }));
	const created = (await res.json()) as Json;
	let cursor = await turn(created.id, { kind: "probe-done", after: created.cursor, ...ASSESSMENT });
	for (const mermaid of plans) cursor = await turn(created.id, { kind: "plan", after: cursor, mermaid });
	return created.id as string;
}

/** The plan blocks as the lesson page renders them, in transcript order. */
function renderedBlocks(id: string): string[] {
	const view = projectView(chatStore.getChat(id)!.messages);
	const latest = latestPlanBlockId(view);
	return view.flatMap((m) =>
		m.parts.flatMap((part) =>
			part.type === "data-plan-block"
				? [renderToStaticMarkup(
					<ReplacedPlan replaced={!!part.id && part.id !== latest}>
						<PlanBlock data={(part as unknown as { data: PlanBlockData }).data} onOpen={() => {}} />
					</ReplacedPlan>,
				)]
				: [],
		),
	);
}

describe("replaced plan maps", () => {
	it("one plan: its map is not marked", async () => {
		const blocks = renderedBlocks(await lessonWithPlans([PLAN]));
		assert.equal(blocks.length, 1);
		assert.doesNotMatch(blocks[0]!, /Replaced by a later plan/);
	});

	it("after a rewrite, the older map is marked replaced and the newest is not", async () => {
		const blocks = renderedBlocks(await lessonWithPlans([PLAN, REWRITE]));
		assert.equal(blocks.length, 2);
		assert.match(blocks[0]!, /data-testid="plan-block-replaced"/);
		assert.match(blocks[0]!, /Replaced by a later plan/);
		assert.doesNotMatch(blocks[1]!, /Replaced by a later plan/);
		assert.match(blocks[1]!, /Powers of two/);
	});
});
