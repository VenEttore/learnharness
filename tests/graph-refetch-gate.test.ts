/**
 * GRAPH REFETCH GATE (fork, external-teacher ticket 31): a model of the graph
 * view's refresh wiring around the real gate, run over many random orders.
 *
 * The model is graph-view.tsx's wiring: a refetch request sets the tick; the
 * fetch effect cancels the fetch out, calls started() and sends a new one; a
 * graph reply lands only if not cancelled (snapshot(), or failed() for a
 * failed one); a status reply calls status(), or sets the tick when a run row
 * left. A deletion sets the tick. The server's stamp moves on each merge and
 * each merge sends a status read, as activity-changed does. Requests read the
 * stamp when the server takes them; replies land later, in any order.
 *
 * After the run drains, the view must show the server's stamp, with a
 * bounded number of graph fetches. With failures, the contract is weaker: a
 * status read sent after the last failure brings the view up to date.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { graphRefetchGate } from "../components/graph-refetch-gate.ts";

function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x9e3779b9) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
		t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
		return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
	};
}

type Request = { kind: "graph" | "status"; stage: "sent" | "read" | "done"; stamp: number; cancelled: boolean; rowLeft: boolean; fails: boolean };

function run(seed: number, opts: { steps: number; failRate: number }) {
	const rand = rng(seed);
	const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
	let server = 100;
	let tick = false;
	let failing = opts.failRate > 0;
	let out: Request | null = null;
	let shown: number | undefined;
	let fetches = 0;
	let statusReads = 0;
	const requests: Request[] = [];
	const gate = graphRefetchGate(() => {
		tick = true;
	});
	const send = (kind: Request["kind"]): Request => {
		const r: Request = {
			kind,
			stage: "sent",
			stamp: -1,
			cancelled: false,
			rowLeft: kind === "status" && rand() < 0.15,
			fails: kind === "graph" && failing && rand() < opts.failRate,
		};
		requests.push(r);
		if (kind === "status") statusReads++;
		return r;
	};
	const effect = () => {
		tick = false;
		if (out) out.cancelled = true;
		gate.started();
		out = send("graph");
		fetches++;
	};
	const land = (r: Request) => {
		r.stage = "done";
		if (r.kind === "graph") {
			if (r.cancelled) return;
			out = null;
			if (r.fails) gate.failed();
			else {
				shown = r.stamp;
				gate.snapshot(r.stamp);
			}
		} else if (r.rowLeft) tick = true;
		else gate.status(r.stamp);
	};
	const moves = (): Array<() => void> => {
		const m: Array<() => void> = [];
		if (tick) m.push(effect);
		for (const r of requests) {
			if (r.stage === "sent") m.push(() => { r.stage = "read"; r.stamp = server; });
			else if (r.stage === "read") m.push(() => land(r));
		}
		return m;
	};
	const drain = () => {
		for (let guard = 0; guard < 10_000; guard++) {
			const m = moves();
			if (m.length === 0) return true;
			pick(m)();
		}
		return false;
	};
	// Mount: the fetch effect, then the status read.
	effect();
	send("status");
	for (let i = 0; i < opts.steps; i++) {
		const m: Array<() => void> = [() => { server++; send("status"); }, ...moves()];
		if (rand() < 0.05) m.push(() => { tick = true; }); // a deletion
		if (rand() < 0.1) m.push(() => { send("status"); }); // a resync or another event
		pick(m)();
	}
	let quiet = drain();
	if (failing) {
		failing = false;
		send("status");
		quiet = drain() && quiet;
	}
	return { quiet, shown, server, fetches, statusReads };
}

describe("graph refetch gate", () => {
	it("always ends showing the server's stamp, over random orders with no failures", () => {
		for (let seed = 1; seed <= 20_000; seed++) {
			const r = run(seed, { steps: 24, failRate: 0 });
			assert.ok(r.quiet, `seed ${seed}: the run drains (no refetch loop)`);
			assert.equal(r.shown, r.server, `seed ${seed}: shows the newest graph`);
			assert.ok(r.fetches <= 2 * r.statusReads + 8, `seed ${seed}: ${r.fetches} fetches for ${r.statusReads} status reads`);
		}
	});

	it("catches up after failed fetches once a status read follows the last failure", () => {
		for (let seed = 1; seed <= 20_000; seed++) {
			const r = run(seed, { steps: 24, failRate: 0.3 });
			assert.ok(r.quiet, `seed ${seed}: the run drains (no retry loop)`);
			assert.equal(r.shown, r.server, `seed ${seed}: shows the newest graph`);
			assert.ok(r.fetches <= 3 * r.statusReads + 8, `seed ${seed}: ${r.fetches} fetches for ${r.statusReads} status reads`);
		}
	});

	it("restarts a fetch that is out when a newer stamp arrives, and lets repeats of its stamp wait", () => {
		let asks = 0;
		const gate = graphRefetchGate(() => asks++);
		gate.started(); // the first load, never settling
		gate.status(100);
		gate.status(100);
		assert.equal(asks, 0, "the first status stamp is checked when the fetch lands");
		gate.status(101);
		assert.equal(asks, 1, "a newer stamp restarts the fetch");
		gate.started();
		gate.status(101);
		gate.status(101);
		assert.equal(asks, 1, "repeats of the stamp the fetch answers for wait for it");
		gate.snapshot(101);
		assert.equal(asks, 1);
	});

	it("retries a failed fetch once for an unshown stamp, then waits for the next status read", () => {
		let asks = 0;
		const gate = graphRefetchGate(() => asks++);
		gate.started();
		gate.snapshot(100);
		gate.status(101);
		assert.equal(asks, 1);
		gate.started();
		gate.failed();
		assert.equal(asks, 2, "one retry for the unshown stamp");
		gate.started();
		gate.failed();
		assert.equal(asks, 2, "no second retry");
		gate.status(101);
		assert.equal(asks, 3, "the next status read refetches");
		gate.started();
		gate.snapshot(101);
		gate.status(101);
		assert.equal(asks, 3);
	});
});
