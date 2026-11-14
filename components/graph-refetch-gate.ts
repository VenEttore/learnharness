/**
 * Fork (external-teacher 31): decides when the graph view refetches because
 * the graph's data stamp moved (a write with no run row, such as a Bot
 * Teacher's `lh findings`). Each /api/graph reply carries the
 * graphDataRevision it was read at, so a status stamp is compared with the
 * shown snapshot's, not with the previous status read.
 *
 * The view reports when each graph fetch starts, lands or fails. While a
 * fetch is out, the gate keeps the stamp it answers for: the stamp that
 * started it, or for a fetch the gate did not start (the first load, a run
 * row leaving, a deletion) the first status stamp seen while it is out,
 * which is checked when it lands. A status stamp that differs from that one
 * restarts the fetch, as each moved stamp did before; repeats of it do not,
 * so steady events cannot starve a slow fetch. A seen stamp stays owed until
 * a fetch started after it lands. A failed fetch is retried once for an owed
 * stamp, then waits for a status read. An out-of-order status reply costs
 * at most one redundant fetch.
 */
export function graphRefetchGate(refetch: () => void) {
	let shown: number | undefined;
	let inFlight = false;
	let asked: number | undefined;
	let guessed = false;
	let asking = false;
	let retried = false;
	let starts = 0;
	const owed = new Map<number, number>(); // owed stamp -> fetch starts when it arrived
	const ask = (revision: number | undefined, retry = false) => {
		inFlight = true;
		asking = true;
		asked = revision;
		guessed = false;
		retried = retry;
		refetch();
	};
	return {
		/** A graph fetch started. */
		started(): void {
			starts++;
			if (!asking) {
				asked = undefined;
				guessed = false;
				retried = false;
			}
			asking = false;
			inFlight = true;
		},
		/** The latest graph fetch landed with this stamp. */
		snapshot(revision: unknown): void {
			inFlight = false;
			if (typeof revision === "number") shown = revision;
			for (const [stamp, at] of owed) if (at < starts || stamp === shown) owed.delete(stamp);
			if (guessed && asked !== shown) ask(asked);
			guessed = false;
		},
		/** The latest graph fetch failed. */
		failed(): void {
			inFlight = false;
			const unshown = [...owed.keys()].filter((stamp) => stamp !== shown);
			if (!retried && unshown.length > 0) ask(unshown[unshown.length - 1], true);
		},
		/** A status read returned this stamp. */
		status(revision: unknown): void {
			if (typeof revision !== "number") return;
			if (revision !== shown) {
				owed.delete(revision);
				owed.set(revision, starts);
			}
			if (!inFlight) {
				if (revision !== shown) ask(revision);
			} else if (asked === undefined) {
				asked = revision;
				guessed = true;
			} else if (revision !== asked) {
				ask(revision);
			}
		},
	};
}
