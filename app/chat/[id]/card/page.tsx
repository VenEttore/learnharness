import { notFound } from "next/navigation";
import { PracticeCardNote, QuestionCard } from "@/components/question-card";
import { questionCardOf } from "@/src/core";
import { getChat } from "@/src/server";

// Fork (external-teacher 22): the read-only question card for phone
// screenshots. Reads the stored record only: no model call, no
// `continue`, no inputs. Works the same for ordinary lessons; practice
// sessions get a note instead (no phases, no question dock).
export const dynamic = "force-dynamic";

export default async function QuestionCardPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const chat = getChat(id);
	if (!chat) notFound();
	if (chat.kind === "practice") return <PracticeCardNote title={chat.title} />;
	return <QuestionCard title={chat.title} card={questionCardOf(chat.messages)} />;
}
