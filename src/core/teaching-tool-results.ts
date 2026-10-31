import { Type } from "typebox";
import type { PlanToolResult, PlanTree } from "./contracts.ts";
import { PROBE_DONE_ACK_TEXT, type ProbeDoneResult } from "./contracts/probe.ts";

/**
 * teaching-tool-results — the probe_done and plan_init success results,
 * plan_init's input schema and node-id reminder, and the teaching
 * plan-node check, in one place. LearnHarness's own tools
 * (src/agent/tools/probe.ts, plan.ts, tools.ts) build from these. Bot-run
 * lesson code will build its records from the same helpers (ADR 0001); the
 * helpers return what the tools return, and TeachingToolSuccess names the
 * mapping a writer must apply to store the same record.
 */

/** The success value a server-side tool returns. serverExecute's
 *  toToolResult (src/agent/tool-execute.ts) stores it as the tool result
 *  `content: [{ type: "text", text }]` (what the agent sees) and
 *  `details` (what the record and UI read) — the text-only form of its
 *  ImageFileResult branch. A writer that builds the tool-result message
 *  itself must map it the same way to store an identical record. */
export interface TeachingToolSuccess<D> {
	text: string;
	details: D;
}

/** The binding-id reminder riding plan_init's slim content (owner,
 *  2026-10-09): plan_init is the exact moment the node ids become
 *  load-bearing — every later quiz/explain call must reference one. The
 *  field-drop incidents (tools_fails_2) showed the turn's tail is where
 *  discipline slips; the reminder lands right there. */
export const PLAN_NODE_IDS_REMINDER =
	"These are the plan's node ids — the only valid nodeId values for every quiz and explain call from here on. Reference them exactly.";

/** plan_init's input: one mermaid graph block. */
export const planInitInputSchema = Type.Object({
	mermaid: Type.String({
		minLength: 1,
		description:
			"A mermaid graph block (any direction), e.g.:\ngraph TD\n  primitives[Number primitives] --> operators[Arithmetic operators] --> expressions[Evaluating expressions]\n" +
			"The only strict rule: ids are permanent lowercase slugs (a-z, 0-9, hyphens/underscores) — checks reference them via nodeId. " +
			"Titles are free single-line text; `-->` means 'from = prerequisite' (chains fine); no subgraphs, styles, or classes.",
	}),
});

/** probe_done's success result. Context diet (owner, 2026-10-09): the
 *  assessment lives ONCE — as the call's arguments — so the agent sees the
 *  fixed ack, never an echo; details = {ok:true} for the record/UI. */
export function probeDoneSuccessResult(): TeachingToolSuccess<ProbeDoneResult & { ok: true }> {
	return { text: PROBE_DONE_ACK_TEXT, details: { ok: true } };
}

/** plan_init's success result for a validated, saved tree. Context diet:
 *  text = the validated nodeIds + the reminder (the ids just became binding
 *  for every quiz/explain call); details = the full tree for the record/UI —
 *  the plan popup's latestTree seam, agent-invisible (the serializer sends
 *  content only). */
export function planInitSuccessResult(tree: PlanTree): TeachingToolSuccess<PlanToolResult & { ok: true; tree: PlanTree }> {
	return {
		text: JSON.stringify({
			ok: true,
			nodeIds: tree.nodes.map((n) => n.id),
			reminder: PLAN_NODE_IDS_REMINDER,
		}),
		details: { ok: true, tree },
	};
}

/** The nodeId-against-live-tree check the teaching quiz and explain run
 *  after the shared authoring contract. Pass the lesson's CURRENT tree, so
 *  mid-turn rewrites are honored; with no tree every nodeId is rejected. */
export function planNodeProblem(tree: PlanTree | undefined, nodeId: string): string | null {
	const known = tree?.nodes.map((n) => n.id) ?? [];
	if (known.includes(nodeId)) return null;
	return (
		`nodeId "${nodeId}" matches no node in this session's plan map. ` +
		(known.length > 0
			? `Copy one of your plan_init slugs exactly (${known.slice(0, 5).join(", ")}${known.length > 5 ? ", …" : ""}).`
			: "No plan map exists yet — call plan_init before posing quizzes.")
	);
}
