/**
 * BOT-RUN LESSON VIEW (fork, ADR 0001; external-teacher ticket 04): the
 * full chat view mounted on a keyless install. A bot-run lesson sends what
 * the owner types and shows no "add a key" prompt; the same keyless view
 * on an ordinary lesson still opens setup instead (the control).
 *
 * linkedom as the DOM, as in render-update-banner.test.tsx.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import * as ReactDOMClient from "react-dom/client";
import { act } from "react";
import { parseHTML } from "linkedom";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";

const dom = parseHTML("<!doctype html><html><head></head><body></body></html>");
const g = globalThis as Record<string, unknown>;
for (const k of ["window", "document", "HTMLElement", "Element", "Node", "MutationObserver"]) {
	if (g[k] === undefined) g[k] = (dom as unknown as Record<string, unknown>)[k];
}
// The view dispatches events on linkedom's window: Node's own Event and
// CustomEvent classes are not accepted there.
g.Event = dom.Event;
g.CustomEvent = dom.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;
// Browser APIs the chat view's layout hooks call that linkedom lacks.
g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame ??= (id: number) => clearTimeout(id);
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
g.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
(dom.window as unknown as Record<string, unknown>).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
g.matchMedia ??= (dom.window as unknown as Record<string, unknown>).matchMedia;
g.getComputedStyle ??= () => ({ getPropertyValue: () => "", overflow: "auto" });
(dom.window as unknown as Record<string, unknown>).getComputedStyle ??= g.getComputedStyle;
((dom.window as unknown as { HTMLElement: { prototype: Record<string, unknown> } }).HTMLElement.prototype).getAnimations ??= () => [];
(dom.window as unknown as Record<string, unknown>).location ??= new URL("http://localhost/chat/chat_x");
g.location ??= (dom.window as unknown as Record<string, unknown>).location;

/** POSTs to /api/chat this test saw, by input type; "steer" for a steer,
 *  "abort" for a turn abort. */
const posts: string[] = [];
/** Holds the stream attach open, so the view stays busy after a send. */
let streamDelayMs = 0;
/** The record the page refetches after a send (e.g. a question the bot
 *  wrote meanwhile); absent = an empty answer. */
let recordAfterSend: unknown[] | undefined;
const realFetch = globalThis.fetch;

before(() => {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url === "/api/chat") {
			posts.push(JSON.parse(String(init?.body)).input.type);
			return Response.json({ ok: true });
		}
		if (url === "/api/chats/chat_x" && recordAfterSend && posts.length > 0) return Response.json({ messages: recordAfterSend });
		if (url === "/api/activity/abort") {
			posts.push("abort");
			return Response.json({ error: "not_running" }, { status: 409 });
		}
		// Faithful to the steer route: a bot-run lesson has no live turn.
		if (url.endsWith("/steer")) {
			posts.push("steer");
			return Response.json({ error: "no live turn to steer" }, { status: 409 });
		}
		if (url.endsWith("/stream") && streamDelayMs) await new Promise((r) => setTimeout(r, streamDelayMs));
		// A keyless install: the catalog says no provider has a key.
		if (url.startsWith("/api/models")) return Response.json({ providers: [{ id: "openrouter", keyPresent: false }], models: [], slots: {} });
		return Response.json({});
	}) as typeof globalThis.fetch;
});
after(() => {
	globalThis.fetch = realFetch;
});

/** No server pushes in this test. */
const quietSource = (): NotifySource => ({ close() {}, onOpen() {}, onEvent() {} });

async function mount(botRun: boolean) {
	const { Chat } = await import("../components/chat.tsx");
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = ReactDOMClient.createRoot(host);
	await act(async () => {
		root.render(
			<ServerEventsProvider connect={quietSource}>
				<Chat chatId="chat_x" title="Lesson" initialMessages={[]} botRun={botRun} />
			</ServerEventsProvider>,
		);
	});
	await act(async () => {
		await new Promise((r) => setTimeout(r, 20));
	});
	return { host, root };
}

/** Type into the composer the way React sees it, then click Send. */
async function typeAndSend(host: HTMLElement, text: string) {
	const box = host.querySelector('[data-testid="composer"] [role="textbox"]');
	assert.ok(box, "the composer renders");
	await act(async () => {
		box.textContent = text;
		box.dispatchEvent(new Event("input", { bubbles: true }));
	});
	const form = host.querySelector('[data-testid="composer"]')!;
	assert.ok(form?.querySelector('button[aria-label="Send"]'), "the send button renders");
	await act(async () => {
		// The Send button submits the composer form; linkedom does not run
		// a button's default action, so submit the form directly.
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await new Promise((r) => setTimeout(r, 20));
	});
}

function testIds(): string[] {
	return [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")!);
}

// The control runs first: it also proves the keyless catalog has loaded
// (the catalog is a module-level cache), so the bot-run case below sees
// the same zero-keys truth an ordinary lesson does.
describe("keyless install: the chat view", () => {
	it("control: an ordinary lesson shows the add-key prompt and opens setup instead of sending", async () => {
		posts.length = 0;
		const { host, root } = await mount(false);
		assert.ok(testIds().includes("setup-cta-keys"), "the add-key prompt rides the composer");
		await typeAndSend(host, "hello");
		assert.deepEqual(posts, []);
		assert.ok(testIds().includes("setup-dialog"), "send opens the setup dialog");
		await act(async () => root.unmount());
		host.remove();
	});

	it("a bot-run lesson sends typed text and shows no add-key prompt", async () => {
		posts.length = 0;
		const { host, root } = await mount(true);
		assert.ok(!testIds().includes("setup-cta-keys"), "no add-key prompt");
		assert.ok(!testIds().includes("setup-cta"), "no set-up-models prompt");
		await typeAndSend(host, "my answer");
		assert.deepEqual(posts, ["text"], "the typed text is posted, and nothing else");
		assert.ok(!testIds().includes("setup-dialog"), "send never opens setup");
		assert.ok(testIds().includes("user-message"), "the sent text shows in the transcript");
		await act(async () => root.unmount());
		host.remove();
	});

	it("a bot-run lesson keeps a second message typed while the first send settles", async () => {
		posts.length = 0;
		streamDelayMs = 300;
		const { host, root } = await mount(true);
		await typeAndSend(host, "first");
		await typeAndSend(host, "second");
		const box = host.querySelector('[data-testid="composer"] [role="textbox"]');
		assert.ok(!posts.includes("steer"), "no steer: a bot-run lesson has no live turn to take one");
		assert.equal(box?.textContent, "second", "the unsent text stays in the composer");
		streamDelayMs = 0;
		await act(async () => {
			await new Promise((r) => setTimeout(r, 400));
		});
		await act(async () => root.unmount());
		host.remove();
	});

	it("a bot-run lesson offers no Stop and aborts nothing while a send settles", async () => {
		posts.length = 0;
		streamDelayMs = 300;
		const { host, root } = await mount(true);
		await typeAndSend(host, "first");
		const form = host.querySelector('[data-testid="composer"]')!;
		assert.ok(!form.querySelector('button[aria-label="Stop"]'), "no Stop button: there is no turn to stop");
		await act(async () => {
			// Enter on the empty composer, then Esc.
			form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			window.dispatchEvent(new CustomEvent("lh:kbd-abort-turn"));
			await new Promise((r) => setTimeout(r, 20));
		});
		assert.deepEqual(posts, ["text"], "no turn abort is posted");
		assert.ok(!testIds().includes("abort-turn-dialog"), "Esc offers no turn abort");
		streamDelayMs = 0;
		await act(async () => {
			await new Promise((r) => setTimeout(r, 400));
		});
		await act(async () => root.unmount());
		host.remove();
	});

	it("a bot-run lesson's question dismissal promises no turn stop while a send settles", async () => {
		posts.length = 0;
		streamDelayMs = 300;
		// The bot asked a question while the owner's send was settling.
		recordAfterSend = [{
			id: "a1",
			role: "assistant",
			content: [{ type: "toolCall", id: "q1", name: "quiz", arguments: { question: "Q?" } }],
			stopReason: "toolUse",
			usage: { input: 0, output: 0, total: 0, cacheReads: 0, cacheWrites: 0 },
			timestamp: 0,
			provider: "external",
			model: "bot",
		}];
		const { host, root } = await mount(true);
		await typeAndSend(host, "first");
		await act(async () => {
			window.dispatchEvent(new CustomEvent("lh:kbd-abort-turn"));
			await new Promise((r) => setTimeout(r, 20));
		});
		assert.ok(testIds().includes("abort-turn-dialog"), "Esc opens the question dismissal");
		const copy = document.querySelector('[data-testid="abort-turn-line"]')?.textContent ?? "";
		assert.doesNotMatch(copy, /working turn stops/, "a bot-run lesson has no turn to stop");
		await act(async () => {
			document.querySelector<HTMLButtonElement>('[data-testid="abort-turn-confirm"]')?.click();
			await new Promise((r) => setTimeout(r, 20));
		});
		assert.ok(!posts.includes("abort"), "confirming posts no turn abort");
		streamDelayMs = 0;
		recordAfterSend = undefined;
		await act(async () => {
			await new Promise((r) => setTimeout(r, 400));
		});
		await act(async () => root.unmount());
		host.remove();
	});
});
