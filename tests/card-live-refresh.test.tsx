/**
 * CARD LIVE REFRESH (fork, external-teacher ticket 25): an open question
 * card re-renders when its own lesson changes. The listener is mounted
 * under the app's events provider with a fake source, and under Next's
 * router context with a refresh spy; frames for this lesson refresh it,
 * frames for another lesson do not, and a (re)connect refreshes it.
 *
 * linkedom as the DOM, as in render-bot-run-lesson.test.tsx.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as ReactDOMClient from "react-dom/client";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { CardLiveRefresh } from "../components/card-live-refresh.tsx";

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

describe("card live refresh", () => {
	it("refreshes on its lesson's record and turn events and on reconnect, not on another lesson's", async () => {
		const src = fakeSource();
		let refreshes = 0;
		const router = { refresh: () => { refreshes++; } } as unknown as React.ContextType<typeof AppRouterContext>;
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = ReactDOMClient.createRoot(host as unknown as Element);
		await act(async () => {
			root.render(
				<AppRouterContext.Provider value={router}>
					<ServerEventsProvider connect={src.connect}>
						<CardLiveRefresh chatId="chat_card" />
					</ServerEventsProvider>
				</AppRouterContext.Provider>,
			);
		});
		assert.equal(refreshes, 0, "mounting alone fetches nothing");
		await act(async () => src.frame("record-changed", { chatId: "chat_other" }));
		await act(async () => src.frame("turn-settled", { chatId: "chat_other" }));
		await act(async () => src.frame("chats-changed", {}));
		assert.equal(refreshes, 0, "another lesson's changes and list changes do not refresh");
		await act(async () => src.frame("record-changed", { chatId: "chat_card" }));
		assert.equal(refreshes, 1);
		await act(async () => src.frame("turn-settled", { chatId: "chat_card" }));
		assert.equal(refreshes, 2);
		await act(async () => src.open());
		assert.equal(refreshes, 3, "a (re)connect refetches");
		await act(async () => root.unmount());
	});
});
