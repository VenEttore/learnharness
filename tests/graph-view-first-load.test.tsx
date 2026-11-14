/**
 * GRAPH VIEW FIRST LOAD (fork, external-teacher ticket 31): a bot merge that
 * lands while the graph view is still on its first load shows without a
 * reload. The real GraphView is mounted under the app's events provider with
 * a fake source and a fake server behind fetch. The server's graph replies
 * carry the graphDataRevision they were read at, as /api/graph does; status
 * replies carry the revision at the moment they were asked for.
 *
 * The merge lands between the first /api/graph read and a status read, in
 * both reply orders, and with two status replies arriving out of order. The
 * view must fetch the graph again and show the new node. A first load with
 * no merge reads the graph once.
 *
 * linkedom as the DOM, as in card-live-refresh.test.tsx. The canvas, its
 * 2D context and the browser's layout observers are stubs: the test reads
 * the chrome row (the node search shows once the graph has nodes), never
 * the drawing.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import * as ReactDOMClient from "react-dom/client";
import { parseHTML } from "linkedom";
import type { GraphNode, GraphSnapshot } from "../src/core/index.ts";

const dom = parseHTML("<!doctype html><html><head></head><body></body></html>");
const g = globalThis as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "HTMLCanvasElement", "SVGElement", "getComputedStyle"]) {
	if (g[k] === undefined) g[k] = (dom as unknown as Record<string, unknown>)[k];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
if (typeof g.getComputedStyle !== "function") g.getComputedStyle = () => ({ getPropertyValue: () => "" });

// A 2D context whose every method is a no-op and every read a harmless value.
const ctx2d: unknown = new Proxy(
	{},
	{
		get: (_t, key) => {
			if (key === "getImageData") return () => ({ data: [0, 0, 0, 0] });
			if (key === "measureText") return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
			if (key === "canvas") return undefined;
			return () => {};
		},
		set: () => true,
	},
);
const canvasProto = (dom as unknown as { HTMLCanvasElement: { prototype: Record<string, unknown> } }).HTMLCanvasElement.prototype;
canvasProto.getContext = () => ctx2d;
g.Path2D ??= class { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} quadraticCurveTo() {} bezierCurveTo() {} addPath() {} };
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
// A frame that fires: d3-timer (the layout simulation) schedules through
// window.requestAnimationFrame, which linkedom's window reads from here, and
// keeps a poke interval alive until a frame runs.
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16);
g.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
g.devicePixelRatio ??= 1;

const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const { GraphView } = await import("../components/graph-view.tsx");

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

const node = (id: string, name: string): GraphNode => ({
	id,
	name,
	statement: `${name} holds.`,
	aliases: [],
	createdAt: "2026-11-14T00:00:00.000Z",
	provenance: [{ chatId: "chat_bot", messageId: "t1" }],
} as unknown as GraphNode);

const snapshotOf = (nodes: GraphNode[]): GraphSnapshot => ({
	nodes,
	propositions: nodes,
	edges: [],
	logicalEdges: [],
	impLinks: [],
	chains: [],
	sessions: { chat_bot: "Bot lesson" },
	fileSources: {},
	nodeSessions: Object.fromEntries(nodes.map((n) => [n.id, ["chat_bot"]])),
	clusters: [],
	positions: Object.fromEntries(nodes.map((n, i) => [n.id, { x: i * 10, y: 0 }])),
} as unknown as GraphSnapshot);

/** The server as the view sees it, behind a fetch stub. A reply holds the
 *  graph and revision of the moment its request reaches the server. Two
 *  kinds of delay: `lateStatus` keeps the next status request from reaching
 *  the server until the test lets it through; `slowGraph` and `slowStatus`
 *  build the next reply on arrival but keep it from the view until
 *  released. */
const server = {
	nodes: [] as GraphNode[],
	revision: 100,
	graphReads: 0,
	statusReads: 0,
	lateStatus: null as null | Array<() => void>,
	slowGraph: null as null | Array<() => void>,
	slowStatus: null as null | Array<() => void>,
	/** The next graph read fails in transport. */
	failGraph: false,
	/** A bot merge: a node lands and the revision moves. */
	merge(n: GraphNode) {
		this.nodes = [...this.nodes, n];
		this.revision += 1;
	},
	reset(nodes: GraphNode[] = []) {
		this.nodes = nodes;
		this.revision = 100;
		this.graphReads = 0;
		this.statusReads = 0;
		this.lateStatus = null;
		this.slowGraph = null;
		this.slowStatus = null;
		this.failGraph = false;
	},
};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
	const url = String(input);
	if (url === "/api/graph") {
		server.graphReads++;
		if (server.failGraph) {
			server.failGraph = false;
			throw new TypeError("fetch failed");
		}
		const reply = Response.json({ ...snapshotOf(server.nodes), graphDataRevision: server.revision });
		const slow = server.slowGraph;
		if (slow) {
			server.slowGraph = null;
			await new Promise<void>((go) => slow.push(go));
		}
		return reply;
	}
	if (url === "/api/graph/status") {
		const late = server.lateStatus;
		if (late) {
			server.lateStatus = null;
			await new Promise<void>((go) => late.push(go));
		}
		server.statusReads++;
		const reply = Response.json({ runs: [], graphDataRevision: server.revision });
		const slow = server.slowStatus;
		if (slow) {
			server.slowStatus = null;
			await new Promise<void>((go) => slow.push(go));
		}
		return reply;
	}
	if (url === "/api/graph/render-settings") return Response.json({});
	if (url === "/api/graph/costs") return Response.json({ runs: [], stages: [] });
	return Response.json({});
}) as typeof fetch;
after(() => {
	globalThis.fetch = realFetch;
});

/** Lets fetches settle and the 250 ms event debounce run. */
const settle = (ms = 0) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const letGo = async (held: Array<() => void>) => {
	for (const go of held.splice(0)) go();
	await settle(10);
};
const showsNodes = (host: { querySelector: (s: string) => unknown }) => host.querySelector('input[aria-label="Search nodes"]') !== null;

async function mount() {
	const src = fakeSource();
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	const root = ReactDOMClient.createRoot(host as unknown as Element);
	await act(async () => {
		root.render(
			<ServerEventsProvider connect={src.connect}>
				<GraphView />
			</ServerEventsProvider>,
		);
	});
	await settle(10);
	return {
		src,
		host,
		unmount: async () => {
			await act(async () => root.unmount());
			host.remove();
		},
	};
}

describe("graph view first load", () => {
	it("shows a bot merge that lands between the first graph read and the first status read", async () => {
		server.reset();
		const lateStatus: Array<() => void> = [];
		server.lateStatus = lateStatus;
		const view = await mount();
		assert.equal(server.graphReads, 1);
		assert.equal(showsNodes(view.host), false, "the first snapshot is the empty graph");
		// The bot merge lands; then the first status request reaches the server.
		server.merge(node("n_bot", "Limit"));
		await letGo(lateStatus);
		assert.equal(server.statusReads, 1);
		assert.equal(server.graphReads, 2, "the view read the graph again");
		assert.equal(showsNodes(view.host), true, "the merged node shows without a reload");
		await view.unmount();
	});

	it("shows the merge when the status reply lands before the first graph reply", async () => {
		server.reset();
		const slowGraph: Array<() => void> = [];
		server.slowGraph = slowGraph;
		const lateStatus: Array<() => void> = [];
		server.lateStatus = lateStatus;
		const view = await mount();
		assert.equal(server.graphReads, 1, "the first graph read was answered from the empty graph");
		server.merge(node("n_bot", "Limit"));
		await letGo(lateStatus);
		assert.equal(server.statusReads, 1, "the status reply, with the merged revision, landed");
		// Now the first graph reply, read before the merge, lands.
		await letGo(slowGraph);
		assert.equal(server.graphReads, 2, "the view read the graph again");
		assert.equal(showsNodes(view.host), true, "the merged node shows without a reload");
		await view.unmount();
	});

	it("shows the merge when two status replies land out of order before the first graph reply", async () => {
		server.reset();
		const slowGraph: Array<() => void> = [];
		server.slowGraph = slowGraph;
		const slowStatus: Array<() => void> = [];
		server.slowStatus = slowStatus;
		const view = await mount();
		assert.equal(server.graphReads, 1, "the first graph read was answered from the empty graph");
		assert.equal(server.statusReads, 1, "the mount status read was answered before the merge");
		// The merge lands before the events channel opens; the channel's
		// resync status read sees it, and its reply lands first.
		server.merge(node("n_bot", "Limit"));
		view.src.open();
		await settle(20);
		assert.equal(server.statusReads, 2);
		await letGo(slowStatus); // the mount read's older reply lands last
		await letGo(slowGraph); // then the first graph reply, read before the merge
		assert.equal(server.graphReads, 2, "the view read the graph again");
		assert.equal(showsNodes(view.host), true, "the merged node shows without a reload");
		await view.unmount();
	});

	it("shows a later merge after the first graph read failed", async () => {
		server.reset();
		server.failGraph = true;
		const realError = console.error;
		console.error = () => {}; // the view logs the failed fetch
		try {
			const view = await mount();
			assert.equal(server.statusReads, 1);
			assert.equal(server.graphReads, 2, "the first graph read failed; the first status read retried it");
			assert.equal(showsNodes(view.host), false);
			server.merge(node("n_bot", "Limit"));
			view.src.open();
			await settle(50);
			assert.equal(server.statusReads, 2);
			assert.equal(server.graphReads, 3, "the moved stamp refetched the graph");
			assert.equal(showsNodes(view.host), true, "the merged node shows without a reload");
			await view.unmount();
		} finally {
			console.error = realError;
		}
	});

	it("lets a refetch finish while status reads keep arriving", async () => {
		server.reset([node("n_old", "Old")]);
		const view = await mount();
		view.src.open();
		await settle(50);
		assert.equal(server.graphReads, 1);
		server.merge(node("n_new", "New"));
		const slowGraph: Array<() => void> = [];
		server.slowGraph = slowGraph;
		view.src.frame("activity-changed", {});
		await settle(300);
		assert.equal(server.graphReads, 2, "the moved stamp started one refetch");
		// More activity while the refetch is out: each status read sees the
		// merged stamp, which the refetch already asked for.
		for (let i = 0; i < 3; i++) {
			view.src.frame("activity-changed", {});
			await settle(300);
		}
		assert.equal(server.statusReads, 6);
		assert.equal(server.graphReads, 2, "status reads during the refetch did not restart it");
		await letGo(slowGraph);
		assert.equal(server.graphReads, 2, "the landed refetch carries the merged stamp: no further read");
		await view.unmount();
	});

	it("reads the graph once on a first load with no merge, and refetches once on a later move", async () => {
		server.reset([node("n_old", "Old")]);
		const view = await mount();
		assert.equal(server.statusReads, 1);
		assert.equal(server.graphReads, 1, "no extra graph read when nothing moved");
		assert.equal(showsNodes(view.host), true);
		// The events channel opens: its resync status read sees no move.
		view.src.open();
		await settle(50);
		assert.equal(server.statusReads, 2);
		assert.equal(server.graphReads, 1, "a status read with the shown stamp refetches nothing");
		// A later bot merge announces itself only through activity-changed.
		server.merge(node("n_new", "New"));
		view.src.frame("activity-changed", {});
		await settle(300);
		assert.equal(server.statusReads, 3);
		assert.equal(server.graphReads, 2, "the revision move refetches once");
		await view.unmount();
	});
});
