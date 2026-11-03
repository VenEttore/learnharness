"use client";

import { useRouter } from "next/navigation";
import { useServerEvent, useServerResync } from "@/components/server-events";

/**
 * The question card's own refresh (fork, external-teacher ticket 25). The
 * card page is a server-rendered snapshot of the record; this re-renders
 * it when the lesson changes, on the same events the lesson page refetches
 * on: record-changed (bot-run turns, page answers in a bot-run lesson, a
 * skip) and turn-settled (an ordinary lesson's model turn), for this
 * lesson only, plus a resync when the events channel (re)connects.
 * router.refresh re-renders the server component and keeps the page's
 * client state; the card's fit pass watches its own DOM, so new content
 * is fitted again.
 */
export function CardLiveRefresh({ chatId }: { chatId: string }) {
	const router = useRouter();
	useServerEvent("record-changed", (p) => {
		if (p.chatId === chatId) router.refresh();
	});
	useServerEvent("turn-settled", (p) => {
		if (p.chatId === chatId) router.refresh();
	});
	useServerResync(() => router.refresh());
	return null;
}
