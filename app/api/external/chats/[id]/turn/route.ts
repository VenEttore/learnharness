import { externalRequestRefusal, botTurn } from "@/src/server";

/** The Bot Teacher's turn (fork, ADR 0001): src/server/bot-run.ts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const refused = externalRequestRefusal(req);
	if (refused) return refused;
	const { id } = await params;
	const body: unknown = await req.json().catch(() => null);
	return botTurn(id, body);
}
