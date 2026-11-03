import type { ReactNode } from "react";
import { CardLiveRefresh } from "@/components/card-live-refresh";

// Fork (external-teacher 25): an open card re-renders itself when its
// lesson changes. The page stays a plain snapshot of the record; this
// layout adds the client listener that refreshes it.
export default async function QuestionCardLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<>
			<CardLiveRefresh chatId={id} />
			{children}
		</>
	);
}
