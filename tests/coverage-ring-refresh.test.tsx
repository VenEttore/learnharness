/**
 * COVERAGE RING REFRESH (fork, external-teacher ticket 30): the lesson page's
 * coverage ring redraws after a graph write that has no run row, such as a
 * Bot Teacher's `lh findings`. The ring is mounted under the app's events
 * provider with a fake source and a fake server behind fetch. The server's
 * coverage drains and its graphDataRevision moves; one activity-changed
 * frame must redraw the ring. A frame with no revision move refetches no
 * coverage.
 *
 * linkedom as the DOM, as in card-live-refresh.test.tsx.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import * as ReactDOMClient from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { CoverageRing, CoverageRingGlyph, type SessionCoverage } from "../components/extraction-coverage.tsx";

const dom = parseHTML("<!doctype html><html><head></head><body></body></html>");
const g = globalThis as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Element", "Node"]) {
	if (g[k] === undefined) g[k] = (dom as unknown as Record<string, unknown>)[k];
}
g.IS_REACT_ACT_ENVIRONMENT = true;

/** A source the test drives: open() and frame(name, payload). */
function fakeSource() {
	const handlers = new Map<string, (data: string) => void>();
	let opened = () => {};
	const source: NotifySource = {
		close() {},
		onOpen(cb) { opened = cb; },
		onEvent(name, cb) { handlers.set(name, cb); },
	};
	return {
		connect: () => source,
		open: () => opened(),
		frame: (name: string, payload: unknown) => handlers.get(name)?.(JSON.stringify(payload)),
	};
}

const coverage = (uncoveredTokens: number, uncoveredCount: number): SessionCoverage => ({
	totalMessages: 6,
	coveredCount: 6 - uncoveredCount,
	uncoveredCount,
	coveredTokens: 500,
	uncoveredTokens,
	running: false,
	lastFoldedAt: null,
});

/** The server as the ring sees it, behind a fetch stub. */
const server = { coverage: coverage(2048, 3), revision: 100, chatReads: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
	const url = String(input);
	if (url === "/api/settings") return Response.json({ settings: null }); // factory: graph on, 4096-token batches
	if (url === "/api/chats/chat_ring") {
		server.chatReads++;
		return Response.json({ coverage: server.coverage });
	}
	if (url === "/api/graph/status") return Response.json({ runs: [], graphDataRevision: server.revision });
	throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;
after(() => {
	globalThis.fetch = realFetch;
});

/** The fill arc's dash, the part of the ring that shows how much is unread. */
const dashOf = (html: string) => /stroke-dasharray="([^"]+)"/.exec(html)?.[1];
const glyph = (fill: number) => dashOf(renderToStaticMarkup(<CoverageRingGlyph fill={fill} running={false} />));
/** Lets fetches settle and the 250 ms event debounce run. */
const settle = (ms = 0) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe("coverage ring refresh", () => {
	it("redraws when graphDataRevision moves with no run row, and refetches nothing when it does not", async () => {
		const src = fakeSource();
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = ReactDOMClient.createRoot(host as unknown as Element);
		await act(async () => {
			root.render(
				<ServerEventsProvider connect={src.connect}>
					<CoverageRing chatId="chat_ring" />
				</ServerEventsProvider>,
			);
		});
		await settle(10);
		assert.ok(dashOf(host.innerHTML) === glyph(0.5), "the ring starts half full: 2048 of 4096 tokens unread");

		// A bot merge: the batch is read, the ledgers change, no run row.
		server.coverage = coverage(0, 0);
		server.revision = 200;
		const before = server.chatReads;
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		assert.ok(server.chatReads > before, "the ring re-read coverage");
		assert.ok(dashOf(host.innerHTML) === glyph(0), "the ring drained");

		// Another lesson's phase change: the revision stays, so no coverage read.
		const reads = server.chatReads;
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		assert.equal(server.chatReads, reads, "no revision move, no coverage read");

		// A reconnect after a missed event catches up.
		server.coverage = coverage(1024, 1);
		server.revision = 300;
		await act(async () => src.open());
		await settle(10);
		assert.ok(dashOf(host.innerHTML) === glyph(0.25), "a (re)connect redraws a missed write");
		await act(async () => root.unmount());
	});
});
