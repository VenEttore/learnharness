import { botAnswer } from "@/src/server";

/** The Bot Teacher's read of learner input (fork, ADR 0001): src/server/bot-run.ts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return botAnswer(id);
}
