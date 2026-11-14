/**
 * Fork (external-teacher 31): decides when the graph view refetches because
 * the graph's data stamp moved (a write with no run row, such as a Bot
 * Teacher's `lh findings`). Each /api/graph reply carries the
 * graphDataRevision it was read at, so a status stamp is compared with the
 * shown snapshot's, not with the previous status read.
 *
 * A status stamp that arrives while a graph fetch is out is held and
 * compared when that fetch lands, whatever order the replies arrive in: a
 * merge during the first load still refetches, and status reads during a
 * refetch do not restart it. Stamps that arrived before a fetch started are
 * dropped, since that fetch reads newer data. After a failed fetch the next
 * status read refetches, as nothing newer is shown. Once a snapshot is
 * shown, a status reply that arrives out of order costs at most one
 * redundant fetch.
 */
export function graphSnapshotRevision(refetch: () => void) {
	let shown: number | undefined;
	let inFlight = false;
	const held = new Set<number>();
	const ask = () => {
		inFlight = true;
		held.clear();
		refetch();
	};
	return {
		/** A graph fetch started. */
		started(): void {
			inFlight = true;
			held.clear();
		},
		/** The latest graph fetch landed with this stamp. */
		snapshot(revision: unknown): void {
			inFlight = false;
			if (typeof revision === "number") shown = revision;
			if ([...held].some((r) => r !== shown)) ask();
			else held.clear();
		},
		/** The latest graph fetch failed. */
		failed(): void {
			inFlight = false;
			held.clear();
		},
		/** A status read returned this stamp. */
		status(revision: unknown): void {
			if (typeof revision !== "number") return;
			if (inFlight) held.add(revision);
			else if (revision !== shown) ask();
		},
	};
}
