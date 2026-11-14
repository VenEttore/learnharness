/**
 * Fork (external-teacher 31): decides when the graph view refetches because
 * the graph's data stamp moved (a write with no run row, such as a Bot
 * Teacher's `lh findings`). Each /api/graph reply carries the
 * graphDataRevision it was read at, so a status stamp is compared with the
 * shown snapshot's, not with the previous status read.
 *
 * Every status stamp read before the first snapshot lands is held and
 * compared when it lands, so a merge between the first graph read and a
 * status read still refetches, whatever order the replies arrive in. Once a
 * snapshot is shown, a status reply that arrives out of order costs at most
 * one redundant fetch.
 */
export function graphSnapshotRevision(refetch: () => void) {
	let shown: number | undefined;
	const early = new Set<number>();
	return {
		/** A snapshot landed with this stamp. */
		snapshot(revision: unknown): void {
			if (typeof revision !== "number") return;
			shown = revision;
			if ([...early].some((r) => r !== revision)) refetch();
			early.clear();
		},
		/** A status read returned this stamp. */
		status(revision: unknown): void {
			if (typeof revision !== "number") return;
			if (shown === undefined) early.add(revision);
			else if (revision !== shown) refetch();
		},
	};
}
