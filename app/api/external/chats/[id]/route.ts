import { showBotLesson } from "@/src/server";

/** The Bot Teacher's lesson read-back (fork, ADR 0001): src/server/bot-run.ts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return showBotLesson(id);
}
