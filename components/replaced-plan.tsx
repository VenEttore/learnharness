import type { ReactNode } from "react";

/**
 * Replaced plan maps (fork, external-teacher ticket 25). A plan rewrite
 * (a Bot Teacher's `lh plan`, or LearnHarness's own model calling
 * plan_init again) appends a new plan block; the older blocks stay in the
 * transcript as snapshots. Every block but the newest gets a "Replaced by
 * a later plan" line and is dimmed, so the map the lesson follows is the
 * one that reads as current. A lesson with one plan is unchanged.
 */

/** The minimal view-message slice this needs (the projection's parts). */
interface ViewMessage {
	parts: ReadonlyArray<{ type: string; id?: string }>;
}

/** The id of the newest plan-block part in the view, or null for none. */
export function latestPlanBlockId(messages: readonly ViewMessage[]): string | null {
	for (let m = messages.length - 1; m >= 0; m--) {
		const parts = messages[m]!.parts;
		for (let p = parts.length - 1; p >= 0; p--) {
			const part = parts[p]!;
			if (part.type === "data-plan-block" && part.id) return part.id;
		}
	}
	return null;
}

/** A plan block, marked when a later plan replaced it. */
export function ReplacedPlan({ replaced, children }: { replaced: boolean; children: ReactNode }) {
	// One element shape either way, so a block that becomes replaced keeps
	// its state (React would remount it under a new wrapper type).
	return (
		<div data-testid={replaced ? "plan-block-replaced" : undefined}>
			{replaced && <div className="mb-1 text-xs text-muted-foreground">Replaced by a later plan</div>}
			<div className={replaced ? "opacity-50" : undefined}>{children}</div>
		</div>
	);
}
