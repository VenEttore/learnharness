/**
 * Fork (external-teacher 31): decides when the graph view refetches because
 * the graph's data stamp moved (a write with no run row, such as a Bot
 * Teacher's `lh findings`). Each /api/graph reply carries the
 * graphDataRevision it was read at, so a status stamp is compared with the
 * shown snapshot's, not with the previous status read.
 *
 * A status stamp read before the first snapshot lands is held and compared
 * when it lands: a merge between the first graph read and the first status
 * read then still refetches, in either reply order. Comparing with the
 * snapshot also makes a status reply that arrives out of order cost at most
 * one redundant fetch.
 */
export function graphSnapshotRevision(refetch: () => void) {
	let shown: number | undefined;
	let early: number | undefined;
	return {
		/** A snapshot landed with this stamp. */
		snapshot(revision: unknown): void {
			if (typeof revision !== "number") return;
			shown = revision;
			if (early !== undefined && early !== revision) refetch();
			early = undefined;
		},
		/** A status read returned this stamp. */
		status(revision: unknown): void {
			if (typeof revision !== "number") return;
			if (shown === undefined) early = revision;
			else if (revision !== shown) refetch();
		},
	};
}
