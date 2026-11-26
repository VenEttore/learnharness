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
// AppShell provides interaction layers since upstream 0.6.0.
import { InteractionLayersProvider } from "../components/interaction-layers.tsx";
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

/** The server as the ring sees it, behind a fetch stub. A status reply
 *  carries the revision at the moment it was asked for. While `held` is a
 *  list, status replies wait there until the test releases them. */
const server = {
	coverage: coverage(2048, 3),
	revision: 100,
	chatReads: 0,
	statusReads: 0,
	held: null as null | Array<() => void>,
	/** The next status read fails in transport. */
	failNext: false,
};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
	const url = String(input);
	if (url === "/api/settings") return Response.json({ settings: null }); // factory: graph on, 4096-token batches
	if (url === "/api/chats/chat_ring") {
		server.chatReads++;
		return Response.json({ coverage: server.coverage });
	}
	if (url === "/api/graph/status") {
		server.statusReads++;
		if (server.failNext) {
			server.failNext = false;
			throw new TypeError("fetch failed");
		}
		const reply = Response.json({ runs: [], graphDataRevision: server.revision });
		if (server.held) await new Promise<void>((release) => server.held!.push(release));
		return reply;
	}
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

/** Mounts the ring under the events provider with a fresh fake source. */
async function mountRing() {
	const src = fakeSource();
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	const root = ReactDOMClient.createRoot(host as unknown as Element);
	await act(async () => {
		root.render(
			<ServerEventsProvider connect={src.connect}>
				<InteractionLayersProvider>
					<CoverageRing chatId="chat_ring" />
				</InteractionLayersProvider>
			</ServerEventsProvider>,
		);
	});
	await settle(10);
	return { src, host, root };
}

describe("coverage ring refresh", () => {
	it("redraws when graphDataRevision moves with no run row, and refetches nothing when it does not", async () => {
		const src = fakeSource();
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = ReactDOMClient.createRoot(host as unknown as Element);
		await act(async () => {
			root.render(
				<ServerEventsProvider connect={src.connect}>
					<InteractionLayersProvider>
						<CoverageRing chatId="chat_ring" />
					</InteractionLayersProvider>
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

		// Unmounted while an event's status read waits on its debounce: the
		// read is cancelled.
		const statusReads = server.statusReads;
		await act(async () => src.frame("activity-changed", {}));
		await act(async () => root.unmount());
		await settle(400);
		assert.equal(server.statusReads, statusReads, "no status read after unmount");
	});

	it("redraws a write that lands before its first status reply, with no event", async () => {
		server.coverage = coverage(2048, 3);
		server.revision = 400;
		server.held = [];
		const { host, root } = await mountRing();
		assert.equal(dashOf(host.innerHTML), glyph(0.5), "first coverage read: half full");
		assert.equal(server.held.length, 1, "the first status read is waiting");

		// A bot merge lands after the ring's coverage read; its event came
		// before anything listened. Only the first status reply is left.
		server.coverage = coverage(0, 0);
		server.revision = 500;
		const held = server.held;
		server.held = null;
		await act(async () => held.forEach((release) => release()));
		await settle(10);
		assert.equal(dashOf(host.innerHTML), glyph(0), "the first status reply re-read coverage, so the ring drained");
		await act(async () => root.unmount());
	});

	it("ignores a status reply that arrives after a newer one", async () => {
		server.coverage = coverage(2048, 3);
		server.revision = 600;
		server.held = null;
		const { src, root } = await mountRing();

		// Two merges, two status reads; the replies arrive newest first.
		server.held = [];
		server.revision = 700;
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		server.revision = 800;
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		const [older, newer] = server.held;
		assert.ok(older && newer, "two status reads are waiting");
		server.held = null;
		await act(async () => newer());
		await settle(10);
		await act(async () => older());
		await settle(10);

		// Nothing changed since revision 800, so an event reads no coverage.
		const reads = server.chatReads;
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		assert.equal(server.chatReads, reads, "the late, older reply did not reset the revision");
		await act(async () => root.unmount());
	});

	it("applies an older reply when the newer read fails", async () => {
		server.coverage = coverage(2048, 3);
		server.revision = 900;
		server.held = null;
		const { src, host, root } = await mountRing();

		// A merge; its status read waits. A reconnect's newer read fails.
		server.coverage = coverage(0, 0);
		server.revision = 1000;
		server.held = [];
		await act(async () => src.frame("activity-changed", {}));
		await settle(400);
		server.failNext = true;
		await act(async () => src.open());
		await settle(10);
		const [older] = server.held;
		assert.ok(older, "the event's status read is waiting");
		server.held = null;
		await act(async () => older());
		await settle(10);
		assert.equal(dashOf(host.innerHTML), glyph(0), "the older reply, the only one that arrived, redrew the ring");
		await act(async () => root.unmount());
	});
});
