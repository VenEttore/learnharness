import { externalRequestRefusal, createBotLesson } from "@/src/server";

/** The Bot Teacher's lesson create (fork, ADR 0001): src/server/bot-run.ts. */
export async function POST(req: Request) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	const body: unknown = await req.json().catch(() => null);
	return createBotLesson(body);
}
