import { notFound } from "next/navigation";
import { CardLiveRefresh } from "@/components/card-live-refresh";
import { PracticeCardNote, QuestionCard } from "@/components/question-card";
import { questionCardOf } from "@/src/core";
import { getChat } from "@/src/server";

// Fork (external-teacher 22): the read-only question card for phone
// screenshots. Reads the stored record only: no model call, no
// `continue`, no inputs. Works the same for ordinary lessons; practice
// sessions get a note instead (no phases, no question dock). A lesson's
// card re-renders itself when the lesson changes (ticket 25).
export const dynamic = "force-dynamic";

export default async function QuestionCardPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const chat = getChat(id);
	if (!chat) notFound();
	if (chat.kind === "practice") return <PracticeCardNote title={chat.title} />;
	return (
		<>
			<CardLiveRefresh chatId={chat.id} />
			<QuestionCard title={chat.title} card={questionCardOf(chat.messages)} />
		</>
	);
}
