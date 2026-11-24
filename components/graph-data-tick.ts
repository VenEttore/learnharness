"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";

/**
 * Fork (external-teacher 30): a counter that moves when the graph's ledgers
 * change, for views that must redraw after a graph write that has no run row,
 * such as a Bot Teacher's `lh findings`. It is the graph view's signal from
 * ticket 29: on each `activity-changed` (debounced, as the view does) and on
 * a reconnect, read /api/graph/status and compare `graphDataRevision` with
 * the last read.
 *
 * The first read always counts as a move. A consumer that fetches on mount
 * and again on each move then never misses a write that lands between its
 * own first fetch and the first status read.
 */
export function useGraphDataTick(): number {
	const [tick, setTick] = useState(0);
	const revisionRef = useRef<number | undefined>(undefined);
	// Replies can arrive out of order; one older than the newest applied
	// reply is dropped, so it cannot set the revision back.
	const sentRef = useRef(0);
	const appliedRef = useRef(0);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const read = useCallback(() => {
		const sent = ++sentRef.current;
		fetch("/api/graph/status")
			.then((res) => res.json() as Promise<{ graphDataRevision?: unknown }>)
			.then(({ graphDataRevision }) => {
				if (typeof graphDataRevision !== "number" || sent < appliedRef.current) return;
				appliedRef.current = sent;
				if (graphDataRevision === revisionRef.current) return;
				revisionRef.current = graphDataRevision;
				setTick((t) => t + 1);
			})
			.catch(() => {}); // cosmetic, like the graph view's status read
	}, []);

	useEffect(() => {
		read();
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [read]);

	useServerEvent("activity-changed", () => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = undefined;
			read();
		}, 250);
	});
	useServerResync(read);

	return tick;
}
