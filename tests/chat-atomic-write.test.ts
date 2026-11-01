/**
 * ATOMIC CHAT WRITES (external-teacher 16): a chat save cut off partway
 * (disk full, crash) must leave the previous chat file whole and readable,
 * and leave no temp file behind in the chats directory. Runs under an
 * isolated LH_DATA_DIR set before any config-loading import.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-chat-atomic-write-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { PATHS } = await import("../config.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

describe("chat store writes are atomic", () => {
	it("a save that fails partway (ENOSPC) leaves the previous chat intact and no temp file", (t) => {
		const chat = chatStore.createChat("Atomic write fixture");
		chatStore.saveMessages(chat.id, [{ role: "user", content: "first message", timestamp: 1 }] as never);
		const file = path.join(PATHS.chats, `${chat.id}.json`);
		const before = fs.readFileSync(file, "utf-8");
		const listedBefore = fs.readdirSync(PATHS.chats).sort();

		// Simulate a disk that fills up mid-write: half the bytes land, then ENOSPC.
		const realWrite = fs.writeFileSync;
		t.mock.method(fs, "writeFileSync", (target: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
			const text = String(data);
			realWrite(target, text.slice(0, Math.floor(text.length / 2)), options);
			throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
		});
		syncBuiltinESMExports();
		try {
			assert.throws(
				() => chatStore.saveMessages(chat.id, [{ role: "user", content: "second message ".repeat(200), timestamp: 2 }] as never),
				/ENOSPC/,
			);
		} finally {
			t.mock.restoreAll();
			syncBuiltinESMExports();
		}

		assert.equal(fs.readFileSync(file, "utf-8"), before, "the previous chat file is byte-identical");
		const reread = chatStore.getChat(chat.id);
		assert.ok(reread, "the chat still reads");
		assert.equal(reread.title, "Atomic write fixture");
		assert.equal(reread.messages.length, 1);
		assert.deepEqual(fs.readdirSync(PATHS.chats).sort(), listedBefore, "no temp file left behind");
	});

	it("a normal save replaces the file and leaves only the chat file", () => {
		const chat = chatStore.createChat("Atomic write happy path");
		chatStore.saveMessages(chat.id, [{ role: "user", content: "hello", timestamp: 1 }] as never);
		const reread = chatStore.getChat(chat.id);
		assert.equal(reread?.messages.length, 1);
		assert.ok(
			fs.readdirSync(PATHS.chats).every((f) => f.endsWith(".json")),
			"no temp files in the chats directory",
		);
	});
});
