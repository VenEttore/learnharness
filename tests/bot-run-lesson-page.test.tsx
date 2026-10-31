/**
 * BOT-RUN LESSON PAGE (fork, ADR 0001; external-teacher ticket 04): the
 * lesson page reads `driver` off the stored record and hands the chat view
 * `botRun`. Calls the page's server component under an isolated
 * LH_DATA_DIR and reads the props of the view it returns, so dropping the
 * prop from app/chat/[id]/page.tsx fails here. Every app-module import is
 * dynamic: the seam must be set before config.ts loads.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-bot-run-lesson-page-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { default: ChatPage } = await import("../app/chat/[id]/page.tsx");
const { chatStore } = await import("../src/store/chats.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

async function viewProps(chatId: string): Promise<Record<string, unknown>> {
	const el = (await ChatPage({
		params: Promise.resolve({ id: chatId }),
		searchParams: Promise.resolve({}),
	})) as React.ReactElement<Record<string, unknown>>;
	return el.props;
}

describe("lesson page: botRun from the record", () => {
	it("a lesson with driver external renders the view with botRun", async () => {
		const chat = chatStore.createChat("bot page", undefined, { driver: "external", externalKey: "key-bot-page" });
		assert.equal((await viewProps(chat.id)).botRun, true);
	});

	it("an ordinary lesson renders the view without botRun", async () => {
		const chat = chatStore.createChat("plain page");
		assert.equal((await viewProps(chat.id)).botRun, false);
	});
});
