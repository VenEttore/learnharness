/**
 * BOT-RUN LESSONS (fork, ADR 0001): a lesson with driver "external" is
 * taught by an outside Bot Teacher through LearnHarness's HTTP API, never
 * by LearnHarness's own model. This module holds that logic; the chat
 * handler makes one early return into it, right after it reads the record.
 *
 * Page input here is saved and nothing else happens: no model or key
 * gate, no compaction, no turn start. Everything is synchronous from the
 * record read to the write, so no other writer can land in between.
 */

import type { ChatRecord } from "../core/contracts.ts";
import { emit } from "../core/events.ts";
import { ChatInputError, inputAppends, type TurnInput } from "../core/input-events.ts";
import type { LhMessage } from "../core/native-messages.ts";
import { stores } from "./stores.ts";
import { settledTurnResponse } from "./turn-runs.ts";

/** The refusal code every bot-run refusal carries. */
export const BOT_RUN_LESSON_CODE = "bot_run_lesson";

export function isBotRun(record: Pick<ChatRecord, "driver">): boolean {
	return record.driver === "external";
}

/** THE ONE BOT-RUN WRITE: save the messages, then announce both the record
 *  change (the open page refetches) and the list change (the sidebar's
 *  phase and question-waiting state). Bot-run writes have no turn events
 *  to carry the sidebar refresh, hence the exception to the store's
 *  silence law. */
export function commitBotRun(chatId: string, messages: LhMessage[]): void {
	stores.chatStore.saveMessages(chatId, messages);
	emit("record-changed", { chatId });
	emit("chats-changed", {});
}

function refusal(error: string, status: number): Response {
	return Response.json({ error, code: BOT_RUN_LESSON_CODE }, { status });
}

/** Page input on a bot-run lesson: append it with the ordinary input
 *  logic and settle at once. `continue` and `retry` would ask for a model
 *  turn, so they are 422 (409 reads to the page as "turn running" and it
 *  resends). Server-origin inputs never belong here: 400. */
export function handleBotRunInput(record: ChatRecord, input: TurnInput): Response {
	switch (input.type) {
		case "continue":
		case "retry":
			return refusal(`A bot-run lesson has no model turn to ${input.type}.`, 422);
		case "steers":
			return refusal("A bot-run lesson takes only page input.", 400);
	}
	let appends: LhMessage[];
	try {
		appends = inputAppends(record, input);
	} catch (err) {
		if (err instanceof ChatInputError) return Response.json({ error: err.message }, { status: 400 });
		throw err;
	}
	try {
		commitBotRun(record.id, [...record.messages, ...appends]);
	} catch (err) {
		console.error(`[chat ${record.id}] bot-run persist failed:`, err);
		return new Response("Your input could not be saved. Please try again.", { status: 500 });
	}
	return settledTurnResponse();
}
